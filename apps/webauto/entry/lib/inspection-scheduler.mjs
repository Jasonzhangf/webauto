// inspection-scheduler.mjs — Daemon Inspection Scheduler
// Periodically checks job health and auto-resumes eligible failed/stopped XHS tasks.
import { randomUUID } from 'node:crypto';

export class InspectionScheduler {
  /**
   * @param {object} opts
   * @param {number} [opts.intervalMs=60_000]  - inspection tick interval
   * @param {number} [opts.maxResumeAttempts=3] - max resume attempts per job
   * @param {number} [opts.maxTotalRounds=360]  - max total inspection rounds per job
   * @param {(event: string, data?: object) => void} [opts.logger] - optional pluggable logger
   */
  constructor(opts = {}) {
    const intervalRaw = Number(opts.intervalMs);
    const maxResumeRaw = Number(opts.maxResumeAttempts);
    const maxRoundsRaw = Number(opts.maxTotalRounds);
    this.intervalMs = Math.max(1000, Number.isFinite(intervalRaw) ? intervalRaw : 60_000);
    this.maxResumeAttempts = Math.max(1, Number.isFinite(maxResumeRaw) ? maxResumeRaw : 3);
    this.maxTotalRounds = Math.max(1, Number.isFinite(maxRoundsRaw) ? maxRoundsRaw : 360);
    this.logger = typeof opts.logger === 'function' ? opts.logger : null;

    /** @type {Map<string, InspectionState>} */
    this._inspections = new Map();
    this._destroyed = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start periodic inspection for a job.
   * @param {object} params
   * @param {string} params.jobId
   * @param {() => { status: string, args?: string[], code?: number|null }} params.getJobStatus
   * @param {(resumeArgs: string[]) => Promise<void>} params.onResubmit
   * @param {(summary: object) => void} params.onComplete
   * @returns {{ ok: true, inspectionId: string }}
   */
  startInspection({ jobId, getJobStatus, onResubmit, onComplete }) {
    if (this._destroyed) {
      throw new Error('InspectionScheduler has been destroyed');
    }

    const id = `${jobId}__${randomUUID().slice(0, 8)}`;
    const state = {
      id,
      jobId,
      timer: null,
      startedAt: Date.now(),
      rounds: 0,
      resumeAttempts: 0,
      getJobStatus,
      onResubmit,
      onComplete,
      status: 'active', // active | terminated
    };

    // Replace existing inspection for the same jobId
    if (this._inspections.has(jobId)) {
      this.stopInspection(jobId);
    }

    this._inspections.set(jobId, state);
    this._log('inspection_start', { jobId, id, intervalMs: this.intervalMs });
    state.timer = setTimeout(() => this._tick(jobId), this.intervalMs);
    if (state.timer && typeof state.timer.unref === 'function') {
      state.timer.unref();
    }
    return { ok: true, inspectionId: id };
  }

  /**
   * Stop inspection for a specific job.
   * @param {string} jobId
   * @returns {boolean} true if was actively stopped
   */
  stopInspection(jobId) {
    const state = this._inspections.get(jobId);
    if (!state || state.status !== 'active') return false;
    this._clearTimer(state);
    state.status = 'terminated';
    this._inspections.delete(jobId);
    this._log('inspection_stop', { jobId, id: state.id, rounds: state.rounds });
    return true;
  }

  /** Stop all active inspections. */
  stopAll() {
    for (const [jobId] of this._inspections) {
      this.stopInspection(jobId);
    }
  }

  /** Stop all inspections and mark scheduler as destroyed. */
  destroy() {
    this.stopAll();
    this._destroyed = true;
    this._log('inspection_scheduler_destroy', {});
  }

  /**
   * Get the current state for a specific job's inspection.
   * @param {string} jobId
   * @returns {object|null}
   */
  getInspectionState(jobId) {
    const state = this._inspections.get(jobId);
    if (!state) return null;
    return {
      id: state.id,
      jobId: state.jobId,
      status: state.status,
      startedAt: state.startedAt,
      rounds: state.rounds,
      resumeAttempts: state.resumeAttempts,
    };
  }

  /**
   * List all inspections.
   * @returns {Array<object>}
   */
  listInspections() {
    const result = [];
    for (const state of this._inspections.values()) {
      result.push({
        id: state.id,
        jobId: state.jobId,
        status: state.status,
        startedAt: state.startedAt,
        rounds: state.rounds,
        resumeAttempts: state.resumeAttempts,
      });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal tick logic
  // ---------------------------------------------------------------------------

  /**
   * Core inspection tick.
   * - running: skip (still running, no action needed)
   * - completed: terminate inspection and call onComplete
   * - failed / stopped: attempt resume via onResubmit (if attempts remaining)
   * - unknown / invalid: terminate with error log
   * @param {string} jobId
   */
  async _tick(jobId) {
    const state = this._inspections.get(jobId);
    if (!state || state.status !== 'active') return;

    state.rounds++;
    this._log('inspection_tick', { jobId, round: state.rounds, maxRounds: this.maxTotalRounds });

    // Check max rounds
    if (state.rounds >= this.maxTotalRounds) {
      this._log('inspection_max_rounds', { jobId, rounds: state.rounds });
      state.status = 'terminated';
      this._inspections.delete(jobId);
      try {
        state.onComplete({ jobId, reason: 'max_rounds_exceeded', rounds: state.rounds });
      } catch (_) { /* swallow */ }
      return;
    }

    // Get current job status
    let jobInfo;
    try {
      jobInfo = state.getJobStatus();
    } catch (err) {
      this._log('inspection_get_status_error', { jobId, error: err?.message || String(err) });
      // Keep inspecting - might recover
      this._scheduleNext(state, jobId);
      return;
    }

    if (!jobInfo || typeof jobInfo !== 'object' || !jobInfo.status) {
      this._log('inspection_invalid_status', { jobId, data: jobInfo });
      this._scheduleNext(state, jobId);
      return;
    }

    const { status: jobStatus } = jobInfo;

    // --- running: skip ---
    if (jobStatus === 'running') {
      this._log('inspection_job_running', { jobId, round: state.rounds });
      this._scheduleNext(state, jobId);
      return;
    }

    // --- completed: terminate ---
    if (jobStatus === 'completed') {
      this._log('inspection_job_completed', { jobId, rounds: state.rounds });
      this._clearTimer(state);
      state.status = 'terminated';
      this._inspections.delete(jobId);
      try {
        state.onComplete({ jobId, reason: 'completed', status: jobStatus, rounds: state.rounds });
      } catch (_) { /* swallow */ }
      return;
    }

    // --- failed / stopped: attempt resume ---
    if (jobStatus === 'failed' || jobStatus === 'stopped') {
      if (state.resumeAttempts >= this.maxResumeAttempts) {
        this._log('inspection_max_resume', { jobId, attempts: state.resumeAttempts, jobStatus });
        this._clearTimer(state);
        state.status = 'terminated';
        this._inspections.delete(jobId);
        try {
          state.onComplete({ jobId, reason: 'max_resume_exceeded', status: jobStatus, rounds: state.rounds, resumeAttempts: state.resumeAttempts });
        } catch (_) { /* swallow */ }
        return;
      }

      const originalArgs = Array.isArray(jobInfo.args) ? jobInfo.args : [];
      const resumeArgs = this._buildResumeArgs(originalArgs);

      if (!resumeArgs) {
        this._log('inspection_resume_not_eligible', { jobId, args: originalArgs });
        this._clearTimer(state);
        state.status = 'terminated';
        this._inspections.delete(jobId);
        try {
          state.onComplete({ jobId, reason: 'not_resume_eligible', status: jobStatus, rounds: state.rounds });
        } catch (_) { /* swallow */ }
        return;
      }

      state.resumeAttempts++;
      this._log('inspection_resume_attempt', { jobId, attempt: state.resumeAttempts, max: this.maxResumeAttempts, jobStatus });

      try {
        await state.onResubmit(resumeArgs);
        this._log('inspection_resubmit_ok', { jobId, attempt: state.resumeAttempts });
      } catch (err) {
        this._log('inspection_resubmit_failed', { jobId, attempt: state.resumeAttempts, error: err?.message || String(err) });
        // Keep trying on next tick
      }

      this._scheduleNext(state, jobId);
      return;
    }

    // --- unknown status ---
    this._log('inspection_unknown_status', { jobId, jobStatus, round: state.rounds });
    this._scheduleNext(state, jobId);
  }

  // ---------------------------------------------------------------------------
  // Resume arg builder
  // ---------------------------------------------------------------------------

  /**
   * Inject --resume true into original args after xhs subcommands.
   * Eligible subcommands: unified, collect, like, feed-like, status.
   * @param {string[]} args
   * @returns {string[]|null} resume args or null if not eligible
   */
  _buildResumeArgs(args = []) {
    if (!Array.isArray(args) || args.length < 2) return null;

    // Pattern: ['xhs', '<subcommand>', ...options]
    if (args[0] !== 'xhs') return null;

    const sub = args[1];
    const ELIGIBLE = new Set(['unified', 'collect', 'like', 'feed-like', 'status']);
    if (!ELIGIBLE.has(sub)) return null;

    // Check if --resume already present (in any form)
    const hasResume = args.some((a) => {
      if (a === '--resume') return true;
      if (a.startsWith('--resume=')) return true;
      return false;
    });

    if (hasResume) return args;

    // Insert --resume true after the subcommand
    const result = [...args.slice(0, 2), '--resume', 'true', ...args.slice(2)];
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _scheduleNext(state, jobId) {
    if (state.status !== 'active' || this._destroyed) return;
    state.timer = setTimeout(() => this._tick(jobId), this.intervalMs);
    if (state.timer && typeof state.timer.unref === 'function') {
      state.timer.unref();
    }
  }

  _clearTimer(state) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  _log(event, data) {
    if (!this.logger) return;
    try {
      this.logger(event, data);
    } catch (_) {
      // Swallow logger errors
    }
  }
}

/**
 * Factory function for creating an InspectionScheduler.
 * @param {object} opts
 * @returns {InspectionScheduler}
 */
export function createInspectionScheduler(opts = {}) {
  return new InspectionScheduler(opts);
}
