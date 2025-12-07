import { ContainerDomGraphView } from './graph/graph-view.js';
import {
  createGraphStore,
  resetGraphStore,
  ingestContainerTree,
  ingestDomTree,
  ingestDomBranch,
  buildGraphData,
  getDomChildren,
  getDomNode,
  markExpanded,
  markLoading,
} from './graph/store.js';
import {
  createDomTreeStore,
  setDomTreeSnapshot,
  getDomTree,
  resetDomVisibility,
  findDomNodeByPath,
  findAllDomPathsForContainer,
  mergeDomBranchIntoTree,
  normalizeDomPathString,
  isDefaultVisible,
  isPathExpanded,
  setPathExpanded,
  isBranchLoading,
  setBranchLoading,
  getDomNodeChildStats,
  ensureDomPathExists,
} from './dom-tree/store.js';
import { createDomTreeView } from './dom-tree/view.js';
import { bus } from './ui/messageBus.js';
import './ui/devTools.js';

const DOM_SNAPSHOT_OPTIONS = {
  maxDepth: 8,
  maxChildren: 80,
};

console.log('[floating] renderer booting');
const config = window.floatingConfig || {};
const DEBUG = Boolean(config.debug);
const AUTO_EXPAND_PATHS = Array.isArray(config.autoExpandPaths) ? config.autoExpandPaths : [];
const logger = window.floatingLogger || {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
const ui = {
  metaText: document.getElementById('connectionStatus'),
  globalMessage: document.getElementById('globalMessage'),
  browserPanel: document.getElementById('browserPanel'),
  browserStatusText: document.getElementById('browserStatusText'),
  browserDetails: document.getElementById('browserDetails'),
  refreshBrowser: document.getElementById('refreshBrowser'),
  sessionForm: document.getElementById('sessionCreateForm'),
  profileInput: document.getElementById('profileInput'),
  launchUrlInput: document.getElementById('launchUrlInput'),
  headlessToggle: document.getElementById('headlessToggle'),
  sessionPanel: document.getElementById('sessionPanel'),
  sessionList: document.getElementById('sessionList'),
  refreshSessions: document.getElementById('refreshSessions'),
  containersPanel: document.getElementById('containersPanel'),
  refreshContainers: document.getElementById('refreshContainers'),
  openInspectorButton: document.getElementById('openInspector'),
  containerDomGrid: document.getElementById('containerDomGrid'),
  linkModeButton: document.getElementById('linkModeButton'),
  linkModeIndicator: document.getElementById('linkModeIndicator'),
  treeContainerList: document.getElementById('containerTreeView'),
  treeDomList: document.getElementById('domTreeView'),
  treeContainerCount: document.getElementById('treeContainerCount'),
  treeDomCount: document.getElementById('treeDomCount'),
  operationChips: document.getElementById('operationChips'),
  logPanel: document.getElementById('logPanel'),
  logSourceSelect: document.getElementById('logSourceSelect'),
  refreshLogs: document.getElementById('refreshLogs'),
  clearLogs: document.getElementById('clearLogs'),
  logStream: document.getElementById('logStream'),
  collapseButton: document.getElementById('collapseButton'),
  minButton: document.getElementById('minButton'),
  closeButton: document.getElementById('closeButton'),
  headlessButton: document.getElementById('headlessButton'),
  stickBrowserButton: document.getElementById('stickBrowserButton'),
  collapsedStrip: document.getElementById('collapsedStrip'),
  expandCollapsedButton: document.getElementById('expandCollapsedButton'),
};

const state = {
  browserStatus: null,
  sessions: [],
  logs: [],
  operations: [],
  selectedSession: null,
  containerSnapshot: null,
  selectedContainerId: null,
  selectedDomPath: null,
  domNeedsReset: false,
  domTreeStore: createDomTreeStore(),
  graphStore: createGraphStore(),
  linkMode: {
    active: false,
    containerId: null,
    busy: false,
  },
  headless: Boolean(config.headless),
  messageTimer: null,
  loading: {
    browser: false,
    sessions: false,
    logs: false,
    containers: false,
  },
  isCollapsed: false,
  pendingContainerDom: new Set(),
};

const layoutState = {
  fitTimer: null,
  resizeObserver: null,
};

let graphView = null;
let domTreeView = null;
let autoExpandTriggered = false;

const backend = window.backendAPI;
const desktop = window.desktopAPI;
const publishWindowCommand = (topic, payload, fallback) => {
  const ok = bus.publish(topic, payload);
  if (!ok && typeof fallback === 'function') {
    try {
      fallback();
    } catch (err) {
      console.warn('[floating] window command fallback failed', err);
    }
  }
  return ok;
};
const debugLog = (...args) => {
  if (DEBUG) {
    logger.log('[floating-debug]', ...args);
  }
};
if (DEBUG) {
  debugLog('init config', config);
  debugLog('backendAPI available:', Boolean(backend), 'desktopAPI available:', Boolean(desktop));
}

async function init() {
  bindWindowControls();
  bindEvents();
  subscribeBusEvents();
  updateLinkModeUI();
  subscribeDesktopEvents();
  bus.publish('ui.window.requestState');
  setupAutoFit();
  setupGraphView();
  setupDomTreeView();
  await loadOperations();
  await refreshAll();
}

function bindWindowControls() {
  debugLog('binding window controls');
  ui.closeButton?.addEventListener('click', () => desktop?.close?.());
  ui.minButton?.addEventListener('click', () => desktop?.minimize?.());
  ui.collapseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    if (state.isCollapsed) {
      publishWindowCommand('ui.window.restoreFromBall', null, () => desktop?.toggleCollapse?.(false));
    } else {
      publishWindowCommand('ui.window.shrinkToBall', null, () => desktop?.toggleCollapse?.(true));
    }
  });
  ui.collapsedStrip?.addEventListener('click', (event) => {
    event.preventDefault();
    publishWindowCommand('ui.window.restoreFromBall', null, () => desktop?.toggleCollapse?.(false));
  });
  ui.expandCollapsedButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    publishWindowCommand('ui.window.restoreFromBall', null, () => desktop?.toggleCollapse?.(false));
  });
  ui.headlessButton?.addEventListener('click', () => toggleHeadlessMode());
  ui.stickBrowserButton?.addEventListener('click', () => {
    const fallback = () =>
      invokeAction('window:stick-browser').catch((err) => {
        showMessage(err.message || '浏览器贴边失败', 'error');
      });
    publishWindowCommand('ui.window.stickToBrowser', { browserWidthRatio: 0.68 }, fallback);
  });
  updateHeadlessButton();
}

