import { findDomNodeByPath } from './dom-helpers.mjs';

export interface ContainerDomConnection {
  containerId: string;
  domPath: string;
}

/**
 * 通用匹配函数：只依赖容器树和 DOM 树本身的数据结构，
 * 不依赖布局坐标或渲染细节。
 *
 * 规则：
 * - 遍历整个容器树；
 * - 对每个节点读取 node.match.nodes[*].dom_path；
 * - 在 DOM 树中确认该 path 是否存在；
 * - 对于同一个 domPath，只保留“树中更深层”的容器作为连线发起者；
 * - 最终产生去重后的 { containerId, domPath } 映射，用于画线。
 */
export function computeContainerDomConnections(
  containerRoot: any,
  domRoot: any,
): ContainerDomConnection[] {
  const connections: ContainerDomConnection[] = [];
  if (!containerRoot || !domRoot) {
    return connections;
  }

  interface DomConnectionCandidate {
    containerId: string;
    domPath: string;
    depth: number;
  }

  // 对于同一个 domPath，只保留“树中更深层”的容器作为发起者。
  const bestByDomPath = new Map<string, DomConnectionCandidate>();

  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== 'object') return;
    const id = node.id || node.name;
    if (id && node.match && Array.isArray(node.match.nodes)) {
      for (const m of node.match.nodes) {
        const p = m && m.dom_path;
        if (typeof p !== 'string' || !p) continue;
        const domNode = findDomNodeByPath(domRoot, p);
        if (!domNode) continue;
        const existing = bestByDomPath.get(p);
        if (!existing || depth > existing.depth) {
          bestByDomPath.set(p, { containerId: id, domPath: p, depth });
        }
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => visit(child, depth + 1));
    }
  };

  visit(containerRoot, 0);

  for (const { containerId, domPath } of bestByDomPath.values()) {
    connections.push({ containerId, domPath });
  }

  return connections;
}
