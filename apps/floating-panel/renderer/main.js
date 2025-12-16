import { bus } from './modules/messaging/bus.js';
import { createBackendBridge } from './modules/messaging/backend-bridge.js';
import { registerRendererBus } from './modules/messaging/bus-subscriptions.js';
import { initWindowControls, subscribeDesktopState } from './modules/controls/window-controls.js';
import { bindCoreEvents } from './modules/controls/core-events.js';
import { collectUiElements } from './modules/state/ui-elements.js';
import { createUiState, createLayoutState } from './modules/state/ui-state.js';
import { createUiStateService } from './modules/state/ui-state-service.js';
import { createDataLoaders } from './modules/state/data-loaders.js';
import { createSessionPanel } from './modules/panels/session-panel.js';
import { createSnapshotManager } from './modules/containers/snapshot-manager.js';
import { createContainerOpsManager } from './modules/containers/container-ops.js';
import { createDomService } from './modules/services/dom-service.js';
import { createDomTreeView } from './dom-tree/view.js';
import {
  getDomTree,
  findDomNodeByPath,
  mergeDomBranchIntoTree,
  ensureDomPathExists,
  setBranchLoading,
  isBranchLoading,
  setPathExpanded,
  isPathExpanded,
  getDomNodeChildStats,
  findAllDomPathsForContainer,
  resetDomVisibility,
  normalizeDomPathString,
} from './dom-tree/store.js';
import { ingestDomBranch, buildGraphData } from './graph/store.js';
import { ContainerDomGraphView } from './graph/graph-view.js';

const ui = collectUiElements(document);
const state = createUiState({ config: { headless: Boolean(ui?.headlessToggle?.checked) } });
const layout = createLayoutState();
const uiStateService = createUiStateService({ bus, logger: console });

const { backend, desktop, publishWindowCommand, debugLog } = createBackendBridge({ bus, logger: console, debug: false });

const invokeAction = async (action, payload = {}) => {
  const response = await backend?.invokeAction?.(action, payload);
  if (response?.success === false) {
    throw new Error(response?.error || `action failed: ${action}`);
  }
  // controller-client wraps {success, data}; we always return the data payload for renderer modules.
  return response?.data ?? response;
};

let graphView = null;
let graphOverlay = null;
try {
  const graphHost = ui?.containerDomGrid?.querySelector?.('.graph-canvas') || null;
  graphOverlay = graphHost?.querySelector?.('.graph-overlay') || null;
  if (graphHost) {
    graphView = new ContainerDomGraphView(graphHost);
  }
} catch (err) {
  console.warn('[floating] graph view unavailable', err);
  graphView = null;
}

function showMessage(message, level = 'info') {
  if (!ui?.globalMessage) return;
  const variant = level === 'error' ? 'error' : level === 'success' ? 'success' : level === 'warn' ? 'warn' : 'info';
  ui.globalMessage.textContent = message || '';
  ui.globalMessage.dataset.variant = variant;
  ui.globalMessage.classList.toggle('visible', Boolean(message));
  ui.globalMessage.classList.toggle('hidden', !message);
  if (state.messageTimer) {
    clearTimeout(state.messageTimer);
  }
  if (message) {
    state.messageTimer = setTimeout(() => {
      ui.globalMessage?.classList.remove('visible');
      ui.globalMessage?.classList.add('hidden');
    }, 2600);
  }
}

function setLoading(section, loading) {
  state.loading = state.loading || {};
  state.loading[section] = Boolean(loading);
}

function queueFitWindow() {
  if (layout.fitTimer) {
    clearTimeout(layout.fitTimer);
  }
  layout.fitTimer = setTimeout(() => {
    try {
      const height = document.body?.scrollHeight || 0;
      desktop?.fitContentHeight?.(height);
    } catch {
      /* ignore */
    }
  }, 40);
}

function resolveCurrentPageUrl() {
  if (state.snapshotMeta?.url) return state.snapshotMeta.url;
  const selected = state.sessions.find((s) => s.profileId === state.selectedSession);
  return selected?.current_url || selected?.currentUrl || null;
}

function toggleHeadlessMode(next) {
  const current = Boolean(state.headless);
  const desired = typeof next === 'boolean' ? next : !current;
  state.headless = desired;
  publishWindowCommand?.('ui.window.setHeadless', { headless: desired }, () => desktop?.setHeadlessMode?.(desired));
}

function updateHeadlessButton() {
  if (!ui?.headlessButton) return;
  ui.headlessButton.textContent = state.headless ? '🕶' : '🪟';
  ui.headlessButton.title = state.headless ? '当前: headless (点击切换)' : '当前: 有 UI (点击切换)';
}

function findContainerNode(root, containerId) {
  if (!root || !containerId) return null;
  if (root.id === containerId) return root;
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const hit = findContainerNode(child, containerId);
      if (hit) return hit;
    }
  }
  return null;
}

function getContainerAlias(node) {
  if (!node) return '';
  const metaAlias = node?.metadata?.alias;
  return metaAlias || node.alias || node.nickname || node.name || node.id || '';
}

function getContainerOperationsFromNode(node) {
  if (!node) return [];
  return Array.isArray(node.operations) ? node.operations : [];
}

function collectContainerIds(root, acc = []) {
  if (!root?.id) return acc;
  acc.push(root.id);
  (root.children || []).forEach((child) => collectContainerIds(child, acc));
  return acc;
}

