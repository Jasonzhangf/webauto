// Container Engine v2 - Tree Discovery (skeleton)
// Discovers containers from a root, builds a layered tree/graph, supports BFS and scoped search.

import { ContainerDefV2, ContainerGraph, DiscoveryResult, PageContext, SelectorByClass } from './types.js';

export interface DiscoveryOptions {
  maxDepth?: number;
  timeoutMs?: number;
}

export interface DiscoveryDeps {
  queryByClasses: (scopeHandle: any, selector: SelectorByClass) => Promise<any[]>; // DOM search by class
  visible: (handle: any) => Promise<boolean>;
  bboxOf: (handle: any) => Promise<{ x1: number; y1: number; x2: number; y2: number } | undefined>;
  pageContext: () => Promise<PageContext>;
}

export class TreeDiscoveryEngine {
  private defs: Map<string, ContainerDefV2>;
  private deps: DiscoveryDeps;

  constructor(defs: ContainerDefV2[], deps: DiscoveryDeps) {
    this.defs = new Map(defs.map(d => [d.id, d]));
    this.deps = deps;
  }

  public async discoverFromRoot(rootId: string, rootScope: any, opts: DiscoveryOptions = {}): Promise<ContainerGraph> {
    // initialize graph with root node, then do one-level discovery to seed children
    const nodes = new Map();
    const edges: ContainerGraph['edges'] = { parentToChild: [], depends: [] };
    const indices = { byName: new Map(), byType: new Map(), byScope: new Map(), byCapability: new Map(), byPagePattern: new Map() };
    const rootDef = this.defs.get(rootId);
    if (!rootDef) throw new Error(`root def not found: ${rootId}`);
    const rootNode = {
      defId: rootId,
      state: 'unknown',
      handle: rootScope,
      opQueue: [],
      runMode: rootDef.runMode || 'sequential',
      children: [],
      feedback: { hits: 0, fails: 0 },
    } as any;
    nodes.set(rootId, rootNode);

    // one-level discovery (non-blocking errors)
    try {
      const res = await this.discoverChildren(rootId, rootScope);
      const seen = new Set<string>();
      for (const c of res.candidates) {
        if (seen.has(c.defId)) continue; // one instance per child def to seed graph
        seen.add(c.defId);
        nodes.set(c.defId, {
          defId: c.defId,
          state: 'located',
          handle: c.handle,
          bbox: c.bbox,
          visible: c.visible,
          score: c.score,
          opQueue: [],
          runMode: (this.defs.get(c.defId)?.runMode) || 'sequential',
          children: [],
          feedback: { hits: 0, fails: 0 }
        });
        edges.parentToChild.push({ parent: rootId, child: c.defId });
        (rootNode.children as string[]).push(c.defId);
      }
    } catch {}

    return { nodes, edges, indices } as ContainerGraph;
  }

  public async discoverChildren(parentId: string, parentHandle: any): Promise<DiscoveryResult> {
    const parentDef = this.defs.get(parentId);
    if (!parentDef) throw new Error(`parent def not found: ${parentId}`);
    const children = parentDef.children || [];
    const candidates: DiscoveryResult['candidates'] = [];
    const trace: DiscoveryResult['trace'] = [];

    for (const childId of children) {
      const childDef = this.defs.get(childId);
      if (!childDef) continue;
      // Strategy S1: class-based selectors
      const sName = 'class-selector';
      const t0 = Date.now();
      let success = false;
      try {
        for (const sel of childDef.selectors || []) {
          const handles = await this.deps.queryByClasses(parentHandle, sel);
          for (const h of handles) {
            const vis = await this.deps.visible(h).catch((): boolean => false);
            const bb = vis ? await this.deps.bboxOf(h).catch((): any => undefined) : undefined;
            const score = (sel.score ?? 0.5) + (vis ? 0.2 : 0);
            candidates.push({ defId: childId, score, bbox: bb, visible: vis, handle: h });
            success = true;
          }
        }
      } finally {
        trace.push({ strategy: sName, success, durationMs: Date.now() - t0 });
      }
    }
    return { candidates, trace };
  }
}
