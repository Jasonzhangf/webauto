const ROOT_PATH = 'root';
const DEFAULT_VISIBLE_DEPTH = 0;

export function createDomTreeStore() {
  return {
    tree: null,
    defaultVisible: new Set(),
    expandedPaths: new Set(),
    branchLoading: new Set(),
  };
}

export function setDomTreeSnapshot(store, tree) {
  if (!store) return;
  store.tree = tree || null;
  if (store.tree) {
    if (!store.tree.path) {
      store.tree.path = ROOT_PATH;
    }
    normalizeDomTreePaths(store.tree);
  }
  store.defaultVisible = new Set();
  store.expandedPaths = new Set();
  if (store.tree?.path) {
    store.expandedPaths.add(store.tree.path);
  }
  store.branchLoading = new Set();
}

export function getDomTree(store) {
  return store?.tree || null;
}

export function resetDomVisibility(store, containerIds = new Set(), selectedPath = null) {
  if (!store) return;
  store.defaultVisible = new Set();
  store.expandedPaths = new Set();
  const tree = store.tree;
  if (!tree) return;
  const rootPath = tree.path || ROOT_PATH;
  store.defaultVisible.add(rootPath);
  store.expandedPaths.add(rootPath);
  addPathAncestors(store, selectedPath);
}

export function isDefaultVisible(store, path) {
  if (!store || !path) return false;
  return store.defaultVisible.has(path);
}

export function isPathExpanded(store, path) {
  if (!store || !path) return false;
  return store.expandedPaths.has(path);
}

export function setPathExpanded(store, path, expanded) {
  if (!store || !path) return;
  if (expanded) {
    store.expandedPaths.add(path);
  } else {
    store.expandedPaths.delete(path);
  }
}

export function isBranchLoading(store, path) {
  if (!store || !path) return false;
  return store.branchLoading.has(path);
}

export function setBranchLoading(store, path, loading) {
  if (!store || !path) return;
  if (loading) {
    store.branchLoading.add(path);
  } else {
    store.branchLoading.delete(path);
  }
}

export function getDomNodeChildStats(node) {
  const rendered = Array.isArray(node?.children) ? node.children.length : 0;
  const hasDeclared = typeof node?.childCount === 'number';
  const declared = hasDeclared ? node.childCount : rendered;
  const hasChildren = hasDeclared ? node.childCount > 0 || rendered > 0 : true;
  const needsLazyLoad = hasDeclared ? node.childCount > rendered : true;
  return { rendered, declared, hasChildren, needsLazyLoad, hasDeclared };
}

export function findDomNodeByPath(root, targetPath) {
  if (!root || !targetPath) return null;
  const normalizedTarget = normalizeDomPathString(targetPath);
  if ((root.path || ROOT_PATH) === normalizedTarget) return root;
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const result = findDomNodeByPath(child, normalizedTarget);
      if (result) return result;
    }
  }
  return null;
}

export function findAllDomPathsForContainer(containerId, root, acc = []) {
  if (!root || !containerId) return acc;
  if (Array.isArray(root.containers)) {
    const match = root.containers.some(
      (item) =>
        item?.container_id === containerId ||
        item?.container_name === containerId ||
        item?.containerId === containerId,
    );
    if (match && root.path) {
      acc.push(root.path);
    }
  }
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      findAllDomPathsForContainer(containerId, child, acc);
    }
  }
  if (!acc.length && root.path) {
    acc.push(root.path);
  }
  return acc;
}

export function mergeDomBranchIntoTree(store, branchNode) {
  if (!store?.tree || !branchNode?.path) return false;
  normalizeDomTreePaths(branchNode);
  let target = findDomNodeByPath(store.tree, branchNode.path);
  if (!target) {
    target = ensureDomPathNode(store, branchNode.path);
  }
  if (!target) return false;
  target.tag = branchNode.tag;
  target.id = branchNode.id;
  target.classes = Array.isArray(branchNode.classes) ? [...branchNode.classes] : branchNode.classes || [];
  target.childCount = branchNode.childCount;
  target.textSnippet = branchNode.textSnippet;
  target.selector = branchNode.selector || target.selector;
  target.containers = Array.isArray(branchNode.containers) ? branchNode.containers : target.containers || [];
  target.children = Array.isArray(branchNode.children) ? branchNode.children : [];
  return true;
}