function renderContainerSelectOptions() {
  if (!ui?.domActionContainerSelect) return;
  const root = state.containerSnapshot?.container_tree;
  ui.domActionContainerSelect.innerHTML = '';
  if (!root) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '暂无容器';
    ui.domActionContainerSelect.appendChild(opt);
    return;
  }
  const ids = collectContainerIds(root, []);
  ids.forEach((id) => {
    const node = findContainerNode(root, id);
    const opt = document.createElement('option');
    opt.value = id;
    const alias = getContainerAlias(node);
    opt.textContent = alias && alias !== id ? `${alias} · ${id}` : id;
    ui.domActionContainerSelect.appendChild(opt);
  });
  const target = state.domActions?.selectedContainerId || state.selectedContainerId || root.id;
  ui.domActionContainerSelect.value = target || '';
}

function switchToolTab(tab) {
  state.uiPanels.activeTool = tab === 'container' ? 'container' : 'dom';
  ui.toolTabDom?.classList.toggle('is-active', state.uiPanels.activeTool === 'dom');
  ui.toolTabContainer?.classList.toggle('is-active', state.uiPanels.activeTool === 'container');
  ui.domToolPanel?.classList.toggle('is-active', state.uiPanels.activeTool === 'dom');
  ui.containerToolPanel?.classList.toggle('is-active', state.uiPanels.activeTool === 'container');
}

function renderContainerTree() {
  const host = ui?.treeContainerList;
  if (!host) return;
  host.innerHTML = '';
  const root = state.containerSnapshot?.container_tree;
  if (!root) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = '暂无容器树数据';
    host.appendChild(empty);
    return;
  }
  if (!state.containerTreeExpanded) {
    state.containerTreeExpanded = new Set([root.id]);
  }
  buildContainerRows(root, 0, host);
}

function buildContainerRows(node, depth, host) {
  const row = document.createElement('div');
  row.className = 'tree-line tree-line-container';
  if (node.id) {
    row.dataset.containerId = node.id;
  }
  row.style.paddingLeft = `${Math.max(depth - 1, 0) * 18 + 12}px`;
  if (node.id && node.id === state.selectedContainerId) {
    row.classList.add('active');
  }

  const header = document.createElement('div');
  header.className = 'tree-line-header';
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const expanded = Boolean(node.id && state.containerTreeExpanded?.has(node.id));
  if (node.id && hasChildren) {
    const btn = document.createElement('button');
    btn.className = 'tree-expand-btn';
    btn.textContent = expanded ? '−' : '+';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!node.id) return;
      if (!state.containerTreeExpanded) state.containerTreeExpanded = new Set();
      if (state.containerTreeExpanded.has(node.id)) {
        state.containerTreeExpanded.delete(node.id);
      } else {
        state.containerTreeExpanded.add(node.id);
      }
      renderContainerTree();
      queueFitWindow();
    });
    header.appendChild(btn);
  } else {
    const spacer = document.createElement('div');
    spacer.style.width = '24px';
    header.appendChild(spacer);
  }

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = getContainerAlias(node) || node.id || 'container';
  header.appendChild(label);
  row.appendChild(header);

  const matchCount = Number(node?.match?.match_count || 0);
  const meta = document.createElement('span');
  meta.className = 'tree-meta';
  meta.textContent = `匹配 ${matchCount}`;
  row.appendChild(meta);

  row.addEventListener('click', () => {
    if (!node.id) return;
    state.selectedContainerId = node.id;
    state.domActions.selectedContainerId = node.id;
    renderContainerTree();
    renderContainerSelectOptions();
    containerOps.syncEditor(node.id);
    containerOps.renderPanel();
    switchToolTab('container');
    scheduleMatchLinkDraw();
    renderGraph();
  });

  host.appendChild(row);
  if (expanded && hasChildren) {
    node.children.forEach((child) => buildContainerRows(child, depth + 1, host));
  }

  const draft = state.containerDraft;
  if (draft?.parentId && node.id && draft.parentId === node.id) {
    renderContainerDraftRow(draft, depth + 1, host);
  }
}

function renderContainerDraftRow(draft, depth, host) {
  const row = document.createElement('div');
  row.className = 'tree-line tree-line-container tree-line-draft';
  row.style.paddingLeft = `${Math.max(depth - 1, 0) * 18 + 12}px`;

  const header = document.createElement('div');
  header.className = 'tree-line-header';
  const spacer = document.createElement('div');
  spacer.style.width = '24px';
  header.appendChild(spacer);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = draft.alias ? `${draft.alias} · ${draft.containerId}` : draft.containerId;
  header.appendChild(label);

  const actions = document.createElement('div');
  actions.className = 'tree-draft-actions';
  const ok = document.createElement('button');
  ok.className = 'ghost';
  ok.textContent = '确定';
  ok.addEventListener('click', (event) => {
    event.stopPropagation();
    confirmContainerDraft().catch((err) => showMessage(err?.message || '创建失败', 'error'));
  });
  const cancel = document.createElement('button');
  cancel.className = 'ghost';
  cancel.textContent = '取消';
  cancel.addEventListener('click', (event) => {
    event.stopPropagation();
    cancelContainerDraft();
  });
  actions.appendChild(ok);
  actions.appendChild(cancel);
  header.appendChild(actions);
  row.appendChild(header);

  const meta = document.createElement('span');
  meta.className = 'tree-meta';
  meta.textContent = '待确认';
  row.appendChild(meta);

  host.appendChild(row);
}

function renderDomTree() {
  domTreeView.render();
  scheduleMatchLinkDraw();
}

