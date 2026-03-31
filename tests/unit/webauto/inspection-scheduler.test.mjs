// inspection-scheduler.test.mjs — 39 test cases for InspectionScheduler
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InspectionScheduler, createInspectionScheduler } from '../../../apps/webauto/entry/lib/inspection-scheduler.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestScheduler(opts = {}) {
  return new InspectionScheduler({
    intervalMs: 30,
    maxResumeAttempts: 2,
    maxTotalRounds: 10,
    ...opts,
  });
}

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      try {
        if (predicate()) return resolve(true);
      } catch (_) { /* not yet */ }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor timeout'));
      }
      setTimeout(check, 10);
    };
    check();
  });
}

const noop = () => {};

// ---------------------------------------------------------------------------
// constructor
// ---------------------------------------------------------------------------

describe('InspectionScheduler - constructor', () => {
  it('creates instance with default options', () => {
    const s = new InspectionScheduler();
    assert.equal(s.intervalMs, 60_000);
    assert.equal(s.maxResumeAttempts, 3);
    assert.equal(s.maxTotalRounds, 360);
    assert.equal(s.logger, null);
    assert.equal(s._destroyed, false);
    s.destroy();
  });

  it('creates instance with custom options', () => {
    const log = noop;
    const s = new InspectionScheduler({ intervalMs: 5000, maxResumeAttempts: 5, maxTotalRounds: 100, logger: log });
    assert.equal(s.intervalMs, 5000);
    assert.equal(s.maxResumeAttempts, 5);
    assert.equal(s.maxTotalRounds, 100);
    assert.equal(s.logger, log);
    s.destroy();
  });

  it('clamps intervalMs to minimum 1000', () => {
    const s = new InspectionScheduler({ intervalMs: 100 });
    assert.equal(s.intervalMs, 1000);
    s.destroy();
  });

  it('clamps maxResumeAttempts to minimum 1', () => {
    const s = new InspectionScheduler({ maxResumeAttempts: 0 });
    assert.equal(s.maxResumeAttempts, 1);
    s.destroy();
  });

  it('clamps maxTotalRounds to minimum 1', () => {
    const s = new InspectionScheduler({ maxTotalRounds: -5 });
    assert.equal(s.maxTotalRounds, 1);
    s.destroy();
  });

  it('factory function creates instance', () => {
    const s = createInspectionScheduler({ intervalMs: 2000 });
    assert.ok(s instanceof InspectionScheduler);
    assert.equal(s.intervalMs, 2000);
    s.destroy();
  });
});

// ---------------------------------------------------------------------------
// startInspection
// ---------------------------------------------------------------------------

describe('InspectionScheduler - startInspection', () => {
  it('returns ok with inspectionId', () => {
    const s = createTestScheduler();
    const result = s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: noop,
    });
    assert.equal(result.ok, true);
    assert.ok(result.inspectionId.startsWith('j1__'));
    s.destroy();
  });

  it('replaces existing inspection for same jobId', () => {
    const s = createTestScheduler();
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: noop,
    });
    const r2 = s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: noop,
    });
    assert.equal(r2.ok, true);
    const list = s.listInspections();
    assert.equal(list.length, 1);
    assert.equal(list[0].jobId, 'j1');
    s.destroy();
  });

  it('supports multiple different jobIds', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    s.startInspection({ jobId: 'j2', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    const list = s.listInspections();
    assert.equal(list.length, 2);
    s.destroy();
  });

  it('throws if destroyed', () => {
    const s = createTestScheduler();
    s.destroy();
    assert.throws(() => {
      s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    }, /destroyed/);
  });
});

// ---------------------------------------------------------------------------
// stopInspection
// ---------------------------------------------------------------------------

