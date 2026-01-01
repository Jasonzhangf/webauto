// Container Engine v2 - Runtime Controller
// Orchestrates discovery -> queue execution -> incremental loading with parent feedback

import { ContainerDefV2, ContainerGraph, ContainerNodeRuntime, OperationInstance, RunMode, HighlightOptions } from './types.js';
import { TreeDiscoveryEngine } from './TreeDiscoveryEngine.js';
import { RelationshipRegistry } from './RelationshipRegistry.js';
import { OperationQueue, Scheduler } from './OperationQueue.js';
import { FocusManager } from './FocusManager.js';

export interface RuntimeDeps {
  eventBus?: any;
  highlight?: (bboxOrHandle: any, opts?: HighlightOptions) => Promise<void>; // deprecated, use events
  wait: (ms: number) => Promise<void>;
  perform?: (node: ContainerNodeRuntime, op: OperationInstance) => Promise<any>; // executes non-discovery ops
  // Operation execution hook (Container -> Operation integration)
  operationExecutor?: {
    execute: (containerId: string, operationId: string, config: any, handle: any) => Promise<any>;
  };
}

export class RuntimeController {
  private graph!: ContainerGraph;
  private rel!: RelationshipRegistry;
  private focus = new FocusManager();
  private scheduler = new Scheduler();
  private running = false;
  private bindingRegistry?: any;

  constructor(
    private defs: ContainerDefV2[],
    private discovery: TreeDiscoveryEngine,
    private deps: RuntimeDeps,
    bindingRegistry?: any
  ) {
    this.bindingRegistry = bindingRegistry;
    
    // Subscribe to external operation execution events
    if (this.bindingRegistry && this.deps.eventBus) {
      this.deps.eventBus.on('operation:*:execute', async (data: any) => {
        await this.handleExternalOperation(data);
      });
    }
  }

  async start(rootId: string, rootHandle: any, mode: RunMode = 'sequential') {
    this.graph = await this.discovery.discoverFromRoot(rootId, rootHandle);
    this.rel = new RelationshipRegistry(this.graph);
    
    // seed op queues
    const root = this.graph.nodes.get(rootId)!;
    root.opQueue = OperationQueue.buildDefaultQueue(this.def(rootId)?.operations);
    this.running = true;
    await this.loop(mode);
  }

  async stop() {
    this.running = false;
  }

  /**
   * Emit event to EventBus if available
   */
  private async emitEvent(event: string, data: any): Promise<void> {
    if (this.deps.eventBus?.emit) {
      await this.deps.eventBus.emit(event, data, 'RuntimeController');
    } else {
      // Fallback: log to console if no EventBus
    }
  }

  private def(id: string) { return this.defs.find(d => d.id === id); }

  /**
   * Find next runnable node in graph
   */
  private findNextRunnableNode(): ContainerNodeRuntime | null {
    for (const [_, node] of Array.from(this.graph.nodes.entries())) {
      if (node.state === 'located' && node.opQueue && node.opQueue.length > 0) {
        const op = OperationQueue.nextRunnable(node);
        if (op) return node;
      }
    }
    return null;
  }

  /**
   * Execute a single operation on a node
   */
  private async executeOperation(node: ContainerNodeRuntime, op: OperationInstance): Promise<void> {
    OperationQueue.markRunning(op);
    
    // Emit UI event instead of direct highlight call
    await this.emitEvent('ui:container:executing', {
      containerId: node.defId,
      containerName: this.def(node.defId)?.name,
      operationType: op.def.type,
      bbox: node.bbox,
      handle: node.handle,
      style: 'executing'
    });
    
    try {
      if (op.def.type === 'find-child') {
        await this.executeFindChildOperation(node, op);
      } else if (this.deps.perform) {
        await this.executePerformOperation(node, op);
      } else if (this.deps.operationExecutor) {
        await this.executeOperationExecutor(node, op);
      } else {
        OperationQueue.markDone(op, { skipped: true, reason: 'no executor' });
      }
    } catch (error: any) {
      OperationQueue.markDone(op, { error: error.message, failed: true });
      node.feedback.fails += 1;
      
      await this.emitEvent(`container:${node.defId}:operation:failed`, {
        containerId: node.defId,
        operationType: op.def.type,
        error: error.message
      });
    }
  }