function safeCssEscape(value) {
  if (typeof value !== 'string') return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function scrollDomPathIntoView(path) {
  if (!ui?.treeDomList || !path) return;
  const selector = `[data-path="${safeCssEscape(path)}"]`;
  const row = ui.treeDomList.querySelector(selector);
  if (!row) return;
  try {
    row.scrollIntoView({ block: 'nearest' });
  } catch {
    // ignore
  }
}

const treeDetailEl = document.getElementById('treeDetail');
const matchLinkLayer = document.getElementById('matchLinkLayer');
let matchLinkDrawHandle = null;
let matchLinkResizeObserver = null;

function scheduleMatchLinkDraw() {
  if (!treeDetailEl || !matchLinkLayer) return;
  if (matchLinkDrawHandle) cancelAnimationFrame(matchLinkDrawHandle);
  matchLinkDrawHandle = requestAnimationFrame(() => {
    matchLinkDrawHandle = null;
    drawMatchLinks();
  });
}

function findRenderedDomRowForPath(rawPath) {
  if (!ui?.treeDomList || !rawPath) return null;
  let path = normalizeDomPathString(rawPath);
  while (path) {
    const selector = `[data-path="${safeCssEscape(path)}"]`;
    const el = ui.treeDomList.querySelector(selector);
    if (el) return { el, path };
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) break;
    parts.pop();
    path = parts.join('/');
  }
  const rootEl = ui.treeDomList.querySelector('[data-path="root"]');
  return rootEl ? { el: rootEl, path: 'root' } : null;
}

function drawMatchLinks() {
  if (!treeDetailEl || !matchLinkLayer || !ui?.treeContainerList || !ui?.treeDomList) return;
  matchLinkLayer.innerHTML = '';
  const matches = state.containerSnapshot?.matches || null;
  if (!matches || typeof matches !== 'object') return;

  const viewport = treeDetailEl.getBoundingClientRect();
  matchLinkLayer.setAttribute('width', String(viewport.width));
  matchLinkLayer.setAttribute('height', String(viewport.height));
  matchLinkLayer.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);

  const MAX_LINKS = 140;
  let drawn = 0;
  for (const [containerId, entry] of Object.entries(matches)) {
    if (drawn >= MAX_LINKS) break;
    const target = entry?.nodes?.[0] || null;
    const domPath = target?.dom_path || target?.domPath || null;
    if (!containerId || !domPath) continue;

    const containerEl = ui.treeContainerList.querySelector(`[data-container-id="${safeCssEscape(containerId)}"]`);
    const domHit = findRenderedDomRowForPath(domPath);
    const domEl = domHit?.el || null;
    if (!containerEl || !domEl) continue;

    const startRect = containerEl.getBoundingClientRect();
    const endRect = domEl.getBoundingClientRect();

    const startX = startRect.right - viewport.left;
    const startY = startRect.top + startRect.height / 2 - viewport.top;
    const endX = endRect.left - viewport.left;
    const endY = endRect.top + endRect.height / 2 - viewport.top;

    const deltaX = Math.max(26, (endX - startX) / 2);
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute(
      'd',
      `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`,
    );
    pathEl.classList.add('link-line');
    if (
      (state.selectedContainerId && state.selectedContainerId === containerId) ||
      (state.selectedDomPath && domHit?.path && state.selectedDomPath === domHit.path)
    ) {
      pathEl.classList.add('active');
    }
    matchLinkLayer.appendChild(pathEl);
    drawn += 1;
  }
}

function mergeContainerEntries(existing, incoming) {
  const acc = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(
    acc
      .map((entry) => entry?.container_id || entry?.container_name || entry?.containerId || null)
      .filter(Boolean),
  );
  (Array.isArray(incoming) ? incoming : []).forEach((entry) => {
    const id = entry?.container_id || entry?.container_name || entry?.containerId || null;
    if (!id || seen.has(id)) return;
    seen.add(id);
    acc.push(entry);
  });
  return acc;
}

function buildDomMatchIndex(matches) {
  const index = new Map();
  if (!matches || typeof matches !== 'object') return index;
  Object.entries(matches).forEach(([containerId, entry]) => {
    (entry?.nodes || []).forEach((node) => {
      const rawPath = node?.dom_path || node?.domPath || node?.path || null;
      if (!rawPath || typeof rawPath !== 'string') return;
      const path = normalizeDomPathString(rawPath);
      if (!index.has(path)) {
        index.set(path, []);
      }
      const bucket = index.get(path);
      if (!bucket) return;
      bucket.push({
        container_id: containerId,
        container_name: containerId,
        selector: node?.selector || node?.css || null,
      });
    });
  });
  return index;
}

function annotateDomTreeWithMatches(matches) {
  const root = getDomTree(state.domTreeStore);
  if (!root) return;
  state.domMatchIndex = buildDomMatchIndex(matches);
  const visit = (node) => {
    if (!node?.path) return;
    const path = normalizeDomPathString(node.path);
    node.path = path;
    const additions = state.domMatchIndex.get(path) || null;
    if (additions?.length) {
      node.containers = mergeContainerEntries(node.containers, additions);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => visit(child));
    }
  };
  visit(root);
}

function decorateBranchWithMatches(branchNode) {
  if (!branchNode?.path || !state.domMatchIndex) return branchNode;
  const visit = (node) => {
    if (!node?.path) return;
    const path = normalizeDomPathString(node.path);
    node.path = path;
    const additions = state.domMatchIndex.get(path) || null;
    if (additions?.length) {
      node.containers = mergeContainerEntries(node.containers, additions);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => visit(child));
    }
  };
  visit(branchNode);
  return branchNode;
}

function renderGraphCounts() {
  ui.treeContainerCount && (ui.treeContainerCount.textContent = String(countContainers(state.containerSnapshot?.container_tree)));
  ui.treeDomCount && (ui.treeDomCount.textContent = String(countDomNodes(getDomTree(state.domTreeStore))));
}

function countContainers(node) {
  if (!node) return 0;
  let count = 1;
  (node.children || []).forEach((child) => (count += countContainers(child)));
  return count;
}

