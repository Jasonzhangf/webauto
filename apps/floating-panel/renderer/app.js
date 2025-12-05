import { ContainerDomGraphView } from './graph/graph-view.js';
import { flattenContainerTree, collectDomTargets, buildGraphLinks, formatDomNodeLabel } from './graph/data-utils.js';

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
  domTree: null,
  selectedContainerId: null,
  selectedDomPath: null,
  domDefaultVisible: new Set(),
  domExpandedPaths: new Set(),
  domNeedsReset: false,
  linkMode: {
    active: false,
    containerId: null,
    busy: false,
  },
  messageTimer: null,
  loading: {
    browser: false,
    sessions: false,
    logs: false,
    containers: false,
  },
  isCollapsed: false,
};

const layoutState = {
  fitTimer: null,
  resizeObserver: null,
};

let graphView = null;

const backend = window.backendAPI;
const desktop = window.desktopAPI;

async function init() {
  bindWindowControls();
  bindEvents();
  updateLinkModeUI();
  subscribeDesktopEvents();
  setupAutoFit();
  setupGraphView();
  await loadOperations();
  await refreshAll();
}

function bindWindowControls() {
  ui.closeButton?.addEventListener('click', () => desktop?.close?.());
  ui.minButton?.addEventListener('click', () => desktop?.minimize?.());
  ui.collapseButton?.addEventListener('click', () => desktop?.toggleCollapse?.());
  ui.collapsedStrip?.addEventListener('click', (event) => {
    event.preventDefault();
    desktop?.toggleCollapse?.(false);
  });
  ui.expandCollapsedButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    desktop?.toggleCollapse?.(false);
  });
  ui.stickBrowserButton?.addEventListener('click', () => {
    invokeAction('window:stick-browser').catch((err) => {
      showMessage(err.message || '浏览器贴边失败', 'error');
    });
  });
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
    state.containerSnapshot = null;
    state.domTree = null;
    renderContainers();
    return;
  }
  if (!skipLoading) setLoading('containers', true);
  try {
    const selected = state.sessions.find((s) => s.profileId === state.selectedSession);
    const url = selected?.current_url || selected?.currentUrl;
    if (!url) throw new Error('会话没有 URL');
    const res = await invokeAction('containers:inspect', { profile: state.selectedSession, url });
    applyContainerSnapshotData(res, { toastMessage: `容器树已捕获 (${state.selectedSession})` });
  } catch (err) {
    state.containerSnapshot = null;
    state.domTree = null;
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
  state.domTree = snapshot?.dom_tree || result?.domTree || null;
  if (snapshot?.container_tree?.id) {
    state.selectedContainerId = snapshot.container_tree.id;
  }
  if (state.domTree?.path) {
    state.selectedDomPath = state.domTree.path;
  }
  const initialPaths = findAllDomPathsForContainer(state.selectedContainerId, state.domTree);
  if (!state.selectedDomPath && initialPaths.length) {
    state.selectedDomPath = initialPaths[0];
  }
  state.domNeedsReset = true;
  if (options.toastMessage) {
    showMessage(options.toastMessage, 'success');
  }
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
  if (hasTree) {
    containerRows = flattenContainerTree(state.containerSnapshot.container_tree);
    if (containerRows.length) {
      const domNodesByContainer = new Map();
      containerRows.forEach((row) => {
        const containerId = getContainerId(row.container);
        if (!containerId) return;
        const targets = collectDomTargets(state.domTree, containerId, [], 0);
        domNodesByContainer.set(containerId, targets);
        domNodes.push(...targets);
      });
      links = buildGraphLinks(containerRows, domNodesByContainer);
    }
  }
  if (rootId) {
    const belongsToRoot = (id) => !id || id === rootId || id.startsWith(`${rootId}.`);
    containerRows = containerRows.filter((row) => belongsToRoot(getContainerId(row.container)));
    domNodes = domNodes.filter((node) => !node.containerId || belongsToRoot(node.containerId));
    links = links.filter((link) => belongsToRoot(link.from));
  }
  const containerIdSet = new Set(containerRows.map((row) => getContainerId(row.container)).filter(Boolean));
  if (state.selectedContainerId && !containerIdSet.has(state.selectedContainerId)) {
    state.selectedContainerId = containerRows[0]?.container?.id || rootId || null;
  }
  const domPathSet = new Set(domNodes.map((node) => node.path).filter(Boolean));
  if (state.selectedDomPath && !domPathSet.has(state.selectedDomPath)) {
    state.selectedDomPath = domNodes[0]?.path || null;
  }
  if (state.domNeedsReset) {
    resetDomVisibility(containerRows);
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
  } catch (err) {
    console.warn('[ui] graph render failed', err);
    showMessage(err?.message || '容器图渲染失败', 'error');
  }
}