function subscribeDesktopEvents() {
  desktop?.onCollapseState?.((payload = {}) => {
    const collapsed = Boolean(payload?.isCollapsed);
    state.isCollapsed = collapsed;
    document.body.classList.toggle('is-collapsed', collapsed);
    ui.collapsedStrip?.classList.toggle('hidden', !collapsed);
    if (ui.collapseButton) {
      ui.collapseButton.textContent = collapsed ? '▢' : '◻︎';
      ui.collapseButton.title = collapsed ? '展开浮窗' : '贴边收起';
    }
    if (!collapsed) {
      queueFitWindow();
    }
  });
  desktop?.onHeadlessState?.((payload = {}) => {
    state.headless = Boolean(payload?.headless);
    updateHeadlessButton();
  });
}

function bindEvents() {
  ui.refreshBrowser?.addEventListener('click', () => loadBrowserStatus());
  ui.refreshSessions?.addEventListener('click', () => loadSessions());
  ui.refreshLogs?.addEventListener('click', () => loadLogs());
  ui.linkModeButton?.addEventListener('click', () => toggleLinkMode());
  ui.clearLogs?.addEventListener('click', () => {
    state.logs = [];
    renderLogs();
  });
  ui.refreshContainers?.addEventListener('click', () => loadContainerSnapshot());
  ui.sessionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleCreateSession();
  });
  ui.openInspectorButton?.addEventListener('click', () => openInspectorView());
}

function subscribeBusEvents() {
  bus.subscribe('ui.window.error', (payload = {}) => {
    const message = payload?.message || payload?.error || '窗口操作失败';
    showMessage(message, 'error');
  });
  bus.subscribe('ui.graph.expandDom', (payload = {}) => {
    const targetPath = payload?.path || payload?.domPath;
    if (targetPath) {
      toggleDomNodeExpand(targetPath);
    }
  });
  bus.subscribe('ui.test.ping', () => {
    bus.publish('ui.test.pong', { ts: Date.now(), ok: true });
  });
  bus.subscribe('ui.graph.requestReport', () => publishGraphReport('request'));
}

function setupAutoFit() {
  const target = document.querySelector('.window-shell');
  if (!target || !desktop?.fitContentHeight) return;
  if (typeof ResizeObserver !== 'undefined') {
    layoutState.resizeObserver = new ResizeObserver(() => queueFitWindow());
    layoutState.resizeObserver.observe(target);
  }
  window.addEventListener('load', () => queueFitWindow(), { once: true });
  setTimeout(() => queueFitWindow(), 80);
}

function setupGraphView() {
  if (graphView || !ui.containerDomGrid) return;
  graphView = new ContainerDomGraphView(ui.containerDomGrid);
  graphView.setCallbacks({
    onSelectContainer: (containerId) => handleContainerSelection(containerId),
    onSelectDom: (domPath) => handleDomSelection(domPath),
    onLinkNodes: (containerId, domPath) => handleGraphLink(containerId, domPath),
    onExpandDom: (domPath) => toggleDomNodeExpand(domPath),
  });
  syncGraphInteractionMode();
}

function setupDomTreeView() {
  if (domTreeView || !ui.treeDomList) return;
  domTreeView = createDomTreeView({
    rootElement: ui.treeDomList,
    store: state.domTreeStore,
    getSelectedPath: () => state.selectedDomPath,
    onSelectNode: (path) => handleDomSelection(path),
    onToggleExpand: (path) => toggleDomNodeExpand(path),
  });
}

function toggleLinkMode(forceState) {
  const desired = typeof forceState === 'boolean' ? forceState : !state.linkMode.active;
  if (!desired && state.linkMode.busy) {
    return;
  }
  state.linkMode.active = desired;
  if (!desired) {
    state.linkMode.containerId = null;
  } else if (!state.linkMode.containerId && state.selectedContainerId) {
    state.linkMode.containerId = state.selectedContainerId;
  }
  updateLinkModeUI();
}

function updateLinkModeUI() {
  if (ui.linkModeButton) {
    ui.linkModeButton.textContent = state.linkMode.active ? '退出重连' : '重连容器';
    ui.linkModeButton.classList.toggle('is-active', state.linkMode.active);
    ui.linkModeButton.disabled = state.linkMode.busy;
  }
  if (ui.linkModeIndicator) {
    let text = '';
    if (state.linkMode.busy) {
      text = '正在更新容器选择器，请稍候...';
    } else if (state.linkMode.active && state.linkMode.containerId) {
      text = `目标容器：${state.linkMode.containerId}，请选择新的 DOM 节点完成连线`;
    } else if (state.linkMode.active) {
      text = '重连模式已开启：先点击容器，再点击 DOM 节点完成连线';
    }
    ui.linkModeIndicator.textContent = text;
    ui.linkModeIndicator.classList.toggle('hidden', !text);
  }
  syncGraphInteractionMode();
}

function toggleHeadlessMode(forceState) {
  const desired = typeof forceState === 'boolean' ? forceState : !state.headless;
  state.headless = desired;
  updateHeadlessButton();
  publishWindowCommand('ui.window.toggleHeadless', { headless: desired }, () => desktop?.setHeadlessMode?.(desired));
}

