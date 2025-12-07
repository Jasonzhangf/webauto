import type { GraphNode } from './graphStore.js';

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export function computeLayout(nodes: GraphNode[], columnGap = 320, rowGap = 42): PositionedNode[] {
  const containers = nodes.filter((node) => node.type === 'container');
  const domNodes = nodes.filter((node) => node.type === 'dom');
  const positioned: PositionedNode[] = [];

  containers.forEach((node, index) => {
    positioned.push({
      ...node,
      x: 120,
      y: 24 + index * rowGap,
    });
  });

  domNodes.forEach((node, index) => {
    positioned.push({
      ...node,
      x: 120 + columnGap,
      y: 24 + index * rowGap,
    });
  });

  return positioned;
}
