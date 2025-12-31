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
  let bestLength = 0;

  function traverse(node: any): void {
    if (!node) return;

    let containerPath: string | null = null;
    if (node.match && node.match.nodes && node.match.nodes.length > 0) {
      containerPath = node.match.nodes[0].dom_path;
    }

    if (containerPath && domPath.startsWith(containerPath)) {
      if (containerPath.length > bestLength) {
        bestMatch = node;
        bestLength = containerPath.length;
      }
    }

    if (node.children) {
      node.children.forEach((child: any) => traverse(child));
    }
  }

  traverse(root);
  return bestMatch || root;
}

export function populateSelectorMap(
  containerData: any,
  selectorMap: Map<string, string>,
  domNodePositions: Map<string, any>,
): void {
  selectorMap.clear();
  if (!containerData) return;

  function traverse(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.selectors && Array.isArray(node.selectors)) {
      node.selectors.forEach((selector: any) => {
        if (selector.css) {
          const domNodes = Array.from(domNodePositions.keys());
          const matchedNode = domNodes.find(() => {
            return selector.css.includes('#') ? false : true;
          });
          if (matchedNode) {
            selectorMap.set(selector.css, matchedNode);
          }
        }
      });
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any) => traverse(child));
    }
  }

  traverse(containerData);
}

