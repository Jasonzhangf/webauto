export function expandPathToNode(node: any, targetId: string | null, expandedNodes: Set<string>): boolean {
  if (!node || !targetId) return false;
  if (node.id === targetId || node.name === targetId) {
    expandedNodes.add(node.id || node.name);
    return true;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (expandPathToNode(child, targetId, expandedNodes)) {
        expandedNodes.add(node.id || node.name);
        return true;
      }
    }
  }
  return false;
}

export function findNearestContainer(root: any, domPath: string | null): any | null {
  if (!root || !domPath) return null;

  let bestMatch: any | null = null;
  let bestDistance = Infinity;
  let bestTreeDepth = -1;

  function considerCandidate(containerPath: string | null, treeDepth: number, node: any): void {
    if (!containerPath || typeof containerPath !== 'string' || !containerPath) return null;

    const cParts = String(containerPath).split('/').filter(Boolean);
    const dParts = String(domPath).split('/').filter(Boolean);

    // 精确父子关系：要求容器路径是 DOM 路径的前缀（祖先或同一节点）。
    const maxCommon = Math.min(cParts.length, dParts.length);
    let common = 0;
    while (common < maxCommon && cParts[common] === dParts[common]) {
      common += 1;
    }
    // 只接受「容器路径完整匹配公共前缀」的情况：容器是当前 DOM 节点的祖先或同一节点。
    if (common !== cParts.length) {
      return;
    }

    // DOM 距离：当前节点距容器节点相差多少层；越小越近。
    const distance = dParts.length - cParts.length;

    if (distance < 0) {
      // 容器在 DOM 路径之下（后代），不可能是父容器，跳过。
      return;
    }

    // 优先选距离最近的祖先；若距离相同，则选容器树更深的节点（更“具体”的容器）。
    if (distance < bestDistance || (distance === bestDistance && treeDepth > bestTreeDepth)) {
      bestDistance = distance;
      bestTreeDepth = treeDepth;
      bestMatch = node;
    }
  }

  function traverse(node: any, depth: number): void {
    if (!node) return;

    if (node.match && Array.isArray(node.match.nodes)) {
      for (const m of node.match.nodes) {
        const containerPath = m && m.dom_path;
        considerCandidate(containerPath, depth, node);
      }
    }

    if (node.children) {
      node.children.forEach((child: any) => traverse(child, depth + 1));
    }
  }

  traverse(root, 0);
  return bestMatch || root;
}