function updateHeadlessButton() {
  if (!ui.headlessButton) return;
  const hidden = state.headless;
  ui.headlessButton.textContent = hidden ? '🙈' : '👁';
  ui.headlessButton.title = hidden ? '显示浮窗' : '隐藏浮窗';
}

function syncGraphInteractionMode() {
  if (!graphView) return;
  graphView.setInteractionMode({
    linkMode: {
      active: state.linkMode.active,
      containerId: state.linkMode.containerId,
    },
  });
}

function queueFitWindow() {
  if (!desktop?.fitContentHeight || state.isCollapsed) return;
  clearTimeout(layoutState.fitTimer);
  layoutState.fitTimer = setTimeout(() => {
    const target = document.querySelector('.window-shell');
    if (!target) return;
    const height = target.scrollHeight;
    if (height > 0) {
      desktop.fitContentHeight(height);
    }
  }, 80);
}

async function refreshAll() {
  await Promise.all([loadBrowserStatus(), loadSessions(), loadLogs()]);
  renderContainers();
  queueFitWindow();
}

async function loadBrowserStatus() {
  setLoading('browser', true);
  try {
    const res = await invokeAction('browser:status');
    debugLog('loadBrowserStatus result', res);
    state.browserStatus = res;
  } catch (err) {
    state.browserStatus = { healthy: false, error: err.message || String(err) };
    showMessage(err.message || '获取浏览器状态失败', 'error');
  } finally {
    setLoading('browser', false);
    renderBrowserPanel();
  }
}

async function loadSessions() {
  setLoading('sessions', true);
  try {
    const res = await invokeAction('session:list');
    const data = res?.sessions || res?.data?.sessions || res?.data || [];
    debugLog('loadSessions result', data);
    state.sessions = Array.isArray(data) ? data : [];
    const hasSelected =
      state.selectedSession && state.sessions.some((s) => s.profileId === state.selectedSession);
    if (!hasSelected) {
      if (state.sessions.length === 1) {
        state.selectedSession = state.sessions[0].profileId;
      } else {
        state.selectedSession = null;
      }
    }
  } catch (err) {
    state.sessions = [];
    showMessage(err.message || '会话列表获取失败', 'error');
  } finally {
    setLoading('sessions', false);
    renderSessions();
    renderBrowserPanel();
    if (state.selectedSession) {
      loadContainerSnapshot(true);
    }
  }
}

async function loadLogs() {
  setLoading('logs', true);
  try {
    const res = await invokeAction('logs:stream', {
      source: ui.logSourceSelect?.value || 'browser',
      lines: 120,
    });
    const data = res?.lines || res?.data?.lines || [];
    state.logs = Array.isArray(data) ? data : [];
  } catch (err) {
    state.logs = [];
    showMessage(err.message || '日志读取失败', 'error');
  } finally {
    setLoading('logs', false);
    renderLogs();
  }
}

async function handleCreateSession() {
  const profile = (ui.profileInput?.value || '').trim() || `profile-${Date.now().toString(36)}`;
  const url = (ui.launchUrlInput?.value || '').trim();
  const headless = Boolean(ui.headlessToggle?.checked);
  try {
    await invokeAction('session:create', { profile, url, headless });
    showMessage(`已创建/唤醒 ${profile}`, 'success');
    ui.sessionForm?.reset();
    await loadSessions();
  } catch (err) {
    showMessage(err.message || '创建会话失败', 'error');
  }
}

async function handleDeleteSession(profileId) {
  if (!profileId) return;
  try {
    await invokeAction('session:delete', { profile: profileId });
    showMessage(`会话 ${profileId} 已停止`, 'success');
    await loadSessions();
  } catch (err) {
    showMessage(err.message || '删除失败', 'error');
  }
}

async function openInspectorView() {
  if (!desktop?.openInspector) {
    showMessage('当前环境暂不支持容器视图', 'warn');
    return;
  }
  if (!state.selectedSession) {
    showMessage('请选择会话后再打开容器视图', 'warn');
    return;
  }
  const selected = state.sessions.find((s) => s.profileId === state.selectedSession);
  const url = selected?.current_url || selected?.currentUrl;
  try {
    await desktop.openInspector({ profile: state.selectedSession, url });
  } catch (err) {
    showMessage(err?.message || '容器视图打开失败', 'error');
  }
}

async function loadOperations() {
  try {
    const res = await invokeAction('operations:list');
    state.operations = Array.isArray(res) ? res : res?.data || [];
  } catch {
    state.operations = [];
  }
  renderOperations();
}

function renderBrowserPanel() {
  if (!ui.browserStatusText || !ui.browserDetails) return;
  const status = state.browserStatus;
  const sessionCount = state.sessions.length;
  const healthy = typeof status?.healthy === 'boolean' ? status.healthy : sessionCount > 0;
  const label = healthy ? '服务就绪' : '服务未就绪';
  if (ui.metaText) {
    ui.metaText.textContent = healthy ? '就绪' : '未就绪';
    ui.metaText.dataset.state = healthy ? 'ok' : 'warn';
  }
  ui.browserStatusText.textContent = label;
  ui.browserStatusText.dataset.state = healthy ? 'ok' : 'warn';
  if (healthy) {
    ui.browserDetails.textContent = `活动会话 ${sessionCount} 个`;
  } else if (sessionCount > 0) {
    ui.browserDetails.textContent = `检测到 ${sessionCount} 个会话，等待服务心跳`;
  } else {
    ui.browserDetails.textContent =
      status?.error || '请先启动浏览器服务（端口 7704/8765）';
  }
  queueFitWindow();
}