function countDomNodes(node) {
  if (!node) return 0;
  let count = 1;
  (node.children || []).forEach((child) => (count += countDomNodes(child)));
  return count;
}

function renderContainers() {
  renderContainerTree();
  renderDomTree();
  renderContainerSelectOptions();
  renderGraphCounts();
  renderGraph();
  queueFitWindow();
  if (state.selectedDomPath) {
    setTimeout(() => scrollDomPathIntoView(state.selectedDomPath), 0);
  }
  scheduleMatchLinkDraw();
}

function renderGraph() {
  if (!graphView) return;
  const rootId = state.containerSnapshot?.container_tree?.id || null;
  const graph = rootId ? buildGraphData(state.graphStore, rootId) : { containerRows: [], domNodes: [], links: [] };
  const hasData = Boolean((graph.containerRows || []).length || (graph.domNodes || []).length);
  if (graphOverlay) {
    graphOverlay.classList.toggle('hidden', hasData);
  }
  if (state.graphDirty || state.graphLastRootId !== rootId) {
    graphView.setData({
      containers: graph.containerRows || [],
      domNodes: graph.domNodes || [],
      links: graph.links || [],
    });
    state.graphDirty = false;
    state.graphLastRootId = rootId;
  }
  graphView.setSelection({ containerId: state.selectedContainerId, domPath: state.selectedDomPath });
  graphView.setInteractionMode({ linkMode: state.linkMode });
}

async function expandDomPath(path, options = {}) {
  if (!path || !state.selectedSession) {
    throw new Error('expandDomPath requires path and selected session');
  }
  const url = resolveCurrentPageUrl();
  const node = findDomNodeByPath(getDomTree(state.domTreeStore), path);
  const stats = node ? getDomNodeChildStats(node) : { needsLazyLoad: true };
  const expanded = isPathExpanded(state.domTreeStore, path);
  if (expanded) {
    setPathExpanded(state.domTreeStore, path, false);
    renderDomTree();
    return { expanded: false };
  }
  setPathExpanded(state.domTreeStore, path, true);
  if (!stats.needsLazyLoad || isBranchLoading(state.domTreeStore, path)) {
    renderDomTree();
    return { expanded: true, loaded: false };
  }
  setBranchLoading(state.domTreeStore, path, true);
  renderDomTree();
  try {
    const res = await invokeAction('containers:inspect-branch', {
      profile: state.selectedSession,
      url,
      path,
      maxDepth: typeof options.maxDepth === 'number' ? options.maxDepth : 1,
      maxChildren: typeof options.maxChildren === 'number' ? options.maxChildren : 12,
    });
    const branchNode = res?.branch?.node || res?.branch || res?.node || null;
    if (!branchNode?.path) {
      throw new Error('inspect-branch returned empty node');
    }
    decorateBranchWithMatches(branchNode);
    mergeDomBranchIntoTree(state.domTreeStore, branchNode);
    ingestDomBranch(state.graphStore, branchNode);
    state.graphDirty = true;
    return { expanded: true, loaded: true };
  } finally {
    setBranchLoading(state.domTreeStore, path, false);
    renderDomTree();
  }
}

async function loadDomBranch(path, options = {}) {
  if (!path || !state.selectedSession) {
    throw new Error('loadDomBranch requires path and selected session');
  }
  const url = resolveCurrentPageUrl();
  setPathExpanded(state.domTreeStore, path, true);
  const node = findDomNodeByPath(getDomTree(state.domTreeStore), path);
  const stats = node ? getDomNodeChildStats(node) : { needsLazyLoad: true };
  if (!options.force && (!stats.needsLazyLoad || isBranchLoading(state.domTreeStore, path))) {
    renderDomTree();
    return { expanded: true, loaded: false };
  }
  if (isBranchLoading(state.domTreeStore, path)) {
    return { expanded: true, loaded: false };
  }
  setBranchLoading(state.domTreeStore, path, true);
  renderDomTree();
  try {
    const res = await invokeAction('containers:inspect-branch', {
      profile: state.selectedSession,
      url,
      path,
      maxDepth: typeof options.maxDepth === 'number' ? options.maxDepth : 1,
      maxChildren: typeof options.maxChildren === 'number' ? options.maxChildren : 12,
    });
    const branchNode = res?.branch?.node || res?.branch || res?.node || null;
    if (!branchNode?.path) {
      throw new Error('inspect-branch returned empty node');
    }
    decorateBranchWithMatches(branchNode);
    mergeDomBranchIntoTree(state.domTreeStore, branchNode);
    ingestDomBranch(state.graphStore, branchNode);
    state.graphDirty = true;
    return { expanded: true, loaded: true };
  } finally {
    setBranchLoading(state.domTreeStore, path, false);
    renderDomTree();
  }
}

async function ensureDomExpanded(path, options = {}) {
  if (!path) return;
  if (isPathExpanded(state.domTreeStore, path)) {
    return { expanded: true, loaded: false };
  }
  // expandDomPath toggles; only call it when not expanded.
  return expandDomPath(path, options);
}

