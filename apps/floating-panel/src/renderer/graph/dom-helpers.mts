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

  const targetNode = findDomNodeByPath(root, branchNode.path);
  if (!targetNode) {
    console.warn('[mergeDomBranch] Cannot find target node for path:', branchNode.path);
    return false;
  }

  targetNode.children = branchNode.children || [];
  targetNode.childCount = branchNode.childCount || targetNode.childCount;
  return true;
}