function renderSessions() {
  if (!ui.sessionList) return;
  ui.sessionList.innerHTML = '';
  if (!state.sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'placeholder';
    empty.innerHTML = '<strong>暂无会话</strong><p>使用上方表单创建新的浏览器会话。</p>';
    ui.sessionList.appendChild(empty);
    return;
  }

  state.sessions.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'session-card';
    if (state.selectedSession === session.profileId) {
      card.classList.add('active');
    }
    const title = document.createElement('div');
    title.textContent = session.profileId || session.session_id;
    title.style.fontWeight = '600';

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.innerHTML = `<span>${session.mode || session.modeName || '未知模式'}</span><span>${
      session.current_url || session.currentUrl || '未导航'
    }</span>`;

    const actions = document.createElement('div');
    actions.className = 'session-actions';
    const selectBtn = document.createElement('button');
    selectBtn.className = 'ghost';
    selectBtn.textContent = state.selectedSession === session.profileId ? '已选' : '选择';
    selectBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      state.selectedSession = session.profileId;
      renderSessions();
      loadContainerSnapshot();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '停止';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDeleteSession(session.profileId);
    });

    actions.appendChild(selectBtn);
    actions.appendChild(deleteBtn);

    card.addEventListener('click', () => {
      state.selectedSession = session.profileId;
      renderSessions();
      loadContainerSnapshot();
    });

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);
    ui.sessionList.appendChild(card);
  });
  queueFitWindow();
}

async function loadContainerSnapshot(skipLoading = false) {
  if (!state.selectedSession) {
    debugLog('loadContainerSnapshot: no session selected');
    state.containerSnapshot = null;
    setDomTreeSnapshot(state.domTreeStore, null);
    state.selectedDomPath = null;
    renderContainers();
    return;
  }
  if (!skipLoading) setLoading('containers', true);
  try {
    const selected = state.sessions.find((s) => s.profileId === state.selectedSession);
    const url = selected?.current_url || selected?.currentUrl;
    if (!url) throw new Error('会话没有 URL');
    const res = await invokeAction('containers:inspect', {
      profile: state.selectedSession,
      url,
      ...DOM_SNAPSHOT_OPTIONS,
    });
    debugLog('loadContainerSnapshot result', res);
    applyContainerSnapshotData(res, { toastMessage: `容器树已捕获 (${state.selectedSession})` });
  } catch (err) {
    state.containerSnapshot = null;
    setDomTreeSnapshot(state.domTreeStore, null);
    state.selectedDomPath = null;
    state.domNeedsReset = false;
    showMessage(err.message || '容器树捕获失败', 'error');
  } finally {
    setLoading('containers', false);
    renderContainers();
  }
}

function applyContainerSnapshotData(result, options = {}) {
  const snapshot = result?.snapshot || result?.containerSnapshot || result;
  if (!snapshot || !snapshot.container_tree) {
    throw new Error('容器树为空');
  }
  state.containerSnapshot = snapshot;
  setDomTreeSnapshot(state.domTreeStore, snapshot?.dom_tree || result?.domTree || null);
  const domTree = getDomTree(state.domTreeStore);
  resetGraphStore(state.graphStore);
  if (snapshot?.container_tree) {
    ingestContainerTree(state.graphStore, snapshot.container_tree);
  }
  if (snapshot?.dom_tree) {
    ingestDomTree(state.graphStore, snapshot.dom_tree);
  }
  if (snapshot?.container_tree?.id) {
    state.selectedContainerId = snapshot.container_tree.id;
  }
  if (domTree?.path) {
    state.selectedDomPath = domTree.path;
  }
  const initialPaths = findAllDomPathsForContainer(state.selectedContainerId, domTree);
  if (!state.selectedDomPath && initialPaths.length) {
    state.selectedDomPath = initialPaths[0];
  }
  state.domNeedsReset = true;
  if (options.toastMessage) {
    showMessage(options.toastMessage, 'success');
  }
  if (state.selectedContainerId) {
    ensureContainerDomMapping(state.selectedContainerId);
  }
  if (AUTO_EXPAND_PATHS.length) {
    autoExpandTriggered = false;
  }
  scheduleAutoExpand();
}

function renderContainers() {
  setupGraphView();
  if (ui.openInspectorButton) {
    ui.openInspectorButton.disabled = !state.selectedSession || !desktop?.openInspector;
  }
  const rootId = getRootContainerId();
  const hasTree = Boolean(state.containerSnapshot?.container_tree);
  let containerRows = [];
  let domNodes = [];
  let links = [];
  const domTree = getDomTree(state.domTreeStore);
  if (hasTree && rootId) {
    const graphData = buildGraphData(state.graphStore, rootId);
    containerRows = graphData.containerRows || [];
    domNodes = graphData.domNodes || [];
    links = graphData.links || [];
  }
  if (rootId) {
    const belongsToRoot = (id) => !id || id === rootId || id.startsWith(`${rootId}.`);
    containerRows = containerRows.filter((row) => belongsToRoot(getContainerId(row.container)));
    domNodes = domNodes.filter((node) => !node.containerId || belongsToRoot(node.containerId));
    links = links.filter((link) => belongsToRoot(link.from));
  }
  domNodes = domNodes.filter((node) => shouldDisplayDomNode(node));
  const containerIdSet = new Set(containerRows.map((row) => getContainerId(row.container)).filter(Boolean));
  if (state.selectedContainerId && !containerIdSet.has(state.selectedContainerId)) {
    state.selectedContainerId = containerRows[0]?.container?.id || rootId || null;
  }
  const domPathSet = new Set(domNodes.map((node) => node.path).filter(Boolean));
  if (state.selectedDomPath && !domPathSet.has(state.selectedDomPath)) {
    state.selectedDomPath = domNodes[0]?.path || null;
  }
  if (state.domNeedsReset) {
    const containerIdsForVisibility = new Set(
      containerRows.map((row) => getContainerId(row.container)).filter((id) => typeof id === 'string' && id.length),
    );
    resetDomVisibility(state.domTreeStore, containerIdsForVisibility, state.selectedDomPath);
    state.domNeedsReset = false;
  }
  renderTreeDetails();

  if (!state.selectedSession) {
    updateTreeCounts(0, 0);
    setGraphPlaceholder('未选择会话', '选择会话后生成容器树');
    clearGraphData();
    queueFitWindow();
    return;
  }
  if (!hasTree) {
    updateTreeCounts(0, 0);
    setGraphPlaceholder('等待容器匹配', '点击“刷新面板”捕获容器树');
    clearGraphData();
    queueFitWindow();
    return;
  }
  if (!containerRows.length) {
    updateTreeCounts(0, 0);
    setGraphPlaceholder('暂无容器', '检查容器库定义或容器匹配规则');
    clearGraphData();
    queueFitWindow();
    return;
  }

  updateTreeCounts(containerRows.length, domNodes.length);
  hideGraphPlaceholder();
  updateGraphVisualization(containerRows, domNodes, links);
  queueFitWindow();
}