export function ensureDomPathExists(store, path) {
  return ensureDomPathNode(store, path);
}

function ensureDomPathNode(store, path) {
  if (!store?.tree || !path) return null;
  const normalized = normalizeDomPathString(path);
  const tokens = normalized.split('/').filter((token) => token.length);
  if (!tokens.length) return null;
  if (!store.tree.path) {
    store.tree.path = tokens[0];
  }
  let current = store.tree;
  let currentPath = current.path;
  for (let i = 1; i < tokens.length; i += 1) {
    const segment = tokens[i];
    currentPath = `${currentPath}/${segment}`;
    if (!Array.isArray(current.children)) {
      current.children = [];
    }
    let next = current.children.find((child) => child.path === currentPath);
    if (!next) {
      next = {
        path: currentPath,
        tag: 'DIV',
        id: null,
        classes: [],
        childCount: 0,
        children: [],
      };
      current.children.push(next);
    }
    // Ensure intermediate placeholders remain traversable in the tree renderer:
    // it relies on `childCount` to decide whether a node has children.
    if (typeof current.childCount !== 'number') {
      current.childCount = current.children.length;
    } else {
      current.childCount = Math.max(current.childCount, current.children.length);
    }
    current = next;
  }
  return current;
}

export function normalizeDomTreePaths(node) {
  if (!node) return;
  node.path = normalizeDomPathString(node.path);
  if (Array.isArray(node.children)) {
    node.children.forEach((child, index) => {
      if (!child.path) {
        child.path = `${node.path}/${index}`;
      }
      normalizeDomTreePaths(child);
    });
  }
}

export function normalizeDomPathString(rawPath) {
  if (!rawPath) return ROOT_PATH;
  const parts = rawPath.split('/').filter((token) => token.length);
  if (!parts.length) {
    return ROOT_PATH;
  }
  if (parts[0] === '__root__') {
    parts[0] = ROOT_PATH;
  }
  if (parts[0] !== ROOT_PATH) {
    parts.unshift(ROOT_PATH);
  }
  return parts.join('/');
}

function markDomVisibility(node, allowed, containerIds) {
  if (!node) return false;
  const path = node.path;
  let match = false;
  if (Array.isArray(node.containers) && node.containers.length) {
    match = node.containers.some((entry) => {
      const containerId = entry?.container_id || entry?.containerId || entry?.container_name;
      return containerId && containerIds.has(containerId);
    });
  }
  let childHas = false;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (markDomVisibility(child, allowed, containerIds)) {
        childHas = true;
      }
    }
  }
  if ((match || childHas) && path) {
    allowed.add(path);
    return true;
  }
  return match || childHas;
}

function addPathAncestors(store, path) {
  if (!store || !path) return;
  const normalized = normalizeDomPathString(path);
  const parts = normalized.split('/');
  if (!parts.length) return;
  let current = parts[0];
  for (let i = 0; i < parts.length; i += 1) {
    current = i === 0 ? parts[0] : `${current}/${parts[i]}`;
    store.defaultVisible.add(current);
    store.expandedPaths.add(current);
  }
}

export const DOM_ROOT_PATH = ROOT_PATH;

function addDepthVisibility(node, allowed, depthLimit, depth = 0) {
  if (!node || typeof depthLimit !== 'number') return;
  if (depth > depthLimit) return;
  if (node.path) {
    allowed.add(node.path);
  }
  if (!Array.isArray(node.children)) return;
  node.children.forEach((child) => addDepthVisibility(child, allowed, depthLimit, depth + 1));
}
