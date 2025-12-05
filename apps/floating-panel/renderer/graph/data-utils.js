export function flattenContainerTree(root, depth = 0, acc = [], parentId = null) {
  if (!root) return acc;
  acc.push({ container: root, depth, parentId });
  if (Array.isArray(root.children)) {
    const currentId = root.id || root.container_id || root.containerId || parentId;
    root.children.forEach((child) => flattenContainerTree(child, depth + 1, acc, currentId));
  }
  return acc;
}

export function collectDomTargets(domTree, containerId, acc = [], depth = 0) {
  if (!domTree || !containerId) return acc;
  if (Array.isArray(domTree.containers)) {
    const match = domTree.containers.some(
      (item) =>
        item?.container_id === containerId ||
        item?.container_name === containerId ||
        item?.containerId === containerId,
    );
    if (match && domTree.path) {
      acc.push({
        path: domTree.path,
        label: formatDomNodeLabel(domTree),
        selector: domTree.selector || domTree.path || '',
        containerId,
        depth,
      });
    }
  }
  if (Array.isArray(domTree.children)) {
    for (const child of domTree.children) {
      collectDomTargets(child, containerId, acc, depth + 1);
    }
  }
  return acc;
}

export function buildGraphLinks(containerRows, domNodesByContainer) {
  const links = [];
  containerRows.forEach((row) => {
    const id = row.container.id || row.container.container_id;
    const nodes = domNodesByContainer.get(id) || [];
    nodes.forEach((domNode) => {
      links.push({ from: id, to: domNode.path });
    });
  });
  return links;
}

export function formatDomNodeLabel(node) {
  if (!node) return '';
  if (node.selector) return node.selector;
  const parts = [`<${(node.tag || 'node').toLowerCase()}>`];
  if (node.id) parts.push(`#${node.id}`);
  if (node.classes?.length) parts.push(`.${node.classes.join('.')}`);
  return parts.join('');
}