function clearGraphData() {
  try {
    graphView?.setData({ containers: [], domNodes: [], links: [] });
    graphView?.setSelection({ containerId: null, domPath: null });
  } catch {
    // ignore
  }
}

function updateTreeCounts(containerCount, domCount) {
  if (ui.treeContainerCount) ui.treeContainerCount.textContent = String(containerCount || 0);
  if (ui.treeDomCount) ui.treeDomCount.textContent = String(domCount || 0);
}

function updateGraphVisualization(containerRows, domNodes, links) {
  if (!graphView) return;
  try {
    graphView.setData({ containers: containerRows, domNodes, links });
    graphView.setSelection({
      containerId: state.selectedContainerId,
      domPath: state.selectedDomPath,
    });
    if (containerRows.length || domNodes.length) {
      bus.publish('ui.graph.snapshotReady', {
        containerCount: containerRows.length,
        domCount: domNodes.length,
        selectedContainer: state.selectedContainerId,
        selectedDomPath: state.selectedDomPath,
      });
    }
    publishGraphReport('snapshot');
  } catch (err) {
    console.warn('[ui] graph render failed', err);
    showMessage(err?.message || '容器图渲染失败', 'error');
  }
}

function renderTreeDetails() {
  const rootId = getRootContainerId();
  renderContainerTreeList(state.containerSnapshot?.container_tree, rootId);
  domTreeView?.render();
}

function renderContainerTreeList(rootNode, rootId) {
  if (!ui.treeContainerList) return;
  ui.treeContainerList.innerHTML = '';
  if (!rootNode) {
    const placeholder = document.createElement('div');
    placeholder.className = 'tree-empty';
    placeholder.textContent = '暂无容器数据';
    ui.treeContainerList.appendChild(placeholder);
    return;
  }
  buildContainerTreeRows(rootNode, 0, ui.treeContainerList, rootId);
}

function buildContainerTreeRows(node, depth, target, rootId) {
  if (!node) return;
  const containerId = getContainerId(node);
  if (rootId && containerId && containerId !== rootId && !containerId.startsWith(`${rootId}.`)) {
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => buildContainerTreeRows(child, depth, target, rootId));
    }
    return;
  }
  const row = document.createElement('div');
  row.className = 'tree-line tree-line-container';
  row.style.paddingLeft = `${depth * 16}px`;
  if (containerId && state.selectedContainerId === containerId) {
    row.classList.add('active');
  }
  const label = document.createElement('span');
  label.className = 'tree-label';
  const alias = getContainerAlias(node);
  label.textContent = alias || node.name || containerId || '容器';
  row.appendChild(label);
  if (node.name && alias && node.name !== alias) {
    const aliasMeta = document.createElement('span');
    aliasMeta.className = 'tree-meta';
    aliasMeta.textContent = node.name;
    row.appendChild(aliasMeta);
  }
  const selector = containerId ? getContainerSelector(containerId, state.containerSnapshot?.container_tree) : null;
  if (selector) {
    const hint = document.createElement('code');
    hint.textContent = selector;
    row.appendChild(hint);
  }
  if (containerId) {
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      handleContainerSelection(containerId);
    });
  }
  target.appendChild(row);
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => buildContainerTreeRows(child, depth + 1, target, rootId));
  }
}

async function toggleDomNodeExpand(path) {
  if (!path) return;
  debugLog('toggleDomNodeExpand', path);
  if (isPathExpanded(state.domTreeStore, path)) {
    setPathExpanded(state.domTreeStore, path, false);
    markExpanded(state.graphStore, path, false);
    domTreeView?.render();
    renderContainers();
    queueFitWindow();
    bus.publish('ui.graph.domCollapsed', { path });
    return;
  }
  bus.publish('ui.graph.domExpandRequested', { path });
  setPathExpanded(state.domTreeStore, path, true);
  markExpanded(state.graphStore, path, true);
  domTreeView?.render();
  queueFitWindow();
  const domTree = getDomTree(state.domTreeStore);
  const node = findDomNodeByPath(domTree, path);
  if (!node) {
    bus.publish('ui.graph.domExpandFailed', { path, error: 'node-missing' });
    debugLog('toggleDomNodeExpand-missing', path);
    return;
  }
  const stats = getDomNodeChildStats(node);
  debugLog('toggleDomNodeExpand-stats', path, stats);
  if (stats.needsLazyLoad) {
    const loaded = await loadDomBranch(path);
    if (!loaded) {
      setPathExpanded(state.domTreeStore, path, false);
      markExpanded(state.graphStore, path, false);
      domTreeView?.render();
      queueFitWindow();
      bus.publish('ui.graph.domExpandFailed', { path, error: 'load-failed' });
    }
  } else {
    renderContainers();
    const childCount = getDomChildren(state.graphStore, path).length;
    bus.publish('ui.graph.domExpanded', { path, childCount });
  }
}