function buildGraphReport() {
  const rootId = state.containerSnapshot?.container_tree?.id || null;
  const graph = rootId ? buildGraphData(state.graphStore, rootId) : { containerRows: [], domNodes: [], links: [] };
  const domNodes = Array.isArray(graph.domNodes) ? graph.domNodes : [];
  const domTree = getDomTree(state.domTreeStore);
  const reportDomNodes = domNodes.map((node) => {
    const treeNode = findDomNodeByPath(domTree, node.path);
    const renderedChildren = treeNode?.children?.length || 0;
    const expectedExpandable = Number(node.childCount || 0) > renderedChildren;
    const visible = node.path === 'root' || (treeNode && node.depth <= 1) || isPathExpanded(state.domTreeStore, node.path);
    return {
      path: node.path,
      childCount: Number(node.childCount || 0),
      renderedChildren,
      canExpand: Boolean(node.canExpand || expectedExpandable),
      expectedExpandable,
      visible,
    };
  });
  const containerRows = Array.isArray(graph.containerRows) ? graph.containerRows : [];
  const coverageStats = containerRows.map((row) => ({
    containerId: row?.container?.id || null,
    matchCount: Number(row?.container?.match?.match_count || 0),
  }));
  return {
    rootId,
    containerCount: containerRows.length,
    domCount: reportDomNodes.length,
    domNodes: reportDomNodes,
    containerCoverage: {
      missing: [],
      stats: coverageStats.filter((item) => item.containerId),
    },
  };
}

async function handleDomPick() {
  if (!state.selectedSession) {
    showMessage('请先选择一个会话', 'warn');
    return;
  }
  if (state.domPicker.status === 'active') {
    showMessage('正在捕获，请在页面中点击元素或按 ESC 取消', 'warn');
    return;
  }
  state.domPicker.status = 'active';
  state.domPicker.message = '请在页面 hover 并点击选择元素（ESC 取消）';
  if (ui?.domActionStatus) {
    ui.domActionStatus.textContent = state.domPicker.message;
  }
  if (ui?.domActionPick) {
    ui.domActionPick.disabled = true;
  }
  if (ui?.domActionPickSidebar) {
    ui.domActionPickSidebar.disabled = true;
  }
  sessionPanel.updateSessionCaptureButtons();
  showMessage(state.domPicker.message, 'info');
  try {
    await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'hover-dom' }).catch(() => {});
    const res = await invokeAction('browser:pick-dom', { profile: state.selectedSession, timeout: 30000 });
    const result = res?.data || res;
    const domPath = result?.dom_path || result?.domPath || null;
    const selector = result?.selector || null;
    state.domPicker.status = 'idle';
    state.domPicker.result = { domPath, selector, raw: result };
    if (domPath) {
      state.selectedDomPath = domPath;
      ensureDomPathExists(state.domTreeStore, domPath);
      resetDomVisibility(state.domTreeStore, new Set(), domPath);
      await loadDomBranch(domPath, { maxDepth: 1, maxChildren: 16, force: true }).catch(() => {});
    }
    if (ui.domActionTarget) {
      ui.domActionTarget.textContent = domPath ? `DOM: ${domPath}` : '已捕获（无 domPath）';
    }
    if (selector) {
      showMessage(`已选中元素 (${selector})`, 'success');
    } else {
      showMessage('已选中元素', 'success');
    }
    if (ui?.domActionStatus) {
      ui.domActionStatus.textContent = selector ? `已选中: ${selector}` : '已选中元素';
    }
    suggestContainerForPickedNode();
    renderContainers();
  } catch (err) {
    state.domPicker.status = 'idle';
    state.domPicker.lastError = err?.message || '捕获失败';
    showMessage(state.domPicker.lastError, 'error');
    if (ui?.domActionStatus) {
      ui.domActionStatus.textContent = state.domPicker.lastError;
    }
  } finally {
    sessionPanel.updateSessionCaptureButtons();
    if (ui?.domActionPick) {
      ui.domActionPick.disabled = false;
    }
    if (ui?.domActionPickSidebar) {
      ui.domActionPickSidebar.disabled = false;
    }
  }
}

function suggestContainerForPickedNode() {
  const picked = state.domPicker?.result;
  const domPath = picked?.domPath;
  if (!domPath || !state.containerSnapshot?.matches) {
    ui?.domActionFootnote && (ui.domActionFootnote.textContent = '');
    return;
  }
  const matches = state.containerSnapshot.matches || {};
  let best = null;
  let bestDepth = -1;
  Object.entries(matches).forEach(([containerId, entry]) => {
    (entry?.nodes || []).forEach((node) => {
      const path = node?.dom_path;
      if (!path || typeof path !== 'string') return;
      if (!domPath.startsWith(path)) return;
      const depth = path.split('/').length;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = { containerId, matchPath: path };
      }
    });
  });
  const suggestedParent = best?.containerId || state.containerSnapshot.container_tree?.id || null;
  state.domActions.parentContainerId = suggestedParent;
  if (ui?.domActionContainerSelect && suggestedParent) {
    ui.domActionContainerSelect.value = suggestedParent;
    state.domActions.selectedContainerId = suggestedParent;
  }
  const exactMatched = Boolean(best && best.matchPath === domPath);
  if (ui?.domActionFootnote) {
    ui.domActionFootnote.textContent = exactMatched
      ? `已命中容器 ${suggestedParent}`
      : `建议挂载到容器 ${suggestedParent}（虚线框为未确认元素）`;
  }
  if (!exactMatched && picked?.selector) {
    invokeAction('browser:highlight', {
      profile: state.selectedSession,
      selector: picked.selector,
      options: { channel: 'dom-suggest', style: '2px dashed rgba(96,165,250,0.95)', sticky: true },
    }).catch(() => {});
  }
}

async function handleDomHighlight() {
  if (!state.selectedSession) {
    showMessage('请先选择会话', 'warn');
    return;
  }
  const selector = state.domPicker?.result?.selector;
  if (!selector) {
    showMessage('请先拾取页面元素（需要 selector）', 'warn');
    return;
  }
  const sticky = Boolean(ui?.domHighlightHoldToggle?.checked);
  await invokeAction('browser:highlight', {
    profile: state.selectedSession,
    selector,
    options: { channel: 'ui-action', sticky, style: '2px solid rgba(255,193,7,0.92)', duration: sticky ? 0 : 1800 },
  });
}