describe('InspectionScheduler - stopInspection', () => {
  it('returns true for active inspection', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    const result = s.stopInspection('j1');
    assert.equal(result, true);
    assert.equal(s.listInspections().length, 0);
    s.destroy();
  });

  it('returns false for double-stop', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    s.stopInspection('j1');
    const result = s.stopInspection('j1');
    assert.equal(result, false);
    s.destroy();
  });

  it('returns false for non-existent jobId', () => {
    const s = createTestScheduler();
    const result = s.stopInspection('nonexistent');
    assert.equal(result, false);
    s.destroy();
  });
});

// ---------------------------------------------------------------------------
// stopAll / destroy
// ---------------------------------------------------------------------------

describe('InspectionScheduler - stopAll / destroy', () => {
  it('stopAll stops all active inspections', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    s.startInspection({ jobId: 'j2', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    s.stopAll();
    assert.equal(s.listInspections().length, 0);
    s.destroy();
  });

  it('destroy stops all and prevents new inspections', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    s.destroy();
    assert.equal(s._destroyed, true);
    assert.throws(() => {
      s.startInspection({ jobId: 'j2', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    });
  });
});

// ---------------------------------------------------------------------------
// getInspectionState / listInspections
// ---------------------------------------------------------------------------

describe('InspectionScheduler - getInspectionState / listInspections', () => {
  it('returns state for active inspection', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    const state = s.getInspectionState('j1');
    assert.ok(state);
    assert.equal(state.jobId, 'j1');
    assert.equal(state.status, 'active');
    assert.equal(state.rounds, 0);
    assert.equal(state.resumeAttempts, 0);
    s.destroy();
  });

  it('returns null for non-existent jobId', () => {
    const s = createTestScheduler();
    assert.equal(s.getInspectionState('nonexistent'), null);
    s.destroy();
  });

  it('listInspections returns array of all inspections', () => {
    const s = createTestScheduler();
    s.startInspection({ jobId: 'j1', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    s.startInspection({ jobId: 'j2', getJobStatus: () => ({ status: 'running' }), onResubmit: noop, onComplete: noop });
    const list = s.listInspections();
    assert.equal(list.length, 2);
    const jobIds = list.map((i) => i.jobId).sort();
    assert.deepEqual(jobIds, ['j1', 'j2']);
    s.destroy();
  });
});

// ---------------------------------------------------------------------------
// tick behavior
// ---------------------------------------------------------------------------

describe('InspectionScheduler - tick: running job', () => {
  it('skips when job is running', async () => {
    const logs = [];
    const s = createTestScheduler({ logger: (ev, d) => logs.push({ ev, d }) });
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: noop,
    });
    await waitFor(() => logs.some((l) => l.ev === 'inspection_job_running'), 2000);
    assert.ok(logs.some((l) => l.ev === 'inspection_job_running'));
    s.destroy();
  });
});

describe('InspectionScheduler - tick: completed job', () => {
  it('terminates and calls onComplete', async () => {
    const completed = [];
    const s = createTestScheduler();
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'completed' }),
      onResubmit: noop,
      onComplete: (summary) => completed.push(summary),
    });
    await waitFor(() => completed.length > 0, 2000);
    assert.equal(completed[0].reason, 'completed');
    assert.equal(completed[0].jobId, 'j1');
    assert.equal(s.getInspectionState('j1'), null);
    s.destroy();
  });
});

describe('InspectionScheduler - tick: failed job with resume', () => {
  it('resubmits with --resume true', async () => {
    const resubmitted = [];
    const s = createTestScheduler();
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'failed', args: ['xhs', 'unified', '--profile', 'test'] }),
      onResubmit: async (args) => { resubmitted.push(args); },
      onComplete: noop,
    });
    await waitFor(() => resubmitted.length > 0, 2000);
    assert.deepEqual(resubmitted[0], ['xhs', 'unified', '--resume', 'true', '--profile', 'test']);
    s.destroy();
  });
});

describe('InspectionScheduler - tick: stopped job with resume', () => {
  it('resubmits stopped job', async () => {
    const resubmitted = [];
    const s = createTestScheduler();
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'stopped', args: ['xhs', 'collect', '--keyword', 'test'] }),
      onResubmit: async (args) => { resubmitted.push(args); },
      onComplete: noop,
    });
    await waitFor(() => resubmitted.length > 0, 2000);
    assert.deepEqual(resubmitted[0], ['xhs', 'collect', '--resume', 'true', '--keyword', 'test']);
    s.destroy();
  });
});

