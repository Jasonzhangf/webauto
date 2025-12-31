import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { ContainerRegistry, type ContainerDefinition } from '../../container-registry/src/index.js';
import { WorkflowRuntime, type WorkflowDefinition, type WorkflowOperation } from './runtime.js';
import type { OperationContext } from '../../operations/src/registry.js';
import { BrowserWorkflowContextProvider } from './context.js';

export interface WorkflowFileTrigger {
  event: string;
  operations?: WorkflowOperation[];
  useContainerOperations?: boolean;
  conditionScript?: string;
}

export interface WorkflowFileDefinition {
  id: string;
  name?: string;
  containerId: string;
  site?: string;
  url?: string;
  triggers: WorkflowFileTrigger[];
}

export interface WorkflowOrchestratorOptions {
  profile: string;
  definitionPaths: string[];
  url?: string;
  containerSite?: string;
  wsUrl?: string;
  browserHost?: string;
  browserPort?: number;
  testMode?: boolean;
}

interface LoadedWorkflow {
  definition: WorkflowDefinition;
  sourcePath: string;
}

class MockWorkflowContextProvider {
  async createContext(): Promise<OperationContext> {
    return {
      page: {
        async evaluate() {
          return { success: true, mock: true };
        },
      },
      logger: console,
    } as OperationContext;
  }
}

export class WorkflowOrchestrator {
  private options: WorkflowOrchestratorOptions;
  private registry = new ContainerRegistry();
  private runtime: WorkflowRuntime | null = null;
  private ws: WebSocket | null = null;

  constructor(options: WorkflowOrchestratorOptions) {
    this.options = options;
  }

  async start() {
    const workflows = this.loadDefinitions();
    if (!workflows.length) {
      throw new Error('No workflow definitions loaded');
    }
    const contextProvider = this.options.testMode
      ? new MockWorkflowContextProvider()
      : new BrowserWorkflowContextProvider({
          profile: this.options.profile,
          host: this.options.browserHost,
          port: this.options.browserPort,
        });
    this.runtime = new WorkflowRuntime({
      contextProvider: () => contextProvider.createContext(),
      useGlobalBus: false,
    });
    this.attachRuntimeEvents(this.runtime);
    for (const wf of workflows) {
      this.runtime.registerWorkflow(wf.definition);
    }
    console.log(`[workflow] Registered ${workflows.length} workflow(s)`);

    if (this.options.testMode) {
      await this.runTestMode(workflows);
      return;
    }
    await this.connectWebSocket(this.collectTopics(workflows));
  }

  private attachRuntimeEvents(runtime: WorkflowRuntime) {
    runtime.on('task:queued', ({ task }) => {
      console.log(`[workflow] task queued ${task.container.id} -> ${task.operationId}`);
    });
    runtime.on('task:started', ({ task }) => {
      console.log(`[workflow] task started ${task.container.id} -> ${task.operationId}`);
    });
    runtime.on('task:completed', ({ task, result }) => {
      console.log(`[workflow] task completed ${task.container.id} -> ${task.operationId}`, result);
    });
    runtime.on('task:failed', ({ task, error }) => {
      console.warn(`[workflow] task failed ${task.container.id} -> ${task.operationId}: ${error}`);
    });
  }

  async stop() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  private async runTestMode(workflows: LoadedWorkflow[]) {
    if (!this.runtime) return;
    console.log('[workflow] test mode: emitting triggers once');
    const topics = this.collectTopics(workflows);
    for (const topic of topics) {
      await this.runtime.dispatchEvent(topic, { source: 'workflow:test-mode' });
    }
    console.log('[workflow] test mode completed');
  }

  private collectTopics(workflows: LoadedWorkflow[]) {
    const topics = new Set<string>();
    for (const wf of workflows) {
      for (const trigger of wf.definition.triggers) {
        topics.add(trigger.event);
      }
    }
    return Array.from(topics);
  }