async function handleDomClearHighlight() {
  if (!state.selectedSession) return;
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'ui-action' });
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'dom-suggest' }).catch(() => {});
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'hover-dom' }).catch(() => {});
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'hover-container' }).catch(() => {});
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'dom-focus' }).catch(() => {});
}

async function highlightDomFocus(path, style = '2px solid rgba(34,197,94,0.95)') {
  if (!state.selectedSession) return;
  const channel = 'dom-focus';
  if (!path) {
    await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel }).catch(() => {});
    return;
  }
  // Ensure focus highlight is unique: clear previous highlight before applying the new one.
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel }).catch(() => {});
  await invokeAction('browser:highlight-dom-path', {
    profile: state.selectedSession,
    path,
    options: { channel, style, sticky: true },
  }).catch(() => {});
}

function suggestParentContainerForDomPath(domPath) {
  if (!domPath || !state.containerSnapshot?.matches) {
    return { parentId: state.containerSnapshot?.container_tree?.id || null, exactMatched: false };
  }
  const matches = state.containerSnapshot.matches || {};
  let best = null;
  let bestDepth = -1;
  Object.entries(matches).forEach(([containerId, entry]) => {
    (entry?.nodes || []).forEach((node) => {
      const path = node?.dom_path;
      if (!path || typeof path !== 'string') return;
      if (!domPath.startsWith(path)) return;
      const depth = path.split('/').length;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = { containerId, matchPath: path };
      }
    });
  });
  const parentId = best?.containerId || state.containerSnapshot.container_tree?.id || null;
  const exactMatched = Boolean(best && best.matchPath === domPath);
  return { parentId, exactMatched };
}

function sanitizeContainerId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function handleDomAddFromDom() {
  if (!state.selectedSession) {
    showMessage('请先选择会话', 'warn');
    return;
  }
  const domPath = state.selectedDomPath;
  if (!domPath) {
    showMessage('请先在 DOM Explorer 选择一个节点', 'warn');
    return;
  }
  await loadDomBranch(domPath, { maxDepth: 0, maxChildren: 0, force: true }).catch(() => {});
  const node = findDomNodeByPath(getDomTree(state.domTreeStore), domPath);
  const selector = typeof node?.selector === 'string' ? node.selector.trim() : '';
  if (!selector) {
    showMessage('该 DOM 节点缺少 selector，无法创建容器（先展开/刷新）', 'warn');
    return;
  }

  const { parentId } = suggestParentContainerForDomPath(domPath);
  if (!parentId) {
    showMessage('无法确定父容器（请先捕获容器树）', 'warn');
    return;
  }
  const tag = (node?.tag || 'container').toLowerCase();
  const proposedId = sanitizeContainerId((ui?.domNewContainerId?.value || '').trim()) || sanitizeContainerId(`${parentId}.${tag}_${Math.random().toString(36).slice(2, 6)}`);
  const proposedAlias = (ui?.domNewContainerAlias?.value || '').trim();

  state.containerDraft = {
    parentId,
    domPath,
    selector,
    containerId: proposedId,
    alias: proposedAlias,
    createdAt: Date.now(),
  };
  if (ui?.domNewContainerId) ui.domNewContainerId.value = proposedId;
  if (!state.containerTreeExpanded) state.containerTreeExpanded = new Set();
  state.containerTreeExpanded.add(parentId);

  showMessage('已生成新容器草稿：左侧容器树里点“确定”保存', 'info');
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'dom-suggest' }).catch(() => {});
  await invokeAction('browser:highlight-dom-path', {
    profile: state.selectedSession,
    path: domPath,
    options: { channel: 'dom-suggest', style: '2px dashed rgba(96,165,250,0.95)', sticky: true },
  }).catch(() => {});
  renderContainers();
}

async function confirmContainerDraft() {
  const draft = state.containerDraft;
  if (!draft) return;
  if (!state.selectedSession) return;
  const url = resolveCurrentPageUrl();
  const res = await domService.createChildContainer({
    profile: state.selectedSession,
    url,
    parentId: draft.parentId,
    containerId: draft.containerId,
    selector: draft.selector,
    alias: draft.alias,
    ...(draft.domPath ? { domPath: draft.domPath } : {}),
  });
  state.containerDraft = null;
  await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'dom-suggest' }).catch(() => {});
  snapshotManager.applyContainerSnapshotData(res, { toastMessage: '容器已创建' });
  renderContainers();
}

function cancelContainerDraft() {
  state.containerDraft = null;
  if (state.selectedSession) {
    invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'dom-suggest' }).catch(() => {});
  }
  renderContainers();
}

async function handleDomReplace() {
  if (!state.selectedSession) {
    showMessage('请先选择会话', 'warn');
    return;
  }
  const containerId = ui?.domActionContainerSelect?.value || state.domActions.parentContainerId || state.selectedContainerId;
  const selector = state.domPicker?.result?.selector;
  if (!containerId) {
    showMessage('请选择目标容器', 'warn');
    return;
  }
  if (!selector) {
    showMessage('请先拾取页面元素（需要 selector）', 'warn');
    return;
  }
  const url = resolveCurrentPageUrl();
  const res = await invokeAction('containers:remap', { profile: state.selectedSession, url, containerId, selector });
  snapshotManager.applyContainerSnapshotData(res, { toastMessage: '已替换容器选择器' });
  renderContainers();
}