describe('InspectionScheduler - tick: maxRounds exceeded', () => {
  it('terminates after maxTotalRounds', async () => {
    const completed = [];
    const s = createTestScheduler({ maxTotalRounds: 2 });
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: (summary) => completed.push(summary),
    });
    await waitFor(() => completed.length > 0, 3000);
    assert.equal(completed[0].reason, 'max_rounds_exceeded');
    s.destroy();
  });
});

describe('InspectionScheduler - tick: getJobStatus throws', () => {
  it('continues inspecting after getJobStatus error', async () => {
    const logs = [];
    let callCount = 0;
    const s = createTestScheduler({ logger: (ev) => logs.push(ev) });
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => { callCount++; throw new Error('db error'); },
      onResubmit: noop,
      onComplete: noop,
    });
    await waitFor(() => logs.includes('inspection_get_status_error'), 2000);
    assert.ok(callCount >= 1);
    s.destroy();
  });
});

describe('InspectionScheduler - tick: invalid data', () => {
  it('continues when getJobStatus returns invalid data', async () => {
    const logs = [];
    const s = createTestScheduler({ logger: (ev) => logs.push(ev) });
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => null,
      onResubmit: noop,
      onComplete: noop,
    });
    await waitFor(() => logs.includes('inspection_invalid_status'), 2000);
    assert.ok(logs.includes('inspection_invalid_status'));
    s.destroy();
  });
});

describe('InspectionScheduler - tick: unknown status', () => {
  it('continues for unknown status', async () => {
    const logs = [];
    const s = createTestScheduler({ logger: (ev) => logs.push(ev) });
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'weird_state' }),
      onResubmit: noop,
      onComplete: noop,
    });
    await waitFor(() => logs.includes('inspection_unknown_status'), 2000);
    assert.ok(logs.includes('inspection_unknown_status'));
    s.destroy();
  });
});

// ---------------------------------------------------------------------------
// _buildResumeArgs
// ---------------------------------------------------------------------------

describe('InspectionScheduler - _buildResumeArgs', () => {
  const s = createTestScheduler();

  it('injects --resume for unified', () => {
    const result = s._buildResumeArgs(['xhs', 'unified', '--profile', 'test']);
    assert.deepEqual(result, ['xhs', 'unified', '--resume', 'true', '--profile', 'test']);
  });

  it('injects --resume for collect', () => {
    const result = s._buildResumeArgs(['xhs', 'collect', '--keyword', 'test']);
    assert.deepEqual(result, ['xhs', 'collect', '--resume', 'true', '--keyword', 'test']);
  });

  it('injects --resume for like', () => {
    const result = s._buildResumeArgs(['xhs', 'like', '--profile', 'test']);
    assert.deepEqual(result, ['xhs', 'like', '--resume', 'true', '--profile', 'test']);
  });

  it('injects --resume for feed-like', () => {
    const result = s._buildResumeArgs(['xhs', 'feed-like', '--profile', 'test']);
    assert.deepEqual(result, ['xhs', 'feed-like', '--resume', 'true', '--profile', 'test']);
  });

  it('injects --resume for feed-unlike', () => {
    const result = s._buildResumeArgs(['xhs', 'feed-unlike', '--profile', 'test']);
    assert.deepEqual(result, ['xhs', 'feed-unlike', '--resume', 'true', '--profile', 'test']);
  });

  it('injects --resume for eligible weibo collect', () => {
    const result = s._buildResumeArgs(['weibo', 'collect', '--profile', 'test', '--keyword', 'AI']);
    assert.deepEqual(result, ['weibo', 'collect', '--resume', 'true', '--profile', 'test', '--keyword', 'AI']);
  });

  it('returns null for non-eligible weibo subcommand', () => {
    assert.equal(s._buildResumeArgs(['weibo', 'unified', '--profile', 'test']), null);
  });

  it('returns null for non-eligible xhs subcommand', () => {
    assert.equal(s._buildResumeArgs(['xhs', 'install', '--browser']), null);
  });

  it('returns args as-is when --resume already present (space form)', () => {
    const args = ['xhs', 'unified', '--resume', 'true', '--profile', 'test'];
    assert.deepEqual(s._buildResumeArgs(args), args);
  });

  it('returns args as-is when --resume already present (equals form)', () => {
    const args = ['xhs', 'unified', '--resume=true', '--profile', 'test'];
    assert.deepEqual(s._buildResumeArgs(args), args);
  });

  it('returns null for empty args', () => {
    assert.equal(s._buildResumeArgs([]), null);
  });

  it('returns null for too-short args', () => {
    assert.equal(s._buildResumeArgs(['xhs']), null);
  });

  s.destroy();
});

