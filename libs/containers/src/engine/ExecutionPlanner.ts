// Container Engine v2 - Execution Planner (skeleton)
// Produces topological plan honoring parent->child and dependsOn constraints

import { ContainerGraph, RunMode } from './types.js';

export interface PlanStep { containerId: string; opIndex: number; }
export interface ExecutionPlan { order: PlanStep[]; mode: RunMode; }

export class ExecutionPlanner {
  constructor(private graph: ContainerGraph) {}

  buildPlan(rootId: string, mode: RunMode = 'sequential'): ExecutionPlan {
    const order: PlanStep[] = [];
    const visited = new Set<string>();

    const dfs = (cid: string) => {
      if (visited.has(cid)) return;
      visited.add(cid);
      const node = this.graph.nodes.get(cid);
      if (!node) return;
      for (let i = 0; i < node.opQueue.length; i++) order.push({ containerId: cid, opIndex: i });
      for (const e of this.graph.edges.parentToChild.filter(e => e.parent === cid)) dfs(e.child);
    };
    dfs(rootId);
    return { order, mode };
  }
}

