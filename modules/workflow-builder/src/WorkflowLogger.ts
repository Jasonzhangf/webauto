import type { WorkflowEmitter, WorkflowLogEntry, WorkflowStatus } from './types.js';

export class WorkflowLogger {
  private emitter: WorkflowEmitter;

  constructor(emitter: WorkflowEmitter) {
    this.emitter = emitter;
  }

  status(payload: WorkflowStatus): void {
    this.emitter.emit({ type: 'workflow:status', payload });
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  private log(level: WorkflowLogEntry['level'], message: string, data?: Record<string, unknown>): void {
    const entry: WorkflowLogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      data
    };
    this.emitter.emit({ type: 'workflow:log', payload: entry });
  }
}