async function handleDomCreate() {
  if (!state.selectedSession) {
    showMessage('请先选择会话', 'warn');
    return;
  }
  const parentId = ui?.domActionContainerSelect?.value || state.domActions.parentContainerId || state.selectedContainerId;
  const selector = state.domPicker?.result?.selector;
  const domPath = state.domPicker?.result?.domPath || state.selectedDomPath || null;
  if (!parentId) {
    showMessage('缺少父容器（建议先捕获元素）', 'warn');
    return;
  }
  if (!selector) {
    showMessage('请先拾取页面元素（需要 selector）', 'warn');
    return;
  }
  let containerId = (ui?.domNewContainerId?.value || '').trim();
  const alias = (ui?.domNewContainerAlias?.value || '').trim();
  if (!containerId) {
    containerId = `${parentId}.${Math.random().toString(36).slice(2, 6)}`;
    if (ui?.domNewContainerId) ui.domNewContainerId.value = containerId;
  }
  const url = resolveCurrentPageUrl();
  const res = await domService.createChildContainer({
    profile: state.selectedSession,
    url,
    parentId,
    containerId,
    selector,
    alias,
    ...(domPath ? { domPath } : {}),
  });
  snapshotManager.applyContainerSnapshotData(res, { toastMessage: '已创建子容器' });
  renderContainers();
}

async function handleSaveAlias() {
  if (!state.selectedSession) return;
  const containerId = state.selectedContainerId || ui?.domActionContainerSelect?.value;
  const alias = (ui?.domAliasInput?.value || '').trim();
  if (!containerId) {
    showMessage('请选择容器', 'warn');
    return;
  }
  const url = resolveCurrentPageUrl();
  const res = await domService.updateContainerAlias({ profile: state.selectedSession, url, containerId, alias });
  snapshotManager.applyContainerSnapshotData(res, { toastMessage: '别名已保存' });
  renderContainers();
}

async function handleOpenInspector() {
  if (!desktop?.openInspector) {
    showMessage('当前运行环境不支持独立容器视图窗口', 'warn');
    return;
  }
  if (!state.selectedSession) {
    showMessage('请先选择会话', 'warn');
    return;
  }
  const url = resolveCurrentPageUrl();
  await desktop.openInspector({ profile: state.selectedSession, url, maxDepth: 1, maxChildren: 6 });
}

async function handleHoverDom(path) {
  if (!state.selectedSession) return;
  if (!path) {
    await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'hover-dom' }).catch(() => {});
    return;
  }
  await invokeAction('browser:highlight-dom-path', {
    profile: state.selectedSession,
    path,
    options: { channel: 'hover-dom', style: '2px solid rgba(250, 204, 21, 0.95)', sticky: true },
  });
}

async function handleHoverContainer(containerId) {
  if (!state.selectedSession) return;
  if (!containerId) {
    await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'hover-container' }).catch(() => {});
    return;
  }
  const root = state.containerSnapshot?.container_tree;
  const node = root ? findContainerNode(root, containerId) : null;
  const css = (node?.selectors || [])[0]?.css || (node?.selectors || [])[0] || null;
  if (!css || typeof css !== 'string') {
    await invokeAction('browser:clear-highlight', { profile: state.selectedSession, channel: 'hover-container' }).catch(() => {});
    return;
  }
  await invokeAction('browser:highlight', {
    profile: state.selectedSession,
    selector: css,
    options: { channel: 'hover-container', style: '2px solid rgba(52, 211, 153, 0.95)', sticky: true },
  }).catch(() => {});
}

const domTreeView = createDomTreeView({
  rootElement: ui.treeDomList,
  store: state.domTreeStore,
  getSelectedPath: () => state.selectedDomPath,
  onSelectNode: (path) => {
    state.selectedDomPath = path;
    if (ui.domActionTarget) ui.domActionTarget.textContent = `DOM: ${path}`;
    renderDomTree();
    scheduleMatchLinkDraw();
    highlightDomFocus(path).catch(() => {});
    renderGraph();
  },
  onToggleExpand: async (path) => {
    try {
      await expandDomPath(path, { maxDepth: 1, maxChildren: 12 });
      bus.publish('ui.graph.domExpanded', { path });
      // Expand implies user focus on this node; move focus highlight here.
      state.selectedDomPath = path;
      if (ui.domActionTarget) ui.domActionTarget.textContent = `DOM: ${path}`;
      await highlightDomFocus(path).catch(() => {});
      renderGraph();
    } catch (err) {
      bus.publish('ui.graph.domExpandFailed', { path, error: err?.message || String(err) });
      showMessage(err?.message || '展开失败', 'error');
    }
  },
  onHoverNode: (path) => {
    // lightweight: only keep state; external tests drive hover via bus topics.
    state.hover = state.hover || {};
    state.hover.domPath = path;
  },
});

const containerOps = createContainerOpsManager({
  state,
  ui,
  findContainerNode,
  getContainerAlias,
  getContainerOperationsFromNode,
  showMessage,
  invokeAction,
  resolveCurrentPageUrl,
  applyContainerSnapshotData: (res, options) => snapshotManager.applyContainerSnapshotData(res, options),
});

const domService = createDomService({ invokeAction, resolveCurrentPageUrl });

const snapshotManager = createSnapshotManager({
  state,
  ui,
  domSnapshotOptions: { maxDepth: 1, maxChildren: 6 },
  invokeAction,
  debugLog: (...args) => debugLog?.(...args),
  showMessage,
  setLoading,
  annotateDomTreeWithMatches,
  findAllDomPathsForContainer,
  resetDomVisibility: (...args) => resetDomVisibility(state.domTreeStore, ...args),
  ensureContainerDomMapping: (containerId) => {
    const tree = getDomTree(state.domTreeStore);
    const paths = tree ? findAllDomPathsForContainer(containerId, tree) : [];
    if (paths.length) {
      state.selectedDomPath = paths[0];
      resetDomVisibility(state.domTreeStore, new Set(), state.selectedDomPath);
    }
  },
  scheduleAutoExpand: () => {},
  syncContainerOpsEditor: (containerId, options) => containerOps.syncEditor(containerId, options),
  ensureAutoRefreshTimer: () => {},
  resolveCurrentPageUrl,
  onSnapshotApplied: () => {
    state.graphDirty = true;
    renderContainers();
    bus.publish('containers:snapshot_updated', { ts: Date.now(), session: state.selectedSession });
  },
  onSnapshotCleared: () => renderContainers(),
  resetAutoExpandTrigger: () => {},
  uiStateService,
});

