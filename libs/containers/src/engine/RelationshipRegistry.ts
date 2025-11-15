// Container Engine v2 - Relationship Registry (skeleton)
// Registers parent-child and dependency edges, validates basic invariants.

import { ContainerGraph } from './types.js';

export class RelationshipRegistry {
  constructor(private graph: ContainerGraph) {}

  addParentChild(parent: string, child: string) {
    this.graph.edges.parentToChild.push({ parent, child });
    const p = this.graph.nodes.get(parent);
    if (p && !p.children.includes(child)) p.children.push(child);
  }

  addDepends(from: string, to: string) {
    this.graph.edges.depends.push({ from, to });
  }

  hasCycle(): boolean {
    // optional: implement cycle detection
    return false;
  }
}

