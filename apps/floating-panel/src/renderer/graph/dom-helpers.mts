export function findDomNodeByPath(root: any, targetPath: string | null): any | null {
  if (!root || typeof root !== 'object' || !targetPath) return null;
  if (root.path === targetPath) return root;

  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const found = findDomNodeByPath(child, targetPath);
      if (found) return found;
    }
  }

  return null;
}

export function findNearestExistingPath(root: any, path: string | null): string | null {
  if (!path || !root) return null;
  const parts = path.split('/');
  while (parts.length > 1) {
    parts.pop();
    const candidate = parts.join('/');
    if (candidate && findDomNodeByPath(root, candidate)) {
      return candidate;
    }
  }
  return 'root';
}

export function mergeDomBranch(root: any, branchNode: any): boolean {
  if (!branchNode || !root) return false;

  if (!branchNode.path) {
    console.warn('[mergeDomBranch] Branch node missing path');
    return false;
  }

  // 优先尝试直接覆盖已有节点
  const directTarget = findDomNodeByPath(root, branchNode.path);
  if (directTarget) {
    directTarget.children = branchNode.children || [];
    directTarget.childCount = branchNode.childCount || directTarget.childCount;
    return true;
  }

  // 如果不存在同路径节点，则尝试挂载到最近存在的祖先节点下
  const ancestorPath = findNearestExistingPath(root, branchNode.path);
  if (ancestorPath) {
    const ancestorNode = findDomNodeByPath(root, ancestorPath);
    if (ancestorNode) {
      if (!Array.isArray(ancestorNode.children)) {
        ancestorNode.children = [];
      }

      const existingIndex = ancestorNode.children.findIndex(
        (child: any) => child && child.path === branchNode.path,
      );

      if (existingIndex >= 0) {
        ancestorNode.children[existingIndex] = branchNode;
      } else {
        ancestorNode.children.push(branchNode);
      }

      const currentCount = typeof ancestorNode.childCount === 'number' ? ancestorNode.childCount : 0;
      ancestorNode.childCount = Math.max(currentCount, ancestorNode.children.length);

      console.log(
        '[mergeDomBranch] Attached branch at ancestor:',
        ancestorPath,
        'as child path:',
        branchNode.path,
      );
      return true;
    }
  }

  console.warn('[mergeDomBranch] Cannot find target or ancestor node for path:', branchNode.path);
  return false;
}
