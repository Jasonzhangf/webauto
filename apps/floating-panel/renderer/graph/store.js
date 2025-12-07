export function createGraphStore() {
  return {
    containers: new Map(),
    domNodes: new Map(),
    containerChildren: new Map(),
    domChildren: new Map(),
  };
}

export function resetGraphStore(store) {
  store.containers.clear();
  store.domNodes.clear();
  store.containerChildren.clear();
  store.domChildren.clear();
}

export function ingestContainerTree(store, node, depth = 0, parentId = null) {
  if (!node || !node.id) return;
  store.containers.set(node.id, {
    id: node.id,
    name: node.name,
    label: node.name || node.id,
    parentId,
    depth,
    selectors: node.selectors || [],
    match: node.match || {},
    type: node.type || 'container',
    metadata: node.metadata || {},
  });
  if (parentId) {
    if (!store.containerChildren.has(parentId)) {
      store.containerChildren.set(parentId, new Set());
    }
    store.containerChildren.get(parentId)?.add(node.id);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => ingestContainerTree(store, child, depth + 1, node.id));
  }
}

export function ingestDomTree(store, node, depth = 0, parentPath = null) {
  if (!node || !node.path) return;
  const childCount =
    typeof node.childCount === 'number'
      ? node.childCount
      : Array.isArray(node.children)
        ? node.children.length
        : 0;
  store.domNodes.set(node.path, {
    path: node.path,
    tag: node.tag,
    id: node.id,
    classes: node.classes || [],
    selector: node.selector,
    parentPath,
    depth,
    childCount,
    containers: node.containers || [],
    loading: false,
  });
  if (parentPath) {
    if (!store.domChildren.has(parentPath)) {
      store.domChildren.set(parentPath, new Set());
    }
    store.domChildren.get(parentPath)?.add(node.path);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => ingestDomTree(store, child, depth + 1, node.path));
  }
}

export function ingestDomBranch(store, branchNode, parentPath = null) {
  if (!branchNode?.path) return;
  const existing = store.domNodes.get(branchNode.path) || {};
  const childCount =
    typeof branchNode.childCount === 'number'
      ? branchNode.childCount
      : Array.isArray(branchNode.children)
        ? branchNode.children.length
        : existing.childCount || 0;
  const depth =
    typeof existing.depth === 'number'
      ? existing.depth
      : parentPath && store.domNodes.get(parentPath)
        ? (store.domNodes.get(parentPath)?.depth || 0) + 1
        : 0;
  const merged = {
    ...existing,
    path: branchNode.path,
    tag: branchNode.tag || existing.tag,
    id: branchNode.id || existing.id,
    classes: branchNode.classes || existing.classes || [],
    selector: branchNode.selector || existing.selector,
    parentPath: existing.parentPath || parentPath || null,
    depth,
    childCount,
    containers: branchNode.containers || existing.containers || [],
    loading: false,
  };
  store.domNodes.set(branchNode.path, merged);
  store.domChildren.set(branchNode.path, new Set());
  if (merged.parentPath) {
    if (!store.domChildren.has(merged.parentPath)) {
      store.domChildren.set(merged.parentPath, new Set());
    }
    store.domChildren.get(merged.parentPath)?.add(branchNode.path);
  }
  if (Array.isArray(branchNode.children)) {
    branchNode.children.forEach((child) => ingestDomBranch(store, child, branchNode.path));
  }
}

export function buildGraphData(store, rootContainerId) {
  const containerRows = [];
  const rootNode = store.containers.get(rootContainerId);
  if (rootNode) {
    flattenContainer(store, rootNode, containerRows);
  }
  const domNodes = Array.from(store.domNodes.values()).map((node) => {
    const loaded = store.domChildren.get(node.path)?.size || 0;
    const canExpand = (node.childCount || 0) > loaded;
    const hasContainerChildren = node.containers?.some((entry) => {
      const containerId = entry?.container_id || entry?.container_name || entry?.containerId;
      return containerId && store.containerChildren.get(containerId)?.size;
    });
    const domContainerId = node.containers?.[0]?.container_id || node.containers?.[0]?.container_name;
    return {
      path: node.path,
      parentPath: node.parentPath || null,
      label: formatDomLabel(node),
      selector: node.selector,
      containerId: domContainerId,
      depth: node.depth,
      canExpand: canExpand || Boolean(hasContainerChildren),
      hasContainerChildren: Boolean(hasContainerChildren),
      expanded: Boolean(node.expanded),
      loading: Boolean(node.loading),
    };
  });
  const domNodesByContainer = new Map();
  domNodes.forEach((node) => {
    if (!node.containerId) return;
    if (!domNodesByContainer.has(node.containerId)) {
      domNodesByContainer.set(node.containerId, []);
    }
    domNodesByContainer.get(node.containerId)?.push(node);
  });
  const links = [];
  containerRows.forEach((row) => {
    const id = row.container.id;
    const nodes = domNodesByContainer.get(id) || [];
    nodes.forEach((domNode) => links.push({ from: id, to: domNode.path }));
  });
  return { containerRows, domNodes, links };
}

function flattenContainer(store, node, acc, depth = 0, parentId = null) {
  acc.push({
    container: {
      id: node.id,
      name: node.label,
      selectors: node.selectors,
      match: node.match,
    },
    depth,
    parentId,
  });
  const children = store.containerChildren.get(node.id);
  if (children) {
    children.forEach((childId) => {
      const child = store.containers.get(childId);
      if (child) {
        flattenContainer(store, child, acc, depth + 1, node.id);
      }
    });
  }
}

function formatDomLabel(node) {
  const parts = [`<${(node.tag || 'node').toLowerCase()}>`];
  if (node.id) parts.push(`#${node.id}`);
  if (node.classes?.length) parts.push(`.${node.classes.join('.')}`);
  return parts.join('');
}

export function getDomNode(store, path) {
  return store.domNodes.get(path) || null;
}

export function getDomChildren(store, path) {
  return Array.from(store.domChildren.get(path) || []);
}

export function markExpanded(store, path, expanded) {
  const node = store.domNodes.get(path);
  if (!node) return;
  store.domNodes.set(path, { ...node, expanded });
}

export function markLoading(store, path, loading) {
  const node = store.domNodes.get(path);
  if (!node) return;
  store.domNodes.set(path, { ...node, loading });
}
