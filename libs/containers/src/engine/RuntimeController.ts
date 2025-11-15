// Container Engine v2 - Runtime Controller (skeleton)
// Orchestrates discovery -> queue execution -> incremental loading with parent feedback

import { ContainerDefV2, ContainerGraph, ContainerNodeRuntime, OperationInstance, RunMode, HighlightOptions } from './types.js';
import { TreeDiscoveryEngine } from './TreeDiscoveryEngine.js';
import { RelationshipRegistry } from './RelationshipRegistry.js';
import { OperationQueue, Scheduler } from './OperationQueue.js';
import { FocusManager } from './FocusManager.js';

export interface RuntimeDeps {
  highlight: (bboxOrHandle: any, opts?: HighlightOptions) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  perform: (node: ContainerNodeRuntime, op: OperationInstance) => Promise<any>; // executes non-discovery ops
}

export class RuntimeController {
  private graph!: ContainerGraph;
  private rel!: RelationshipRegistry;
  private focus = new FocusManager();
  private scheduler = new Scheduler();

  constructor(
    private defs: ContainerDefV2[],
    private discovery: TreeDiscoveryEngine,
    private deps: RuntimeDeps
  ) {}

  async start(rootId: string, rootHandle: any, mode: RunMode = 'sequential') {
    this.graph = await this.discovery.discoverFromRoot(rootId, rootHandle);
    this.rel = new RelationshipRegistry(this.graph);
    // seed op queues
    const root = this.graph.nodes.get(rootId)!;
    root.opQueue = OperationQueue.buildDefaultQueue(this.def(rootId)?.operations);
    await this.loop(rootId, mode);
  }

  private def(id: string) { return this.defs.find(d => d.id === id); }

  private async loop(rootId: string, mode: RunMode) {
    // minimal placeholder loop: set focus to root and highlight first op target
    this.focus.setFocus(rootId);
    const node = this.graph.nodes.get(rootId)!;
    // seed opQueue for root
    if (!node.opQueue || node.opQueue.length === 0) node.opQueue = OperationQueue.buildDefaultQueue(this.def(rootId)?.operations);
    const first = OperationQueue.nextRunnable(node);
    if (first) {
      OperationQueue.markRunning(first);
      // Non-blocking, default green highlight for executing container
      void this.deps.highlight(node.bbox || node.handle, {
        color: '#00C853', // green accent
        label: `${this.def(rootId)?.name || rootId}: ${first.def.type}`,
        persistent: true
      });
      if (first.def.type === 'find-child') {
        // discover children and register into graph
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
        }
        OperationQueue.markDone(first, { discovered: node.children.length });
      } else {
        const r = await this.deps.perform(node, first).catch(e => { throw e; });
        OperationQueue.markDone(first, r);
      }
    }
  }

  currentFocus() { return this.focus.getFocus(); }
  currentGraph() { return this.graph; }
}
