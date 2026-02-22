// services/unified-api/task-state.ts
// Unified task state registry for UI ↔ script data sync (webauto-04b)

export type TaskPhase = 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'unified' | 'orchestrate' | 'unknown';
export type TaskStatus = 'starting' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';

export interface TaskProgress {
  total: number;
  processed: number;
  failed: number;
}

export interface TaskStats {
  notesProcessed: number;
  commentsCollected: number;
  likesPerformed: number;
  repliesGenerated: number;
  imagesDownloaded: number;
  ocrProcessed: number;
}

export interface TaskError {
  message: string;
  code: string;
  timestamp: number;
  recoverable: boolean;
}

export interface TaskEvent {
  runId: string;
  type: string;
  data: any;
  timestamp: number;
}

export interface TaskState {
  runId: string;
  profileId: string;
  keyword: string;
  uiTriggerId?: string;
  phase: TaskPhase;
  status: TaskStatus;
  progress: TaskProgress;
  stats: TaskStats;
  createdAt: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  lastError?: TaskError;
  details?: {
    currentNote?: string;
    recentEvents: TaskEvent[];
    phase2Links?: string[];
  };
}

export interface StateUpdate {
  runId: string;
  type: 'progress' | 'stats' | 'phase_change' | 'status_change' | 'error' | 'note_done' | 'event';
  data: any;
  timestamp: number;
}

export type StateSubscriber = (update: StateUpdate) => void;

class TaskStateRegistry {
  private tasks: Map<string, TaskState> = new Map();
  private events: Map<string, TaskEvent[]> = new Map();
  private subscribers: Set<StateSubscriber> = new Set();
  private maxEventsPerTask = 100;

  createTask(partial: {
    runId: string;
    profileId: string;
    keyword: string;
    uiTriggerId?: string;
    phase?: TaskPhase;
  }): TaskState {
    const now = Date.now();
    const task: TaskState = {
      runId: partial.runId,
      profileId: partial.profileId,
      keyword: partial.keyword,
      uiTriggerId: partial.uiTriggerId ? String(partial.uiTriggerId).trim() : undefined,
      phase: partial.phase || 'unknown',
      status: 'starting',
      progress: { total: 0, processed: 0, failed: 0 },
      stats: {
        notesProcessed: 0,
        commentsCollected: 0,
        likesPerformed: 0,
        repliesGenerated: 0,
        imagesDownloaded: 0,
        ocrProcessed: 0,
      },
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      details: {
        recentEvents: [],
      },
    };
    this.tasks.set(task.runId, task);
    this.events.set(task.runId, []);
    this.broadcast({ runId: task.runId, type: 'status_change', data: { status: 'starting' }, timestamp: now });
    return task;
  }

  getTask(runId: string): TaskState | undefined {
    return this.tasks.get(runId);
  }

  getAllTasks(): TaskState[] {
    return Array.from(this.tasks.values());
  }

  updateTask(runId: string, updates: Partial<TaskState>): TaskState | undefined {
    const task = this.tasks.get(runId);
    if (!task) return undefined;
    Object.assign(task, updates, { updatedAt: Date.now() });
    this.tasks.set(runId, task);
    return task;
  }

  updateProgress(runId: string, progress: Partial<TaskProgress>): void {
    const task = this.tasks.get(runId);
    if (!task) return;
    Object.assign(task.progress, progress);
    task.updatedAt = Date.now();
    this.broadcast({ runId, type: 'progress', data: task.progress, timestamp: task.updatedAt });
  }

  updateStats(runId: string, stats: Partial<TaskStats>): void {
    const task = this.tasks.get(runId);
    if (!task) return;
    Object.assign(task.stats, stats);
    task.updatedAt = Date.now();
    this.broadcast({ runId, type: 'stats', data: task.stats, timestamp: task.updatedAt });
  }

  pushEvent(runId: string, eventType: string, data: any): void {
    const task = this.tasks.get(runId);
    if (!task) return;
    const event: TaskEvent = { runId, type: eventType, data, timestamp: Date.now() };
    let events = this.events.get(runId) || [];
    events.push(event);
    if (events.length > this.maxEventsPerTask) {
      events = events.slice(-this.maxEventsPerTask);
    }
    this.events.set(runId, events);
    if (task.details) {
      task.details.recentEvents = events.slice(-50);
    }
    this.broadcast({ runId, type: 'event', data: event, timestamp: event.timestamp });
  }

  setStatus(runId: string, status: TaskStatus): void {
    const task = this.tasks.get(runId);
    if (!task) return;
    task.status = status;
    task.updatedAt = Date.now();
    if (status === 'completed' || status === 'failed' || status === 'aborted') {
      task.completedAt = task.updatedAt;
    }
    this.broadcast({ runId, type: 'status_change', data: { status }, timestamp: task.updatedAt });
  }

  setError(runId: string, error: TaskError): void {
    const task = this.tasks.get(runId);
    if (!task) return;
    task.lastError = error;
    task.updatedAt = Date.now();
    this.broadcast({ runId, type: 'error', data: error, timestamp: task.updatedAt });
  }

  getEvents(runId: string, since?: number): TaskEvent[] {
    const events = this.events.get(runId) || [];
    if (!since) return events;
    return events.filter(e => e.timestamp > since);
  }

  deleteTask(runId: string): boolean {
    this.events.delete(runId);
    return this.tasks.delete(runId);
  }

  subscribe(callback: StateSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private broadcast(update: StateUpdate): void {
    for (const cb of this.subscribers) {
      try {
        cb(update);
      } catch (err) {
        console.error('[TaskStateRegistry] subscriber error:', err);
      }
    }
  }
}

export const taskStateRegistry = new TaskStateRegistry();
export default taskStateRegistry;