async function loadDomBranch(path) {
  const domTree = getDomTree(state.domTreeStore);
  if (!path || !domTree || !state.selectedSession) return false;
  if (isBranchLoading(state.domTreeStore, path)) return true;
  const node = findDomNodeByPath(domTree, path);
  if (!node) return false;
  const url = resolveCurrentPageUrl();
  if (!url) {
    showMessage('无法确定当前页面 URL', 'error');
    return false;
  }
  const payload = {
    profile: state.selectedSession,
    url,
    path: normalizeDomPathString(path),
    rootSelector: getRootDomSelector(),
    ...DOM_SNAPSHOT_OPTIONS,
  };
  setBranchLoading(state.domTreeStore, path, true);
  markLoading(state.graphStore, path, true);
  domTreeView?.render();
  renderContainers();
  let success = false;
  try {
    const res = await invokeAction('containers:inspect-branch', payload);
    const branchPayload = res?.branch || res;
    const branchNode = branchPayload?.node;
    if (!branchNode) {
      throw new Error('分支数据为空');
    }
    mergeDomBranchIntoTree(state.domTreeStore, branchNode);
    ingestDomBranch(state.graphStore, branchNode, node.path);
    success = true;
  } catch (err) {
    console.warn('[ui] dom branch load failed', err);
    showMessage(err?.message || '加载 DOM 分支失败', 'error');
    bus.publish('ui.graph.domBranchFailed', { path, error: err?.message || String(err) });
  } finally {
    setBranchLoading(state.domTreeStore, path, false);
    markLoading(state.graphStore, path, false);
  }
  if (success) {
    domTreeView?.render();
    renderContainers();
    const childCount = getDomChildren(state.graphStore, path).length;
    bus.publish('ui.graph.domBranchLoaded', { path, childCount });
    bus.publish('ui.graph.domExpanded', { path, childCount });
  } else {
    domTreeView?.render();
    renderContainers();
    bus.publish('ui.graph.domBranchFailed', { path });
  }
  return success;
}


function setGraphPlaceholder(title, desc, options = {}) {
  const overlay = ui.containerDomGrid?.querySelector('.graph-overlay');
  if (!overlay) return;
  overlay.innerHTML = `<div class="tree-placeholder"><strong>${title}</strong><p>${desc}</p></div>`;
  overlay.classList.remove('hidden');
  try {
    graphView?.setData({ containers: [], domNodes: [], links: [] });
    graphView?.setSelection({ containerId: null, domPath: null });
  } catch (err) {
    console.warn('[ui] set placeholder failed', err);
  }
  if (!options.preserveCounts) {
    if (ui.treeContainerCount) ui.treeContainerCount.textContent = '0';
    if (ui.treeDomCount) ui.treeDomCount.textContent = '0';
  }
}