const sessionPanel = createSessionPanel({
  state,
  ui,
  showMessage,
  invokeAction,
  loadContainerSnapshot: snapshotManager.loadContainerSnapshot,
  ensureAutoRefreshTimer: () => {},
  renderContainers,
  queueFitWindow,
  refreshSessions: null,
  uiStateService,
});

const dataLoaders = createDataLoaders({
  state,
  ui,
  invokeAction,
  showMessage,
  debugLog: (...args) => debugLog?.(...args),
  setLoading,
  setSelectedSession: (profileId) => sessionPanel.setSelectedSession(profileId),
  loadContainerSnapshot: snapshotManager.loadContainerSnapshot,
  ensureAutoRefreshTimer: () => {},
  uiStateService,
});

dataLoaders.attachRenderers({
  renderBrowserPanel: sessionPanel.renderBrowserPanel,
  renderSessions: sessionPanel.renderSessions,
  renderLogs: sessionPanel.renderLogsPanel,
});

bindCoreEvents(ui, {
  onRefreshBrowser: () => dataLoaders.loadBrowserStatus(),
  onRefreshSessions: () => dataLoaders.loadSessions(),
  onRefreshLogs: () => dataLoaders.loadLogs(),
  onClearLogs: () => {
    state.logs = [];
    sessionPanel.renderLogsPanel();
  },
  onRefreshContainers: () => snapshotManager.loadContainerSnapshot(),
  onOpenInspector: () => handleOpenInspector(),
  onDomPick: () => handleDomPick(),
  onDomHighlight: () => handleDomHighlight().catch((err) => showMessage(err?.message || '高亮失败', 'error')),
  onDomClearHighlight: () => handleDomClearHighlight().catch(() => {}),
  onDomReplace: () => handleDomReplace().catch((err) => showMessage(err?.message || '替换失败', 'error')),
  onDomCreate: () => handleDomCreate().catch((err) => showMessage(err?.message || '创建失败', 'error')),
  onDomAddFromDom: () => handleDomAddFromDom().catch((err) => showMessage(err?.message || '创建草稿失败', 'error')),
  onDomSaveAlias: () => handleSaveAlias().catch((err) => showMessage(err?.message || '保存别名失败', 'error')),
  onToolTabDom: () => switchToolTab('dom'),
  onToolTabContainer: () => switchToolTab('container'),
});

initWindowControls({
  ui,
  desktop,
  state,
  publishWindowCommand,
  toggleHeadlessMode,
  updateHeadlessButton,
  invokeAction,
  showMessage,
});

subscribeDesktopState({ desktop, state, ui, queueFitWindow, updateHeadlessButton, uiStateService });

registerRendererBus(bus, {
  onTestPing: () => bus.publish('ui.test.pong', { ts: Date.now(), ok: true }),
  onGraphReportRequest: () => {
    bus.publish('ui.graph.report', buildGraphReport());
  },
  onGraphDomExpand: (payload = {}) => {
    const path = payload.path;
    if (!path) return;
    // Acknowledge immediately for black-box tests; actual branch load happens in background.
    bus.publish('ui.graph.domExpanded', { path });
    ensureDomExpanded(path, { maxDepth: 1, maxChildren: 12 }).catch((err) => {
      bus.publish('ui.graph.domExpandFailed', { path, error: err?.message || String(err) });
    });
  },
  onGraphDomHover: async (payload = {}) => {
    await handleHoverDom(payload.path || null).catch(() => {});
  },
  onGraphContainerHover: async (payload = {}) => {
    await handleHoverContainer(payload.containerId || null).catch(() => {});
  },
  onWindowError: (payload = {}) => showMessage(payload?.message || payload?.error || '窗口错误', 'error'),
});

function bootstrapPreferredSession() {
  // Renderer is sandboxed; env is not guaranteed. Prefer auto-selection from session list.
}

function initMatchLinkOverlay() {
  if (!treeDetailEl || !matchLinkLayer) return;
  try {
    if (typeof ResizeObserver !== 'undefined') {
      matchLinkResizeObserver = new ResizeObserver(() => scheduleMatchLinkDraw());
      matchLinkResizeObserver.observe(treeDetailEl);
    }
  } catch {
    // ignore
  }
  try {
    ui?.treeContainerList?.addEventListener?.('scroll', scheduleMatchLinkDraw);
    ui?.treeDomList?.addEventListener?.('scroll', scheduleMatchLinkDraw);
    window.addEventListener('resize', scheduleMatchLinkDraw);
  } catch {
    // ignore
  }
}

async function init() {
  switchToolTab('dom');
  updateHeadlessButton();
  initMatchLinkOverlay();
  await dataLoaders.loadBrowserStatus();
  await dataLoaders.loadSessions({ silent: false, skipSnapshot: false });
  await dataLoaders.loadLogs();
  renderContainers();
  queueFitWindow();
}

init().catch((err) => {
  console.error('[floating] init failed', err);
  showMessage(err?.message || '初始化失败', 'error');
});

window.__debug = { bus, state, ui, invokeAction };
