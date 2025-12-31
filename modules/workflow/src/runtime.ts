import { EventEmitter } from 'node:events';
import type { ContainerDefinition } from '../../container-registry/src/index.js';
import { ContainerOperationQueue, type OperationTaskConfig } from '../../operations/src/queue.js';
import { ensureBuiltinOperations } from '../../operations/src/builtin.js';
import { assertContainerOperations, containerAllowsOperation } from '../../operations/src/container-binding.js';
import { globalEventBus } from '../../../libs/operations-framework/src/event-driven/EventBus.js';
import type { OperationContextProvider } from '../../operations/src/queue.js';

function matches(pattern: string, topic: string): boolean {
  if (!pattern || pattern === topic) return true;
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(topic);
}

export interface WorkflowOperation {
  id: string;
  config?: Record<string, any>;
  priority?: number;
}

export interface WorkflowTrigger {
  event: string;
  condition?: (payload: any) => boolean | Promise<boolean>;
  operations: WorkflowOperation[];
}

export interface WorkflowDefinition {
  id: string;
  name?: string;
  container: ContainerDefinition;
  triggers: WorkflowTrigger[];
}

export interface WorkflowRuntimeOptions {
  contextProvider?: OperationContextProvider;
  useGlobalBus?: boolean;
}

export class WorkflowRuntime extends EventEmitter {
  private queue: ContainerOperationQueue;
  private workflows = new Map<string, WorkflowDefinition>();
  private middlewareAttached = false;
  private useGlobalBus: boolean;

  constructor(options: WorkflowRuntimeOptions = {}) {
    super();
    ensureBuiltinOperations();
    this.useGlobalBus = options.useGlobalBus !== false;
    this.queue = new ContainerOperationQueue({
      contextProvider: options.contextProvider,
      autoStart: true,
    });
    this.queue.on('task:queued', (payload) => this.emit('task:queued', payload));
    this.queue.on('task:started', (payload) => this.emit('task:started', payload));
    this.queue.on('task:completed', (payload) => this.emit('task:completed', payload));
    this.queue.on('task:failed', (payload) => this.emit('task:failed', payload));
    if (this.useGlobalBus) {
      this.attachMiddleware();
    }
  }

  registerWorkflow(definition: WorkflowDefinition) {
    if (!definition?.container) {
      throw new Error('workflow definition missing container');
    }
    assertContainerOperations(definition.container);
    this.workflows.set(definition.id, definition);
    this.emit('workflow:registered', { workflow: definition });
  }

  unregisterWorkflow(id: string) {
    if (this.workflows.delete(id)) {
      this.emit('workflow:unregistered', { id });
    }
  }

  private attachMiddleware() {
    if (this.middlewareAttached) return;
    globalEventBus.use(async (event, data, next) => {
      await this.handleEvent(event, data);
      await next();
    });
    this.middlewareAttached = true;
  }

  async dispatchEvent(event: string, payload: any) {
    for (const workflow of this.workflows.values()) {
      for (const trigger of workflow.triggers) {
        if (!matches(trigger.event, event)) {
          continue;
        }
        if (trigger.condition) {
          const shouldRun = await trigger.condition({ event, payload, workflow });
          if (!shouldRun) {
            continue;
          }
        }
        await this.enqueueOperations(workflow, trigger.operations, { event: { name: event, data: payload } });
      }
    }
  }

  // backward compat for middleware usage
  private async handleEvent(event: string, payload: any) {
    await this.dispatchEvent(event, payload);
  }

  private async enqueueOperations(
    workflow: WorkflowDefinition,
    operations: WorkflowOperation[],
    metadata: OperationTaskConfig,
  ) {
    for (const operation of operations) {
      containerAllowsOperation(workflow.container, operation.id);
      this.queue.enqueue(workflow.container, operation.id, {
        priority: operation.priority,
        config: operation.config,
        event: metadata.event,
      });
    }
  }
}