function hideGraphPlaceholder() {
  const overlay = ui.containerDomGrid?.querySelector('.graph-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function handleContainerSelection(containerId) {
  if (!containerId || !state.containerSnapshot) return;
  state.selectedContainerId = containerId;
  const domPaths = findAllDomPathsForContainer(containerId, getDomTree(state.domTreeStore));
  if (domPaths.length) {
    state.selectedDomPath = domPaths[0];
  }
  const selector = getContainerSelector(containerId, state.containerSnapshot.container_tree);
  if (selector) {
    triggerHighlight(selector);
  }
  if (state.linkMode.active) {
    state.linkMode.containerId = containerId;
    updateLinkModeUI();
  }
  graphView?.setSelection({ containerId: state.selectedContainerId, domPath: state.selectedDomPath });
  renderTreeDetails();
  queueFitWindow();
  ensureContainerDomMapping(containerId);
}

function handleDomSelection(domPath) {
  const domTree = getDomTree(state.domTreeStore);
  if (!domPath || !domTree) return;
  state.selectedDomPath = domPath;
  const node = findDomNodeByPath(domTree, domPath);
  if (node?.containers?.length) {
    const container = node.containers[0].container_id || node.containers[0].container_name;
    if (container) {
      state.selectedContainerId = container;
    }
  }
  if (state.linkMode.active && state.linkMode.containerId && !state.linkMode.busy) {
    remapContainerToDom(state.linkMode.containerId, domPath, node);
    return;
  }
  const selector = getDomNodeSelector(node);
  if (selector) {
    triggerHighlight(selector);
  }
  graphView?.setSelection({ containerId: state.selectedContainerId, domPath: state.selectedDomPath });
  renderTreeDetails();
  queueFitWindow();
}

function handleGraphLink(containerId, domPath) {
  if (!containerId || !domPath) return;
  if (!state.linkMode.active || state.linkMode.busy) return;
  state.linkMode.containerId = containerId;
  updateLinkModeUI();
  remapContainerToDom(containerId, domPath);
}

async function remapContainerToDom(containerId, domPath, domNode = null) {
  if (!containerId || !domPath || state.linkMode.busy) return;
  const containerNode = findContainerNode(state.containerSnapshot?.container_tree, containerId);
  if (!containerNode) {
    showMessage('找不到容器定义', 'error');
    return;
  }
  const domTarget = domNode || findDomNodeByPath(getDomTree(state.domTreeStore), domPath);
  if (!domTarget) {
    showMessage('找不到 DOM 节点', 'error');
    return;
  }
  const selector = getDomNodeSelector(domTarget) || domTarget.selector || domTarget.path;
  if (!selector) {
    showMessage('DOM 节点缺少 selector，无法重连', 'error');
    return;
  }
  const sessionMeta = getSelectedSessionMeta();
  const url =
    sessionMeta?.current_url ||
    sessionMeta?.currentUrl ||
    state.containerSnapshot?.metadata?.page_url ||
    state.containerSnapshot?.target_url ||
    '';
  const payload = {
    profile: state.selectedSession,
    url,
    containerId,
    selector,
    domPath,
    definition: containerNode.definition || {
      id: containerId,
      selectors: containerNode.selectors || [],
    },
  };
  try {
  state.linkMode.busy = true;
  updateLinkModeUI();
  const res = await invokeAction('containers:remap', payload);
  applyContainerSnapshotData(res, { toastMessage: '容器选择器已更新' });
  bus.publish('ui.graph.containerRemapped', { containerId, domPath, selector });
  toggleLinkMode(false);
  renderContainers();
  } catch (err) {
    showMessage(err?.message || '容器重连失败', 'error');
  } finally {
    state.linkMode.busy = false;
    updateLinkModeUI();
  }
}

function getContainerId(container) {
  if (!container) return '';
  return container.id || container.container_id || container.containerId || '';
}

function getSelectedSessionMeta() {
  if (!state.selectedSession) return null;
  return state.sessions.find((s) => s.profileId === state.selectedSession) || null;
}

function resolveCurrentPageUrl() {
  const sessionMeta = getSelectedSessionMeta();
  return (
    sessionMeta?.current_url ||
    sessionMeta?.currentUrl ||
    state.containerSnapshot?.metadata?.page_url ||
    state.containerSnapshot?.target_url ||
    ''
  );
}

function getRootDomSelector() {
  return (
    state.containerSnapshot?.metadata?.root_selector ||
    state.containerSnapshot?.root_match?.container?.matched_selector ||
    state.containerSnapshot?.container_tree?.selectors?.[0]?.css ||
    '#app'
  );
}

function hasContainerDomPath(containerNode) {
  if (!containerNode?.match?.nodes) return false;
  return containerNode.match.nodes.some((entry) => entry?.dom_path);
}

async function ensureContainerDomMapping(containerId) {
  if (!containerId || !state.selectedSession || state.pendingContainerDom.has(containerId)) {
    return;
  }
  const containerNode = findContainerNode(state.containerSnapshot?.container_tree, containerId);
  if (!containerNode) return;
  if (hasContainerDomPath(containerNode)) return;
  const url = resolveCurrentPageUrl();
  if (!url) return;
  state.pendingContainerDom.add(containerId);
  try {
    const res = await invokeAction('containers:inspect-container', {
      profile: state.selectedSession,
      url,
      containerId,
      ...DOM_SNAPSHOT_OPTIONS,
    });
    const snapshot = res?.data?.snapshot || res?.snapshot || res;
    const targetTree = snapshot?.container_tree;
    const match = targetTree?.match;
    if (match) {
      updateContainerMatch(containerId, match);
    }
    const domPath = match?.nodes?.find((entry) => entry?.dom_path)?.dom_path;
    if (domPath) {
      ensureDomPathExists(state.domTreeStore, domPath);
      await loadDomBranch(domPath);
    }
  } catch (err) {
    console.warn('[ui] ensureContainerDomMapping failed', err);
  } finally {
    state.pendingContainerDom.delete(containerId);
  }
}

function scheduleAutoExpand() {
  if (!AUTO_EXPAND_PATHS.length || autoExpandTriggered) return;
  autoExpandTriggered = true;
  setTimeout(() => {
    AUTO_EXPAND_PATHS.forEach((path) => {
      if (path) {
        debugLog('auto-expand', path);
        toggleDomNodeExpand(path);
      }
    });
  }, 800);
}

function getDomParentPath(path) {
  if (!path) return null;
  const entry = getDomNode(state.graphStore, path);
  return entry?.parentPath || null;
}

function shouldDisplayDomNode(node) {
  if (!node) return false;
  if (node.containerId) return true;
  const path = node.path;
  if (!path) return false;
  if (isDefaultVisible(state.domTreeStore, path)) return true;
  const parentPath = getDomParentPath(path);
  if (parentPath && isPathExpanded(state.domTreeStore, parentPath)) {
    return true;
  }
  return false;
}

function buildGraphReportPayload() {
  const rootId = getRootContainerId();
  const graphData = rootId ? buildGraphData(state.graphStore, rootId) : { containerRows: [], domNodes: [], links: [] };
  const visibilityMap = new Map();
  (graphData.domNodes || []).forEach((node) => {
    const visible = shouldDisplayDomNode(node);
    visibilityMap.set(node.path, visible);
  });
  const visibleChildCount = new Map();
  (graphData.domNodes || []).forEach((node) => {
    const parent = node.parentPath;
    if (!parent) return;
    if (!visibleChildCount.has(parent)) visibleChildCount.set(parent, 0);
    if (visibilityMap.get(node.path)) {
      visibleChildCount.set(parent, (visibleChildCount.get(parent) || 0) + 1);
    }
  });
  const domReport = (graphData.domNodes || []).map((node) => {
    const storeNode = getDomNode(state.graphStore, node.path) || {};
    const totalChildren = typeof storeNode.childCount === 'number' ? storeNode.childCount : getDomChildren(state.graphStore, node.path).length;
    const loadedChildren = getDomChildren(state.graphStore, node.path).length;
    const visibleChildren = visibleChildCount.get(node.path) || 0;
    const visible = visibilityMap.get(node.path) || false;
    return {
      path: node.path,
      label: node.label,
      containerId: node.containerId || null,
      childCount: totalChildren,
      loadedChildren,
      visibleChildren,
      expanded: Boolean(node.expanded),
      canExpand: Boolean(node.canExpand),
      expectedExpandable: visible && totalChildren > 0,
      visible,
    };
  });
  return {
    rootId,
    containerCount: graphData.containerRows?.length || 0,
    domCount: domReport.length,
    domNodes: domReport,
  };
}

function publishGraphReport(reason = 'manual') {
  const payload = buildGraphReportPayload();
  bus.publish('ui.graph.report', { ...payload, reason });
}


function getContainerSelector(containerId, tree) {
  const node = findContainerNode(tree, containerId);
  if (!node) return null;
  return (
    node.match?.matched_selector ||
    node.match?.selectors?.[0] ||
    node.selectors?.find((sel) => sel?.css)?.css ||
    node.selectors?.[0]?.css ||
    null
  );
}

function findContainerNode(node, containerId) {
  if (!node || !containerId) return null;
  if (node.id === containerId || node.container_id === containerId) {
    return node;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findContainerNode(child, containerId);
      if (result) return result;
    }
  }
  return null;
}

