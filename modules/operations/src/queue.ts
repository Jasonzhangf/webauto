import { EventEmitter } from 'node:events';
import type { ContainerDefinition } from '../../container-registry/src/index.js';
import type { OperationContext } from './registry.js';
import { getOperation } from './registry.js';
import { containerAllowsOperation } from './container-binding.js';

export interface OperationEventMeta {
  name: string;
  data: any;
}

export interface OperationTaskConfig {
  priority?: number;
  config?: Record<string, any>;
  event?: OperationEventMeta;
}

export interface OperationTask {
  id: string;
  container: ContainerDefinition;
  operationId: string;
  priority: number;
  config: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: any;
  error?: string;
  event?: OperationEventMeta;
}

export type OperationExecutor = (task: OperationTask, context: OperationContext) => Promise<any>;
export type OperationContextProvider = (task: OperationTask) => Promise<OperationContext>;

export interface OperationQueueOptions {
  contextProvider?: OperationContextProvider;
  executor?: OperationExecutor;
  autoStart?: boolean;
}

export class ContainerOperationQueue extends EventEmitter {
  private queues = new Map<string, OperationTask[]>();
  private processing = new Set<string>();
  private options: OperationQueueOptions;
  private taskCounter = 0;

  constructor(options: OperationQueueOptions = {}) {
    super();
    this.options = { autoStart: true, ...options };
  }

  enqueue(container: ContainerDefinition, operationId: string, config: OperationTaskConfig = {}) {
    containerAllowsOperation(container, operationId);
    const queue = this.ensureQueue(container.id);
    const task: OperationTask = {
      id: `${container.id}:${operationId}:${Date.now()}:${this.taskCounter++}`,
      container,
      operationId,
      priority: config.priority ?? 0,
      config: (config.config || {}) as Record<string, any>,
      status: 'pending',
      enqueuedAt: Date.now(),
      event: config.event,
    };
    queue.push(task);
    queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);
    this.emit('task:queued', { task });
    if (this.options.autoStart) {
      void this.process(container.id);
    }
    return task;
  }

  async process(containerId: string) {
    if (this.processing.has(containerId)) {
      return;
    }
    const queue = this.ensureQueue(containerId);
    if (!queue.length) {
      return;
    }
    this.processing.add(containerId);
    try {
      while (queue.length) {
        const task = queue.shift()!;
        await this.runTask(task);
      }
    } finally {
      this.processing.delete(containerId);
    }
  }

  private async runTask(task: OperationTask) {
    const operation = getOperation(task.operationId);
    if (!operation) {
      task.status = 'failed';
      task.error = `Operation ${task.operationId} not found`;
      this.emit('task:failed', { task, error: task.error });
      return;
    }
    if (!this.options.contextProvider) {
      task.status = 'failed';
      task.error = 'No OperationContext provider configured';
      this.emit('task:failed', { task, error: task.error });
      return;
    }
    const context = await this.options.contextProvider(task);
    task.startedAt = Date.now();
    task.status = 'running';
    this.emit('task:started', { task });
    try {
      const executor = this.options.executor ?? this.defaultExecutor;
      const result = await executor(task, context);
      task.result = result;
      task.status = 'completed';
      task.finishedAt = Date.now();
      this.emit('task:completed', { task, result });
    } catch (err: any) {
      task.status = 'failed';
      task.error = err?.message || String(err);
      task.finishedAt = Date.now();
      this.emit('task:failed', { task, error: task.error });
    }
  }

  private async defaultExecutor(task: OperationTask, context: OperationContext) {
    const operation = getOperation(task.operationId);
    if (!operation) {
      throw new Error(`Operation ${task.operationId} not registered`);
    }
    return operation.run(context, task.config);
  }

  private ensureQueue(containerId: string) {
    if (!this.queues.has(containerId)) {
      this.queues.set(containerId, []);
    }
    return this.queues.get(containerId)!;
  }
}
