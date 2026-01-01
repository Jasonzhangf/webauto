import type { WorkflowEvent, WorkflowEmitter, WorkflowSubscription } from './types.js';

/**
 * 事件发射器 - 用于 Workflow 状态订阅和日志广播
 */
export class WorkflowEventEmitter implements WorkflowEmitter {
  private listeners: Set<(event: WorkflowEvent) => void> = new Set();

  emit(event: WorkflowEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('[WorkflowEmitter] Listener error:', err);
      }
    });
  }

  subscribe(listener: (event: WorkflowEvent) => void): WorkflowSubscription {
    this.listeners.add(listener);
    return {
      unsubscribe: () => {
        this.listeners.delete(listener);
      }
    };
  }

  clear(): void {
    this.listeners.clear();
  }
}