function updateContainerMatch(containerId, match) {
  if (!containerId || !state.containerSnapshot?.container_tree) return;
  const node = findContainerNode(state.containerSnapshot.container_tree, containerId);
  if (node) {
    node.match = match;
  }
  const storeNode = state.graphStore.containers.get(containerId);
  if (storeNode) {
    state.graphStore.containers.set(containerId, { ...storeNode, match });
  }
}

function getDomNodeSelector(node) {
  if (!node) return null;
  if (node.selector) return node.selector;
  if (Array.isArray(node.containers) && node.containers.length) {
    const containerId = node.containers[0].container_id || node.containers[0].container_name;
    return getContainerSelector(containerId, state.containerSnapshot?.container_tree);
  }
  return null;
}

function getContainerAlias(node) {
  if (!node) return '';
  const definition = node.definition || {};
  const alias =
    node.alias ||
    node.metadata?.alias ||
    definition.alias ||
    definition.metadata?.alias ||
    definition.nickname ||
    null;
  if (alias) return alias;
  const selectors = definition.selectors || node.selectors || [];
  const selectorAlias = extractAliasFromSelectors(selectors);
  if (selectorAlias) return selectorAlias;
  return node.name || node.id || '';
}

function extractAliasFromSelectors(selectors = []) {
  if (!Array.isArray(selectors)) return '';
  const first = selectors.find((item) => item?.css);
  if (!first?.css) return '';
  const css = first.css.trim();
  if (!css) return '';
  if (css.startsWith('#') || css.startsWith('.')) {
    return css;
  }
  const match = css.match(/([.#][\w-]+)/);
  return match ? match[1] : css;
}

function getRootContainerId() {
  return (
    state.containerSnapshot?.container_tree?.id ||
    state.containerSnapshot?.root_match?.container?.id ||
    null
  );
}

let highlightTimer = null;
function triggerHighlight(selector) {
  if (!selector) return;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(async () => {
    try {
      await invokeAction('operations:run', { op: 'highlight', config: { selector } });
    } catch (err) {
      console.warn('[ui] highlight failed', err?.message || err);
    }
  }, 120);
}

function renderOperations() {
  if (!ui.operationChips) return;
  ui.operationChips.innerHTML = '';
  if (!state.operations.length) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '暂无操作';
    ui.operationChips.appendChild(chip);
    return;
  }
  state.operations.forEach((op) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = op.id;
    if (op.description) chip.title = op.description;
    chip.addEventListener('click', () => handleOperationRun(op));
    ui.operationChips.appendChild(chip);
  });
  queueFitWindow();
}

async function handleOperationRun(op) {
  if (!state.selectedSession) {
    showMessage('请选择会话后再执行操作', 'warn');
    return;
  }
  const config = getDefaultOperationConfig(op.id);
  try {
    const result = await invokeAction('operations:run', { op: op.id, config });
    const ok = result?.success !== false;
    showMessage(`操作 ${op.id} ${ok ? '执行成功' : '执行失败'}`, ok ? 'success' : 'error');
  } catch (err) {
    showMessage(err.message || `操作 ${op.id} 执行失败`, 'error');
  }
}

function getDefaultOperationConfig(opId) {
  switch (opId) {
    case 'highlight':
      return {
        selector:
          state.containerSnapshot?.root_match?.container?.matched_selector ||
          state.containerSnapshot?.container_tree?.selectors?.[0]?.css ||
          '#app',
      };
    case 'scroll':
      return { distance: 400, direction: 'down' };
    default:
      return {};
  }
}

function renderLogs() {
  if (!ui.logStream) return;
  ui.logStream.textContent = state.logs.length ? state.logs.join('\n') : '暂无日志';
  queueFitWindow();
}

function setLoading(section, loading) {
  state.loading[section] = loading;
  const map = {
    browser: ui.browserPanel,
    sessions: ui.sessionPanel,
    logs: ui.logPanel,
    containers: ui.containersPanel,
  };
  if (map[section]) {
    map[section].dataset.loading = String(loading);
  }
}

function showMessage(text, variant = 'info') {
  if (!ui.globalMessage) return;
  ui.globalMessage.textContent = text;
  ui.globalMessage.dataset.variant = variant;
  ui.globalMessage.classList.add('visible');
  clearTimeout(state.messageTimer);
  state.messageTimer = setTimeout(() => {
    ui.globalMessage.classList.remove('visible');
  }, 3500);
}

async function invokeAction(action, payload = {}) {
  if (!backend?.invokeAction) {
    if (DEBUG) logger.warn('[floating-debug] backendAPI missing, fallback mock for action', action);
    return mockAction(action);
  }
  debugLog('invokeAction', action, payload);
  const result = await backend.invokeAction(action, payload).catch((err) => {
    logger.error('[floating-debug] invokeAction error', action, err);
    throw err;
  });
  if (result?.success === false) {
    throw new Error(result?.error || `Action ${action} failed`);
  }
  debugLog('action result', action, result);
  return result?.data ?? result;
}

function mockAction(action) {
  switch (action) {
    case 'browser:status':
      return { healthy: false, sessions: [] };
    case 'session:list':
      return { sessions: [] };
    case 'logs:stream':
      return { lines: ['[mock] backend 未连接'] };
    case 'operations:list':
      return [
        { id: 'highlight', description: 'mock highlight' },
        { id: 'scroll', description: 'mock scroll' },
      ];
    case 'containers:inspect':
      return {
        containerSnapshot: {
          container_tree: {
            id: 'mock_root',
            name: '示例根容器',
            type: 'page',
            match: { selectors: ['#app'] },
            children: [],
          },
        },
        domTree: {
          tag: 'DIV',
          id: 'app',
          childCount: 0,
        },
      };
    default:
      return {};
  }
}

init().catch((err) => {
  console.error('[ui] init failed', err);
  showMessage(err?.message || 'UI 初始化失败', 'error');
});