  private async connectWebSocket(topics: string[]) {
    if (!topics.length) {
      console.warn('[workflow] No trigger events configured, nothing to subscribe');
      return;
    }
    const wsUrl = this.options.wsUrl || 'ws://127.0.0.1:7701/ws';
    console.log(`[workflow] connecting to ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);
    this.ws.on('open', () => {
      console.log('[workflow] websocket connected');
      topics.forEach((topic) => {
        const payload = { type: 'subscribe', topic };
        this.ws?.send(JSON.stringify(payload));
        console.log(`[workflow] subscribed ${topic}`);
      });
    });
    this.ws.on('message', (raw) => {
      this.handleWsMessage(raw.toString()).catch((err) => {
        console.error('[workflow] ws message error', err?.message || err);
      });
    });
    this.ws.on('close', () => {
      console.warn('[workflow] websocket closed');
    });
    this.ws.on('error', (err) => {
      console.error('[workflow] websocket error', err?.message || err);
    });
  }

  private async handleWsMessage(raw: string) {
    if (!this.runtime) return;
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message?.type !== 'event') {
      return;
    }
    const topic = message.topic || 'unknown';
    console.log(`[workflow] ws event ${topic}`);
    await this.runtime.dispatchEvent(topic, message.payload || {});
  }

  private loadDefinitions(): LoadedWorkflow[] {
    const outputs: LoadedWorkflow[] = [];
    for (const defPath of this.options.definitionPaths) {
      const abs = path.resolve(defPath);
      if (!fs.existsSync(abs)) {
        throw new Error(`Workflow definition not found: ${abs}`);
      }
      const raw = fs.readFileSync(abs, 'utf-8');
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch (err: any) {
        throw new Error(`Invalid JSON in ${abs}: ${err?.message || err}`);
      }
      const entries = Array.isArray(data) ? data : [data];
      entries.forEach((entry, idx) => {
        const workflow = this.transformDefinition(entry, abs, idx);
        outputs.push({ definition: workflow, sourcePath: abs });
      });
    }
    return outputs;
  }

  private transformDefinition(entry: WorkflowFileDefinition, sourcePath: string, index: number): WorkflowDefinition {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Workflow definition at ${sourcePath}#${index} is not an object`);
    }
    if (!entry.id) {
      throw new Error(`Workflow definition missing id (${sourcePath}#${index})`);
    }
    if (!entry.containerId) {
      throw new Error(`Workflow ${entry.id} missing containerId`);
    }
    if (!Array.isArray(entry.triggers) || !entry.triggers.length) {
      throw new Error(`Workflow ${entry.id} requires at least one trigger`);
    }
    const container = this.resolveContainer(entry);
    const triggers = entry.triggers.map((trigger) => {
      if (!trigger?.event) {
        throw new Error(`Workflow ${entry.id} trigger missing event`);
      }
      const operations = this.resolveOperations(trigger, container);
      return {
        event: trigger.event,
        operations,
      };
    });
    return {
      id: entry.id,
      name: entry.name,
      container,
      triggers,
    };
  }

  private resolveContainer(entry: WorkflowFileDefinition): ContainerDefinition {
    const url = entry.url || this.options.url;
    let containers: Record<string, ContainerDefinition> = {};
    if (entry.site || this.options.containerSite) {
      const site = entry.site || this.options.containerSite;
      containers = this.registry.getContainersForSite(site!);
    } else if (url) {
      containers = this.registry.getContainersForUrl(url);
    } else {
      throw new Error(`Workflow ${entry.id} requires site or url to resolve containers`);
    }
    const container = containers[entry.containerId];
    if (!container) {
      throw new Error(`Container ${entry.containerId} not found for workflow ${entry.id}`);
    }
    return container;
  }

  private resolveOperations(trigger: WorkflowFileTrigger, container: ContainerDefinition): WorkflowOperation[] {
    if (trigger.operations && trigger.operations.length) {
      return trigger.operations.map((op) => ({
        id: op.id,
        config: op.config,
        priority: op.priority,
      }));
    }
    if (trigger.useContainerOperations) {
      const operations = container.operations || [];
      return operations.map((op: any, index: number) => ({
        id: op.type || op.id,
        config: op.config || op.params || {},
        priority: operations.length - index,
      }));
    }
    throw new Error(`Trigger ${trigger.event} missing operations configuration`);
  }
}
