// apps/desktop-console/src/renderer/hooks/use-task-state.mts
// React-style hook for task state in renderer (webauto-04b)

import { ipcRenderer } from 'electron';

// Inline types to avoid import path issues
export interface TaskState {
  runId: string;
  profileId: string;
  keyword: string;
  phase: string;
  status: string;
  progress: { total: number; processed: number; failed: number };
  stats: {
    notesProcessed: number;
    commentsCollected: number;
    likesPerformed: number;
    repliesGenerated: number;
    imagesDownloaded: number;
    ocrProcessed: number;
  };
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  lastError?: any;
}

export interface StateUpdate {
  runId: string;
  type: string;
  data: any;
  timestamp: number;
}

type Listener = (update: StateUpdate) => void;

class TaskStateStore {
  private tasks: Map<string, TaskState> = new Map();
  private listeners: Set<Listener> = new Set();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    ipcRenderer.on('state:update', (_e, update: StateUpdate) => {
      this.handleUpdate(update);
    });
    this.loadTasks();
  }

  private async loadTasks() {
    try {
      const tasks: TaskState[] = await ipcRenderer.invoke('state:getTasks');
      tasks.forEach(t => this.tasks.set(t.runId, t));
      this.notify({ runId: '', type: 'init', data: tasks, timestamp: Date.now() });
    } catch (err) {
      console.warn('[TaskStateStore] loadTasks failed:', err);
    }
  }

  private handleUpdate(update: StateUpdate) {
    if (update.type === 'init') {
      const arr = update.data as TaskState[];
      arr.forEach(t => this.tasks.set(t.runId, t));
    } else {
      const existing = this.tasks.get(update.runId);
      if (existing) {
        this.tasks.set(update.runId, { ...existing, ...update.data });
      }
    }
    this.notify(update);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(update: StateUpdate) {
    this.listeners.forEach(l => {
      try { l(update); } catch {}
    });
  }

  getTask(runId: string): TaskState | undefined {
    return this.tasks.get(runId);
  }

  getAllTasks(): TaskState[] {
    return Array.from(this.tasks.values());
  }
}

export const taskStateStore = new TaskStateStore();

// For use in vanilla JS without React
export function useTaskState(callback: (update: StateUpdate) => void): () => void {
  taskStateStore.start();
  return taskStateStore.subscribe(callback);
}

export function getTask(runId: string): TaskState | undefined {
  return taskStateStore.getTask(runId);
}

export function getAllTasks(): TaskState[] {
  return taskStateStore.getAllTasks();
}