// ---------------------------------------------------------------------------
// logger
// ---------------------------------------------------------------------------

describe('InspectionScheduler - logger', () => {
  it('calls logger for events', async () => {
    const logs = [];
    const s = createTestScheduler({ logger: (ev, d) => logs.push({ ev, d }) });
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: noop,
    });
    await waitFor(() => logs.some((l) => l.ev === 'inspection_start'), 1000);
    assert.ok(logs.some((l) => l.ev === 'inspection_start'));
    s.destroy();
  });

  it('swallows logger errors', async () => {
    const logs = [];
    const badLogger = () => { throw new Error('logger broken'); };
    const s = createTestScheduler({ logger: badLogger });
    // Should not throw even though logger fails
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: 'running' }),
      onResubmit: noop,
      onComplete: noop,
    });
    // Give it a tick cycle
    await new Promise((r) => setTimeout(r, 100));
    s.destroy();
  });
});

// ---------------------------------------------------------------------------
// integration
// ---------------------------------------------------------------------------

describe('InspectionScheduler - integration', () => {
  it('full lifecycle: running -> failed -> resume -> completed', async () => {
    let status = 'running';
    const resubmitted = [];
    const completed = [];

    const s = createTestScheduler();
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status, args: ['xhs', 'unified', '--profile', 'test'] }),
      onResubmit: async (args) => {
        resubmitted.push(args);
        status = 'running'; // simulate restart
      },
      onComplete: (summary) => completed.push(summary),
    });

    // Wait for first tick (running)
    await new Promise((r) => setTimeout(r, 80));

    // Change to failed
    status = 'failed';

    // Wait for resume
    await waitFor(() => resubmitted.length > 0, 2000);

    // After resume, status becomes running again, then mark completed
    await new Promise((r) => setTimeout(r, 80));
    status = 'completed';

    await waitFor(() => completed.length > 0, 2000);
    assert.equal(completed[0].reason, 'completed');
    s.destroy();
  });

  it('multiple independent jobs with different lifecycles', async () => {
    let status1 = 'running';
    let status2 = 'running';
    const completed = [];

    const s = createTestScheduler();
    s.startInspection({
      jobId: 'j1',
      getJobStatus: () => ({ status: status1, args: ['xhs', 'unified', '--profile', 'a'] }),
      onResubmit: noop,
      onComplete: (summary) => completed.push(summary),
    });
    s.startInspection({
      jobId: 'j2',
      getJobStatus: () => ({ status: status2, args: ['xhs', 'collect', '--profile', 'b'] }),
      onResubmit: noop,
      onComplete: (summary) => completed.push(summary),
    });

    // Complete j1
    await new Promise((r) => setTimeout(r, 80));
    status1 = 'completed';

    await waitFor(() => completed.length >= 1, 2000);

    // Complete j2
    status2 = 'completed';
    await waitFor(() => completed.length >= 2, 2000);

    assert.equal(completed.length, 2);
    const reasons = completed.map((c) => c.reason);
    assert.ok(reasons.includes('completed'));
    s.destroy();
  });
});
