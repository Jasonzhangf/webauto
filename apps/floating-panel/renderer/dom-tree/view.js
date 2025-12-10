import { formatDomNodeLabel } from '../graph/data-utils.js';
import {
  getDomTree,
  isDefaultVisible,
  isPathExpanded,
  isBranchLoading,
  getDomNodeChildStats,
  DOM_ROOT_PATH,
} from './store.js';

export function createDomTreeView({
  rootElement,
  store,
  getSelectedPath,
  onSelectNode,
  onToggleExpand,
  onHoverNode,
}) {
  return {
    render() {
      renderDomTree({
        rootElement,
        store,
        selectedPath: getSelectedPath ? getSelectedPath() : null,
        onSelectNode,
        onToggleExpand,
        onHoverNode,
      });
    },
  };
}

function renderDomTree({ rootElement, store, selectedPath, onSelectNode, onToggleExpand, onHoverNode }) {
  if (!rootElement) return;
  rootElement.innerHTML = '';
  const rootNode = getDomTree(store);
  if (!rootNode) {
    const placeholder = document.createElement('div');
    placeholder.className = 'tree-empty';
    placeholder.textContent = '暂无 DOM 数据';
    rootElement.appendChild(placeholder);
    return;
  }
  buildDomTreeRows({
    node: rootNode,
    depth: 0,
    target: rootElement,
    store,
    selectedPath,
    onSelectNode,
    onToggleExpand,
    onHoverNode,
  });
}

function buildDomTreeRows({
  node,
  depth,
  target,
  store,
  selectedPath,
  onSelectNode,
  onToggleExpand,
  onHoverNode,
  parentExpanded = false,
}) {
  if (!node) return false;
  const path = node.path || (depth === 0 ? DOM_ROOT_PATH : '');
  const isRoot = depth === 0;
  const expanded = path && isPathExpanded(store, path);
  const autoVisible = false;
  const isVisible =
    isRoot || autoVisible || parentExpanded || (path && isDefaultVisible(store, path)) || (path && expanded);
  if (!isVisible) {
    return false;
  }
  const row = document.createElement('div');
  row.className = 'tree-line tree-line-dom';
  row.style.paddingLeft = `${Math.max(depth - 1, 0) * 18 + 12}px`;
  const header = document.createElement('div');
  header.className = 'tree-line-header';
  if (path && selectedPath === path) {
    row.classList.add('active');
  }

  const { hasChildren, needsLazyLoad } = getDomNodeChildStats(node);
  const loading = path && isBranchLoading(store, path);
  const showExpandToggle = Boolean(path && (hasChildren || needsLazyLoad));

  if (showExpandToggle) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tree-expand-btn';
    expandBtn.textContent = loading ? '…' : expanded ? '−' : '+';
    if (loading) {
      expandBtn.disabled = true;
    }
    expandBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (onToggleExpand) {
        await onToggleExpand(path);
      }
    });
    header.appendChild(expandBtn);
  }

  if (path && loading) {
    row.classList.add('is-loading');
  }

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = formatDomNodeLabel(node) || node.tag || path || '节点';
  header.appendChild(label);

  row.appendChild(header);

  if (Array.isArray(node.containers) && node.containers.length) {
    const meta = document.createElement('span');
    meta.className = 'tree-meta';
    meta.textContent = node.containers
      .map((entry) => entry?.container_name || entry?.container_id || entry?.containerId)
      .filter(Boolean)
      .join(', ');
    if (meta.textContent) {
      row.appendChild(meta);
    }
  }

  if (path) {
    row.dataset.path = path;
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      if (onSelectNode) {
        onSelectNode(path);
      }
    });
    row.addEventListener('dblclick', async (event) => {
      event.stopPropagation();
      if (onToggleExpand) {
        await onToggleExpand(path);
      }
    });
    if (onHoverNode) {
      row.addEventListener('mouseenter', () => onHoverNode(path));
      row.addEventListener('mouseleave', () => onHoverNode(null, { from: path }));
    }
  }

  target.appendChild(row);
  if (!hasChildren) {
    return true;
  }
  if (expanded && Array.isArray(node.children)) {
    node.children.forEach((child) => {
      buildDomTreeRows({
        node: child,
        depth: depth + 1,
        target,
        store,
        selectedPath,
        onSelectNode,
        onToggleExpand,
        onHoverNode,
        parentExpanded: expanded,
      });
    });
  }
  if (!expanded && needsLazyLoad) {
    target.appendChild(createDomPlaceholderRow(depth + 1));
  }
  return true;
}

function createDomPlaceholderRow(depth) {
  const placeholder = document.createElement('div');
  placeholder.className = 'tree-line tree-placeholder';
  placeholder.style.paddingLeft = `${Math.max(depth - 1, 0) * 18 + 28}px`;
  placeholder.textContent = '加载中…';
  return placeholder;
}
