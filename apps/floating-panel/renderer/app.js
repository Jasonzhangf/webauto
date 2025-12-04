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
  containerTreePlaceholder: document.getElementById('containerTreePlaceholder'),
  domMapPlaceholder: document.getElementById('domMapPlaceholder'),
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

const backend = window.backendAPI;
const desktop = window.desktopAPI;

async function init() {
  bindWindowControls();
  bindEvents();
  subscribeDesktopEvents();
  setupAutoFit();
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
    state.browserStatus = null;
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
    if (state.selectedSession && !state.sessions.some((s) => s.profileId === state.selectedSession)) {
      state.selectedSession = null;
    }
  } catch (err) {
    state.sessions = [];
    showMessage(err.message || '会话列表获取失败', 'error');
  } finally {
    setLoading('sessions', false);
    renderSessions();
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
  const healthy = status?.healthy;
  ui.browserStatusText.textContent = healthy ? '服务就绪' : '服务未就绪';
  ui.browserStatusText.dataset.state = healthy ? 'ok' : 'warn';
  const sessionCount = status?.sessions?.length ?? 0;
  ui.browserDetails.textContent = healthy
    ? `活动会话 ${sessionCount} 个`
    : '请先启动浏览器服务（端口 7704/8765）';
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
    const snapshot = res?.snapshot || res?.containerSnapshot || res;
    state.containerSnapshot = snapshot;
    state.domTree = snapshot?.dom_tree || res?.domTree || null;
    showMessage(`容器树已捕获 (${state.selectedSession})`, 'success');
  } catch (err) {
    state.containerSnapshot = null;
    state.domTree = null;
    showMessage(err.message || '容器树捕获失败', 'error');
  } finally {
    setLoading('containers', false);
    renderContainers();
  }
}

function renderContainers() {
  const treeContainer = ui.containerTreePlaceholder;
  const domContainer = ui.domMapPlaceholder;
  if (ui.openInspectorButton) {
    ui.openInspectorButton.disabled = !state.selectedSession || !desktop?.openInspector;
  }
  if (!state.selectedSession) {
    if (treeContainer) {
      treeContainer.innerHTML = '<strong>未选择会话</strong><p>请先选择会话后再生成容器树。</p>';
    }
    if (domContainer) {
      domContainer.innerHTML = '<strong>等待会话</strong><p>DOM 映射依赖已捕获的容器树。</p>';
    }
    queueFitWindow();
    return;
  }

  if (state.containerSnapshot?.container_tree) {
    treeContainer.innerHTML = '';
    treeContainer.appendChild(buildContainerTree(state.containerSnapshot.container_tree));
  } else {
    treeContainer.innerHTML = '<strong>等待容器匹配</strong><p>点击“刷新面板”捕获容器树。</p>';
  }

  if (state.domTree) {
    domContainer.innerHTML = '';
    domContainer.appendChild(buildDomTree(state.domTree));
  } else {
    domContainer.innerHTML = '<strong>DOM 快照待捕获</strong><p>容器树捕获后自动生成 DOM 映射。</p>';
  }
  queueFitWindow();
}

function buildContainerTree(node, depth = 0) {
  const root = document.createElement('div');
  root.className = 'tree-view';
  const title = document.createElement('div');
  title.className = 'tree-node-title';
  const selectors = node.match?.selectors?.join(', ') || '无匹配';
  title.innerHTML = `<strong>${node.name || node.id}</strong><span>${node.type || ''} · ${selectors}</span>`;
  root.appendChild(title);
  if (node.children && node.children.length) {
    const list = document.createElement('div');
    list.className = 'tree-children';
    node.children.forEach((child) => list.appendChild(buildContainerTree(child, depth + 1)));
    root.appendChild(list);
  }
  return root;
}

function buildDomTree(node, depth = 0) {
  if (depth > 2) return document.createTextNode('');
  const container = document.createElement('div');
  container.className = 'dom-node';
  const title = document.createElement('div');
  title.className = 'dom-node-title';
  const label = [`<${node.tag.toLowerCase()}>`];
  if (node.id) label.push(`#${node.id}`);
  if (node.classes?.length) label.push(`.${node.classes.join('.')}`);
  const mapped = (node.containers || []).map((c) => c.container_name || c.container_id);
  title.innerHTML = `<strong>${label.join('')}</strong><span>${mapped.length ? mapped.join(', ') : ''}</span>`;
  container.appendChild(title);
  if (node.children && node.children.length) {
    const list = document.createElement('div');
    list.className = 'dom-children';
    node.children.forEach((child) => {
      const childNode = buildDomTree(child, depth + 1);
      if (childNode) list.appendChild(childNode);
    });
    container.appendChild(list);
  }
  return container;
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
