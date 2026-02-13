// sharedmodule/state-client.mts
// Client SDK for scripts to interact with unified-api task state (webauto-04b)

import type { TaskPhase, TaskStatus, TaskProgress, TaskStats, TaskError } from '../../services/unified-api/task-state.js';

export interface StateClientOptions {
  runId: string;
  profileId: string;
  keyword: string;
  phase?: TaskPhase;
  apiUrl?: string;
}

export class StateClient {
  private runId: string;
  private profileId: string;
  private keyword: string;
  private apiUrl: string;

  constructor(options: StateClientOptions) {
    this.runId = options.runId;
    this.profileId = options.profileId;
    this.keyword = options.keyword;
    this.apiUrl = options.apiUrl || 'http://127.0.0.1:7701';
    this.createTask(options.phase);
  }

  private async createTask(phase?: TaskPhase): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/v1/tasks/${this.runId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: this.runId,
          profileId: this.profileId,
          keyword: this.keyword,
          phase: phase || 'unknown',
          status: 'starting',
        }),
      });
    } catch (err) {
      console.warn('[StateClient] createTask failed:', err);
    }
  }

  async updateProgress(processed: number, total?: number): Promise<void> {
    const progress: Partial<TaskProgress> = { processed };
    if (total !== undefined) progress.total = total;
    try {
      await fetch(`${this.apiUrl}/api/v1/tasks/${this.runId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress }),
      });
    } catch (err) {
      console.warn('[StateClient] updateProgress failed:', err);
    }
  }

  async updateStats(stats: Partial<TaskStats>): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/v1/tasks/${this.runId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats }),
      });
    } catch (err) {
      console.warn('[StateClient] updateStats failed:', err);
    }
  }

  async pushEvent(type: string, data: any): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/v1/tasks/${this.runId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      });
    } catch (err) {
      console.warn('[StateClient] pushEvent failed:', err);
    }
  }

  async markCompleted(): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/v1/tasks/${this.runId}/control?action=stop`, {
        method: 'POST',
      });
    } catch (err) {
      console.warn('[StateClient] markCompleted failed:', err);
    }
  }

  async markFailed(error: string): Promise<void> {
    try {
      const errPayload: TaskError = {
        message: error,
        code: 'RUNTIME_ERROR',
        timestamp: Date.now(),
        recoverable: false,
      };
      await fetch(`${this.apiUrl}/api/v1/tasks/${this.runId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastError: errPayload, status: 'failed' }),
      });
    } catch (err) {
      console.warn('[StateClient] markFailed failed:', err);
    }
  }

  incrementNotes(count = 1): void {
    void this.updateStats({ notesProcessed: count });
  }

  incrementComments(count: number): void {
    void this.updateStats({ commentsCollected: count });
  }

  incrementLikes(count: number): void {
    void this.updateStats({ likesPerformed: count });
  }
}

// Singleton instance for current process
let _client: StateClient | null = null;

export function createStateClient(options: StateClientOptions): StateClient {
  if (_client && _client['runId'] === options.runId) {
    return _client;
  }
  _client = new StateClient(options);
  return _client;
}

export function getStateClient(): StateClient | null {
  return _client;
}

export default StateClient;