  /**
   * Execute find-child operation
   */
  private async executeFindChildOperation(node: ContainerNodeRuntime, op: OperationInstance): Promise<void> {
    const res = await this.discovery.discoverChildren(node.defId, node.handle);
    const seen = new Set<string>(node.children || []);
    
    for (const c of res.candidates) {
      if (seen.has(c.defId)) continue;
      seen.add(c.defId);
      
      this.graph.nodes.set(c.defId, {
        defId: c.defId,
        state: 'located',
        handle: c.handle,
        bbox: c.bbox,
        visible: c.visible,
        score: c.score,
        opQueue: OperationQueue.buildDefaultQueue(this.def(c.defId)?.operations),
        runMode: (this.def(c.defId)?.runMode) || 'sequential',
        children: [],
        feedback: { hits: 0, fails: 0 }
      });
      
      this.rel.addParentChild(node.defId, c.defId);
      node.feedback.hits += 1;
      
      await this.emitEvent(`container:${c.defId}:discovered`, {
        containerId: c.defId,
        parentId: node.defId,
        bbox: c.bbox,
        visible: c.visible,
        score: c.score
      });
    }
    
    OperationQueue.markDone(op, { discovered: node.children.length });
    
    await this.emitEvent(`container:${node.defId}:children_discovered`, {
      containerId: node.defId,
      childCount: node.children.length
    });
  }

  /**
   * Execute operation using deps.perform
   */
  private async executePerformOperation(node: ContainerNodeRuntime, op: OperationInstance): Promise<void> {
    const r = await this.deps.perform!(node, op);
    OperationQueue.markDone(op, r);
    
    await this.emitEvent(`container:${node.defId}:operation:completed`, {
      containerId: node.defId,
      operationType: op.def.type,
      result: r
    });
  }

  /**
   * Execute operation using operationExecutor
   */
  private async executeOperationExecutor(node: ContainerNodeRuntime, op: OperationInstance): Promise<void> {
    const result = await this.deps.operationExecutor!.execute(
      node.defId,
      op.def.type,
      op.def.config || {},
      node.handle || node.bbox
    );
    
    OperationQueue.markDone(op, result.data || result);
    
    await this.emitEvent(`container:${node.defId}:operation:completed`, {
      containerId: node.defId,
      operationType: op.def.type,
      result: result.data || result
    });
  }

  /**
   * Handle external operation triggered by BindingRegistry
   */
  private async handleExternalOperation(data: any): Promise<void> {
    const node = this.graph?.nodes.get(data.containerId);
    if (!node) return;
    
    if (this.deps.operationExecutor) {
      try {
        const result = await this.deps.operationExecutor.execute(
          data.containerId,
          data.operationType,
          data.config || {},
          node.handle
        );
        
        await this.emitEvent(`container:${data.containerId}:operation:completed`, {
          containerId: data.containerId,
          operationType: data.operationType,
          result: result.data || result,
          triggeredBy: data.sourceRule
        });
      } catch (error: any) {
        await this.emitEvent(`container:${data.containerId}:operation:failed`, {
          containerId: data.containerId,
          operationType: data.operationType,
          error: error.message,
          triggeredBy: data.sourceRule
        });
      }
    }
  }

  /**
   * Main operation loop - processes all operations in queue
   */
  private async loop(mode: RunMode): Promise<void> {
    while (this.running) {
      const node = this.findNextRunnableNode();
      
      if (!node) {
        // No more operations to run
        break;
      }
      
      const op = OperationQueue.nextRunnable(node);
      if (!op) continue;
      
      // Execute operation
      await this.executeOperation(node, op);
      
      // Wait between operations in sequential mode
      if (mode === 'sequential') {
        await this.deps.wait(100);
      }
    }
    
    this.running = false;
    await this.emitEvent('runtime:loop:completed', {
      totalNodes: this.graph.nodes.size,
      mode
    });
  }

  currentFocus() { return this.focus.getFocus(); }
  currentGraph() { return this.graph; }
  isRunning() { return this.running; }
}

// --- Operation execution hook (Container -> Operation integration) ---
// NOTE: This is a lightweight integration point to execute Operation definitions
// when container runtime dispatches an operation.
export interface OperationExecutorInterface {
  execute: (containerId: string, operationId: string, config: any, handle: any) => Promise<any>;
}