function renderTreeDetails() {
  const rootId = getRootContainerId();
  renderContainerTreeList(state.containerSnapshot?.container_tree, rootId);
  renderDomTreeList(state.domTree);
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

function renderDomTreeList(rootNode) {
  if (!ui.treeDomList) return;
  ui.treeDomList.innerHTML = '';
  if (!rootNode) {
    const placeholder = document.createElement('div');
    placeholder.className = 'tree-empty';
    placeholder.textContent = '暂无 DOM 数据';
    ui.treeDomList.appendChild(placeholder);
    return;
  }
  buildDomTreeRows(rootNode, 0, ui.treeDomList);
}

function buildDomTreeRows(node, depth, target) {
  if (!node) return false;
  const path = node.path || (depth === 0 ? '__root__' : '');
  const isRoot = depth === 0;
  const isDefaultVisible = isRoot || (path && state.domDefaultVisible.has(path));
  const isExpanded = path && state.domExpandedPaths.has(path);
  if (!isRoot && !isDefaultVisible && !isExpanded) {
    return false;
  }
  const row = document.createElement('div');
  row.className = 'tree-line tree-line-dom';
  row.style.paddingLeft = `${Math.max(depth - 1, 0) * 18 + 12}px`;
  if (path && state.selectedDomPath === path) {
    row.classList.add('active');
  }
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  if (hasChildren && path) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tree-expand-btn';
    expandBtn.textContent = isExpanded ? '−' : '+';
    expandBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleDomNodeExpand(path);
    });
    row.appendChild(expandBtn);
  }
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = formatDomNodeLabel(node) || node.tag || path || '节点';
  row.appendChild(label);
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
  if (path && path !== '__root__') {
    row.dataset.path = path;
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDomSelection(path);
    });
    row.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      toggleDomNodeExpand(path);
    });
  }
  target.appendChild(row);
  if (!hasChildren) {
    return true;
  }
  const childNodes = node.children || [];
  const shouldShowAll = path && state.domExpandedPaths.has(path);
  const visibleChildren = shouldShowAll
    ? childNodes
    : childNodes.filter((child) => !child.path || state.domDefaultVisible.has(child.path));
  visibleChildren.forEach((child) => buildDomTreeRows(child, depth + 1, target));
  return true;
}

function toggleDomNodeExpand(path) {
  if (!path || path === '__root__') return;
  if (state.domExpandedPaths.has(path)) {
    state.domExpandedPaths.delete(path);
  } else {
    state.domExpandedPaths.add(path);
  }
  renderTreeDetails();
  queueFitWindow();
}

function resetDomVisibility(containerRows) {
  state.domDefaultVisible = new Set();
  state.domExpandedPaths = new Set();
  if (!state.domTree) return;
  const containerIds = new Set(
    containerRows.map((row) => getContainerId(row.container)).filter((id) => typeof id === 'string' && id.length),
  );
  if (!containerIds.size) {
    if (state.domTree.path) {
      state.domDefaultVisible.add(state.domTree.path);
    }
    return;
  }
  markDomVisibility(state.domTree, state.domDefaultVisible, containerIds);
  if (state.selectedDomPath) {
    state.domDefaultVisible.add(state.selectedDomPath);
  }
  if (state.domTree.path) {
    state.domDefaultVisible.add(state.domTree.path);
  }
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
  const domPaths = findAllDomPathsForContainer(containerId, state.domTree);
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
}

function handleDomSelection(domPath) {
  if (!domPath || !state.domTree) return;
  state.selectedDomPath = domPath;
  const node = findDomNodeByPath(state.domTree, domPath);
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

async function remapContainerToDom(containerId, domPath, domNode = null) {
  if (!containerId || !domPath || state.linkMode.busy) return;
  const containerNode = findContainerNode(state.containerSnapshot?.container_tree, containerId);
  if (!containerNode) {
    showMessage('找不到容器定义', 'error');
    return;
  }
  const domTarget = domNode || findDomNodeByPath(state.domTree, domPath);
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

function findDomNodeByPath(root, targetPath) {
  if (!root || !targetPath) return null;
  if (root.path === targetPath) return root;
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const result = findDomNodeByPath(child, targetPath);
      if (result) return result;
    }
  }
  return null;
}

function findAllDomPathsForContainer(containerId, root, acc = []) {
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
  return acc;
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
    return mockAction(action);
  }
  const result = await backend.invokeAction(action, payload);
  if (result?.success === false) {
    throw new Error(result?.error || `Action ${action} failed`);
  }
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
