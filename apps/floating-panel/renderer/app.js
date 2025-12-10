import { ContainerDomGraphView } from './graph/graph-view.js';
import { formatDomNodeLabel } from './graph/data-utils.js';
import {
  ingestDomBranch,
  buildGraphData,
  getDomChildren,
  getDomNode,
  markExpanded,
  markLoading,
} from './graph/store.js';
import {
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
import { collectUiElements } from './modules/state/ui-elements.js';
import { createUiState, createLayoutState } from './modules/state/ui-state.js';
import { createUiStateService } from './modules/state/ui-state-service.js';
import { createBackendBridge } from './modules/messaging/backend-bridge.js';
import { initWindowControls, subscribeDesktopState } from './modules/controls/window-controls.js';
import { bindCoreEvents } from './modules/controls/core-events.js';
import { registerRendererBus } from './modules/messaging/bus-subscriptions.js';
import { createDataLoaders } from './modules/state/data-loaders.js';
import { createSnapshotManager } from './modules/containers/snapshot-manager.js';
import { createContainerOpsManager } from './modules/containers/container-ops.js';
import { createSessionPanel } from './modules/panels/session-panel.js';
import { createDomActionsManager } from './modules/dom/dom-actions.js';

const DOM_SNAPSHOT_OPTIONS = {
  maxDepth: 1,
  maxChildren: 4,
};
const DOM_BRANCH_OPTIONS = {
  maxDepth: 5,
  maxChildren: 12,
};
const DEFAULT_HIGHLIGHT_STYLE = '3px solid #34a853';
const HOVER_DOM_STYLE = '2px dashed rgba(52, 168, 83, 0.85)';
const HOVER_CONTAINER_STYLE = '2px dashed rgba(26, 115, 232, 0.85)';
const HOVER_DOM_CHANNEL = 'hover-dom';
const HOVER_CONTAINER_CHANNEL = 'hover-container';
const DEFAULT_HIGHLIGHT_DURATION = 2200;
const INITIAL_SESSION_RETRIES = 4;
const INITIAL_SESSION_RETRY_DELAY_MS = 1200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

console.log('[floating] renderer booting');
const config = window.floatingConfig || {};
const DEBUG = Boolean(config.debug);
const AUTO_REFRESH_INTERVAL_MS = Math.max(
  0,
  Number(
    config.autoRefreshIntervalMs ??
      config.autoRefreshInterval ??
      config.auto_refresh_interval_ms ??
      config.auto_refresh_interval ??
      8000,
  ),
);
const AUTO_REFRESH_MAX_AGE_MS = Math.max(
  Number(
    config.autoRefreshMaxAgeMs ??
      config.autoRefreshMaxAge ??
      config.auto_refresh_max_age_ms ??
      config.auto_refresh_max_age ??
      20000,
  ),
  AUTO_REFRESH_INTERVAL_MS ? AUTO_REFRESH_INTERVAL_MS * 2 : 20000,
);
const AUTO_EXPAND_PATHS = Array.isArray(config.autoExpandPaths) ? config.autoExpandPaths : [];
const logger = window.floatingLogger || {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
const ui = collectUiElements(document);
const state = createUiState({ config });
const layoutState = createLayoutState();
const uiStateService = createUiStateService({ bus, logger });
uiStateService.updateWindow({ mode: 'boot', collapsed: false, headless: false }, 'init');
uiStateService.updateSessions({ selected: null, list: [], lastUpdated: Date.now() }, 'init');

let graphView = null;
let domTreeView = null;
let autoExpandTriggered = false;
let unsubscribeBus = null;
let containerOpsManager = null;
let containerOpsSyncRef = () => {};
let lastSessionWarningTs = 0;
const hoverState = {
  domPath: null,
  containerId: null,
};

const { backend, desktop, publishWindowCommand, debugLog } = createBackendBridge({
  bus,
  logger,
  debug: DEBUG,
});
let setSelectedSessionRef = () => {};
let loadContainerSnapshotRef = () => {};
const dataLoaders = createDataLoaders({
  state,
  ui,
  invokeAction,
  showMessage,
  debugLog,
  setLoading,
  setSelectedSession: (...args) => setSelectedSessionRef?.(...args),
  loadContainerSnapshot: (...args) => loadContainerSnapshotRef?.(...args),
  ensureAutoRefreshTimer,
  uiStateService,
});
const { loadBrowserStatus, loadSessions, loadLogs } = dataLoaders;
const { loadContainerSnapshot, applyContainerSnapshotData } = createSnapshotManager({
  state,
  ui,
  domSnapshotOptions: DOM_SNAPSHOT_OPTIONS,
  invokeAction,
  debugLog,
  showMessage,
  setLoading,
  annotateDomTreeWithMatches,
  findAllDomPathsForContainer,
  resetDomVisibility,
  ensureContainerDomMapping,
  scheduleAutoExpand,
  syncContainerOpsEditor: (...args) => containerOpsSyncRef(...args),
  ensureAutoRefreshTimer,
  resolveCurrentPageUrl,
  onSnapshotApplied: () => {
    renderContainers();
    updateSessionCaptureButtons();
    updateDomCaptureButtons();
  },
  onSnapshotCleared: () => {
    renderContainers();
    updateSessionCaptureButtons();
    updateDomCaptureButtons();
  },
  resetAutoExpandTrigger: resetAutoExpandFlag,
  uiStateService,
});
loadContainerSnapshotRef = loadContainerSnapshot;
containerOpsManager = createContainerOpsManager({
  state,
  ui,
  findContainerNode,
  getContainerAlias,
  getContainerOperationsFromNode,
  showMessage,
  invokeAction,
  resolveCurrentPageUrl,
  applyContainerSnapshotData,
  defaultHighlightStyle: DEFAULT_HIGHLIGHT_STYLE,
  defaultHighlightDuration: DEFAULT_HIGHLIGHT_DURATION,
});
containerOpsSyncRef = (...args) => containerOpsManager?.syncEditor?.(...args);
const {
  syncEditor: syncContainerOpsEditor,
  renderPanel: renderContainerOperationsPanel,
  handleEditorInput: containerOpsHandleInput,
  addTemplate: containerOpsAddTemplate,
  resetTemplate: containerOpsResetTemplate,
  saveOperations: containerOpsSave,
} = containerOpsManager;
function handleContainerOpsInput(...args) {
  return containerOpsHandleInput?.(...args);
}
function handleContainerOpsAddTemplate(kind) {
  return containerOpsAddTemplate?.(kind);
}
function handleContainerOpsReset() {
  return containerOpsResetTemplate?.();
}
async function handleContainerOpsSave() {
  return containerOpsSave?.();
}
const sessionPanel = createSessionPanel({
  state,
  ui,
  showMessage,
  invokeAction,
  loadContainerSnapshot,
  ensureAutoRefreshTimer,
  renderContainers,
  queueFitWindow,
  refreshSessions: () => loadSessions({ silent: false }),
  uiStateService,
});
const {
  renderBrowserPanel,
  renderSessions,
  renderLogsPanel,
  setSelectedSession,
  updateSessionCaptureButtons,
} = sessionPanel;
setSelectedSessionRef = setSelectedSession;
dataLoaders.attachRenderers({
  renderBrowserPanel,
  renderSessions,
  renderLogs: renderLogsPanel,
});
let domActionsManager = null;
domActionsManager = createDomActionsManager({
  state,
  ui,
  showMessage,
  invokeAction,
  applyContainerSnapshotData,
  renderContainers,
  getSelectedDomNode,
  getRootContainerId,
  getContainerAlias,
  findContainerNode,
  findNearestContainerIdForDom,
  buildDomNodeSelectors,
  buildChildContainerId,
  deriveDomAlias,
  getDomNodeSelector,
  formatDomNodeLabel,
  triggerHighlight,
  resolveCurrentPageUrl,
  remapContainerToDom,
  onHighlightCleared: () => resetPersistentHighlight(),
  uiStateService,
});
const {
  renderPanel: renderDomActionPanel,
  updateCaptureButtons: updateDomCaptureButtons,
  handleContainerChange: handleDomActionContainerChange,
  handleAliasInputChange,
  handleHighlightToggle: handleHighlightHoldToggle,
  highlightSelectedDom: highlightSelectedDomInternal,
  clearHighlight: clearHighlightInternal,
  handleReplace: handleDomActionReplace,
  handleCreate: handleDomActionCreate,
  handleSaveAlias: handleDomActionSaveAlias,
  handleHighlightResult,
  setHighlightFeedback,
} = domActionsManager;

const highlightSelectedDomNode = () => highlightSelectedDomInternal();

const clearHighlightOverlays = () => clearHighlightInternal();
if (DEBUG) {
  debugLog('init config', config);
  debugLog('backendAPI available:', Boolean(backend), 'desktopAPI available:', Boolean(desktop));
}

async function init() {
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
  bindCoreEvents(ui, {
    onRefreshBrowser: () => loadBrowserStatus(),
    onRefreshSessions: () => loadSessions(),
    onRefreshLogs: () => loadLogs(),
    onToggleLinkMode: () => toggleLinkMode(),
    onClearLogs: () => {
      state.logs = [];
      renderLogsPanel();
    },
    onRefreshContainers: () => loadContainerSnapshot(),
    onCreateSession: (event) => sessionPanel.handleCreateSessionSubmit(event),
    onOpenInspector: () => openInspectorView(),
    onDomReplace: () => handleDomActionReplace(),
    onDomCreate: () => handleDomActionCreate(),
    onDomHighlight: () => highlightSelectedDomNode(),
    onDomClearHighlight: () => clearHighlightOverlays(),
    onDomPick: () => startDomPicker(),
    onDomSaveAlias: () => handleDomActionSaveAlias(),
    onHighlightHoldToggle: () => handleHighlightHoldToggle(),
    onDomActionContainerChange: () => handleDomActionContainerChange(),
    onAliasInputChange: () => handleAliasInputChange(),
    onContainerOpsInput: () => handleContainerOpsInput(),
    onContainerOpsSave: () => handleContainerOpsSave(),
    onContainerOpsReset: () => handleContainerOpsReset(),
    onContainerOpsAddHighlight: () => handleContainerOpsAddTemplate('highlight'),
    onContainerOpsAddExtract: () => handleContainerOpsAddTemplate('extract-links'),
    onToolTabDom: () => setActiveToolPanel('dom'),
    onToolTabContainer: () => setActiveToolPanel('container'),
  });
  window.addEventListener('keydown', handleGlobalKeydown);
  if (typeof unsubscribeBus === 'function') {
    unsubscribeBus();
  }
  unsubscribeBus = registerRendererBus(bus, {
    onWindowError: (payload = {}) => {
      const message = payload?.message || payload?.error || '窗口操作失败';
      showMessage(message, 'error');
    },
    onGraphDomExpand: (payload = {}) => {
      const targetPath = payload?.path || payload?.domPath;
      if (targetPath) {
        ensureDomNodeExpanded(targetPath).catch((err) => {
          if (DEBUG) {
            console.warn('[ui] ensureDomNodeExpanded failed', targetPath, err?.message || err);
          }
        });
      }
    },
    onGraphDomHover: (payload = {}) => {
      handleDomHover(payload?.path ?? payload?.domPath ?? null);
    },
    onGraphContainerHover: (payload = {}) => {
      const targetId = payload?.containerId || payload?.id || payload?.container_id || null;
      handleContainerHover(targetId);
    },
    onTestPing: () => {
      bus.publish('ui.test.pong', { ts: Date.now(), ok: true });
    },
    onGraphReportRequest: () => publishGraphReport('request'),
    onHighlightResult: (payload = {}) => handleHighlightResult(payload),
    onSimulateAction: (payload = {}) => simulateUiAction(payload),
  });
  updateLinkModeUI();
  subscribeDesktopState({ desktop, state, ui, queueFitWindow, updateHeadlessButton, uiStateService });
  bus.publish('ui.window.requestState');
  setupAutoFit();
  setupGraphView();
  setupDomTreeView();
  setActiveToolPanel(state.uiPanels.activeTool);
  updateSessionCaptureButtons();
  updateDomCaptureButtons();
  const operationsPromise = loadOperations();
  await refreshAll();
  await operationsPromise;
  ensureAutoRefreshTimer(true);
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
    onHoverDom: (domPath) => handleDomHover(domPath),
    onHoverContainer: (containerId) => handleContainerHover(containerId),
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
    onHoverNode: (path) => handleDomHover(path),
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

function setActiveToolPanel(name = 'dom') {
  const target = name === 'container' ? 'container' : 'dom';
  state.uiPanels.activeTool = target;
  ui.toolTabDom?.classList.toggle('is-active', target === 'dom');
  ui.toolTabContainer?.classList.toggle('is-active', target === 'container');
  ui.domToolPanel?.classList.toggle('is-active', target === 'dom');
  ui.containerToolPanel?.classList.toggle('is-active', target === 'container');
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
  const parallelTasks = [loadBrowserStatus(), loadLogs()];
  const ready = await ensureInitialSessionSnapshot();
  await Promise.allSettled(parallelTasks);
  if (!ready) {
    debugLog('refreshAll session state', {
      selected: state.selectedSession,
      sessionCount: (state.sessions || []).length,
      status: 'pending',
    });
  }
  renderContainers();
  queueFitWindow();
}

function extractSessionProfileId(session) {
  if (!session) return null;
  return (
    session.profileId ||
    session.profile_id ||
    session.session_id ||
    session.sessionId ||
    session.profile ||
    null
  );
}

async function ensureInitialSessionSnapshot() {
  for (let attempt = 0; attempt < INITIAL_SESSION_RETRIES; attempt += 1) {
    await loadSessions({ skipSnapshot: true, silent: attempt > 0 });
    if (!state.selectedSession && Array.isArray(state.sessions) && state.sessions.length) {
      const candidate = extractSessionProfileId(state.sessions[0]);
      if (candidate) {
        setSelectedSessionRef?.(candidate);
        state.selectedSession = candidate;
      }
    }
    debugLog('ensureInitialSessionSnapshot', {
      attempt,
      selected: state.selectedSession,
      sessionCount: (state.sessions || []).length,
    });
    if (window?.floatingConfig?.debug) {
      console.log('[floating-ui] ensureInitialSessionSnapshot', {
        attempt,
        selected: state.selectedSession,
        sessionCount: (state.sessions || []).length,
      });
    }
    if (state.selectedSession) {
      await loadContainerSnapshot();
      return true;
    }
    if (attempt < INITIAL_SESSION_RETRIES - 1) {
      const delay = INITIAL_SESSION_RETRY_DELAY_MS * Math.pow(1.4, attempt);
      await sleep(delay);
    }
  }
  return false;
}

function handleGlobalKeydown(event) {
  if (!event) return;
  if (event.key === 'Escape' && isDomPickerActive()) {
    event.preventDefault();
    cancelDomPickerSession({ silent: true, reason: 'escape' });
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
    domNodes = domNodes.filter((node) => {
      const ids = Array.isArray(node.containerIds) && node.containerIds.length ? node.containerIds : node.containerId ? [node.containerId] : [];
      if (!ids.length) return true;
      return ids.some((id) => belongsToRoot(id));
    });
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
  renderDomActionPanel();
  renderContainerOperationsPanel();
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

function getSelectedDomNode() {
  if (!state.selectedDomPath) return null;
  const domTree = getDomTree(state.domTreeStore);
  if (!domTree) return null;
  return findDomNodeByPath(domTree, state.selectedDomPath) || null;
}

function buildChildContainerId(parentId, domNode) {
  const slugSource = domNode?.id || domNode?.classes?.[0] || domNode?.tag || 'section';
  const slug = (slugSource || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'section';
  return parentId ? `${parentId}.${slug}` : slug;
}

function deriveDomAlias(domNode) {
  if (!domNode) return '';
  if (domNode.id) return domNode.id;
  if (domNode.classes?.length) return domNode.classes[0];
  return (domNode.tag || 'section').toLowerCase();
}

function getParentPathFromString(path) {
  if (!path) return null;
  const tokens = normalizeDomPathString(path)
    .split('/')
    .filter((token) => token.length);
  if (tokens.length <= 1) {
    return null;
  }
  return tokens.slice(0, -1).join('/');
}

function applyDomPickerResult(path, pickerData = {}) {
  if (!path) return null;
  const node = ensureDomPathExists(state.domTreeStore, path);
  if (!node) return null;
  if (pickerData.tag) {
    node.tag = pickerData.tag;
  }
  if (Object.prototype.hasOwnProperty.call(pickerData, 'id')) {
    node.id = pickerData.id || null;
  }
  if (Array.isArray(pickerData.classes)) {
    node.classes = [...pickerData.classes];
  }
  if (pickerData.selector) {
    node.selector = pickerData.selector;
  }
  if (pickerData.text) {
    node.textSnippet = pickerData.text;
  }
  if (pickerData.bounding_rect) {
    node.boundingRect = pickerData.bounding_rect;
  }
  if (typeof node.childCount !== 'number') {
    node.childCount = 0;
  }
  if (!Array.isArray(node.containers)) {
    node.containers = [];
  }
  syncGraphNodeWithDomNode(path, node);
  return node;
}

function syncGraphNodeWithDomNode(path, domNode) {
  if (!state?.graphStore) return null;
  const existing = state.graphStore.domNodes.get(path) || {};
  const parentPath =
    existing.parentPath || getParentPathFromString(path) || null;
  const parentDepth = parentPath
    ? state.graphStore.domNodes.get(parentPath)?.depth || 0
    : 0;
  const merged = {
    ...existing,
    path,
    tag: domNode?.tag || existing.tag,
    id: domNode?.id ?? existing.id ?? null,
    classes: Array.isArray(domNode?.classes)
      ? [...domNode.classes]
      : existing.classes || [],
    selector: domNode?.selector || existing.selector || null,
    parentPath,
    depth: typeof existing.depth === 'number' ? existing.depth : parentDepth + 1,
    childCount:
      typeof domNode?.childCount === 'number'
        ? domNode.childCount
        : existing.childCount || 0,
    containers: domNode?.containers || existing.containers || [],
    loading: Boolean(existing.loading),
  };
  state.graphStore.domNodes.set(path, merged);
  if (!state.graphStore.domChildren.has(path)) {
    state.graphStore.domChildren.set(path, new Set());
  }
  if (merged.parentPath) {
    if (!state.graphStore.domChildren.has(merged.parentPath)) {
      state.graphStore.domChildren.set(merged.parentPath, new Set());
    }
    state.graphStore.domChildren.get(merged.parentPath)?.add(path);
  }
  return merged;
}

function buildDomNodeSelectors(node) {
  if (!node) return [];
  const selectors = [];
  const seen = new Set();
  const push = (css, variant, score) => {
    if (!css || seen.has(css)) return;
    seen.add(css);
    selectors.push({ css, variant, score });
  };
  if (node.selector) push(node.selector, 'primary', 1);
  if (node.id) push(`#${node.id}`, 'id', 0.95);
  if (node.classes?.length) {
    const classSelector = `${(node.tag || 'div').toLowerCase()}.${node.classes.join('.')}`;
    push(classSelector, 'structure', 0.85);
  }
  if (node.tag) push(node.tag.toLowerCase(), 'tag', 0.5);
  return selectors;
}

function deriveDomNodePrimarySelector(node) {
  const selectors = buildDomNodeSelectors(node);
  if (!selectors.length) return null;
  return selectors[0].css || null;
}

function findNearestContainerIdForDom(path) {
  if (!path) return getRootContainerId();
  let current = path;
  const domTree = getDomTree(state.domTreeStore);
  while (current) {
    const node = findDomNodeByPath(domTree, current);
    if (node?.containers?.length) {
      const best = pickBestContainerId(node.containers);
      if (best) return best;
    }
    current = getDomParentPath(current);
  }
  return getRootContainerId();
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

async function ensureDomNodeExpanded(path) {
  if (!path) return;
  if (!isPathExpanded(state.domTreeStore, path)) {
    const ready = await waitForSessionReady();
    if (!ready) {
      bus.publish('ui.graph.domExpandFailed', { path, error: 'session-missing' });
      return;
    }
    await toggleDomNodeExpand(path);
    return;
  }
  const childCount = getDomChildren(state.graphStore, path).length;
  bus.publish('ui.graph.domExpanded', { path, childCount });
}

async function waitForSessionReady(timeoutMs = 15000) {
  if (state.selectedSession) {
    return true;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.selectedSession) {
      return true;
    }
    await sleep(200);
  }
  return Boolean(state.selectedSession);
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
    ...DOM_BRANCH_OPTIONS,
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
  syncContainerOpsEditor(null, { force: true });
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
    triggerHighlight(selector, {
      channel: 'container-select',
      sticky: false,
      duration: DEFAULT_HIGHLIGHT_DURATION,
      feedback: false,
      clearBefore: false,
    });
  }
  if (state.linkMode.active) {
    state.linkMode.containerId = containerId;
    updateLinkModeUI();
  }
  graphView?.setSelection({ containerId: state.selectedContainerId, domPath: state.selectedDomPath });
  renderTreeDetails();
  renderDomActionPanel();
  syncContainerOpsEditor(state.selectedContainerId);
  queueFitWindow();
  ensureContainerDomMapping(containerId);
}

function handleDomSelection(domPath) {
  const domTree = getDomTree(state.domTreeStore);
  if (!domPath || !domTree) return;
  state.selectedDomPath = domPath;
  const node = findDomNodeByPath(domTree, domPath);
  if (node?.containers?.length) {
    const best = pickBestContainerId(node.containers);
    if (best) {
      state.selectedContainerId = best;
    }
  } else {
    const fallback = findNearestContainerIdForDom(domPath);
    if (fallback) {
      state.selectedContainerId = fallback;
    }
  }
  if (state.linkMode.active && state.linkMode.containerId && !state.linkMode.busy) {
    remapContainerToDom(state.linkMode.containerId, domPath, node);
    return;
  }
  const selector = getDomNodeSelector(node);
  if (selector) {
    triggerHighlight(selector, {
      channel: 'dom-selection',
      sticky: true,
      duration: 0,
      clearBefore: true,
      remember: true,
    });
  }
  graphView?.setSelection({ containerId: state.selectedContainerId, domPath: state.selectedDomPath });
  renderTreeDetails();
  renderDomActionPanel();
  syncContainerOpsEditor(state.selectedContainerId);
  queueFitWindow();
}

function ensureActiveSession() {
  if (state.selectedSession) return true;
  const candidate = Array.isArray(state.sessions) && state.sessions.length ? extractSessionProfileId(state.sessions[0]) : null;
  if (candidate) {
    setSelectedSessionRef?.(candidate);
    state.selectedSession = candidate;
    return true;
  }
  const now = Date.now();
  if (now - lastSessionWarningTs > 4000) {
    lastSessionWarningTs = now;
    showMessage('请选择会话后再操作 DOM 高亮', 'warn');
  }
  return false;
}

function clearHoverChannel(channelKey) {
  if (!channelKey || typeof clearHighlightInternal !== 'function') {
    return;
  }
  try {
    const result = clearHighlightInternal({ silent: true, channel: channelKey });
    if (result?.catch) {
      result.catch((err) => {
        if (DEBUG) {
          console.warn('[ui] hover clear failed', channelKey, err?.message || err);
        }
      });
    }
  } catch (err) {
    if (DEBUG) {
      console.warn('[ui] hover clear threw', channelKey, err?.message || err);
    }
  }
}

function handleDomHover(domPath) {
  const normalizedPath = domPath || null;
  if (!normalizedPath) {
    if (hoverState.domPath) {
      hoverState.domPath = null;
      clearHoverChannel(HOVER_DOM_CHANNEL);
      try {
        bus.publish('ui.graph.domHover', { path: null });
      } catch {
        /* noop */
      }
      uiStateService.updateHover({ domPath: null, lastUpdated: Date.now() }, 'hover-dom');
    }
    return;
  }
  if (!state.selectedSession && !ensureActiveSession()) {
    return;
  }
  if (hoverState.domPath === normalizedPath) {
    return;
  }
  const domTree = getDomTree(state.domTreeStore);
  if (!domTree) {
    return;
  }
  const node = findDomNodeByPath(domTree, normalizedPath);
  if (!node) {
    return;
  }
  const selector = getDomNodeSelector(node);
  if (!selector) {
    hoverState.domPath = null;
    clearHoverChannel(HOVER_DOM_CHANNEL);
    try {
      bus.publish('ui.graph.domHover', { path: null });
    } catch {
      /* noop */
    }
    uiStateService.updateHover({ domPath: null, lastUpdated: Date.now() }, 'hover-dom');
    return;
  }
  hoverState.domPath = normalizedPath;
  triggerHighlight(selector, {
    channel: HOVER_DOM_CHANNEL,
    style: HOVER_DOM_STYLE,
    sticky: true,
    duration: 0,
    feedback: false,
    remember: false,
    clearBefore: false,
    delayMs: 0,
  });
  try {
    bus.publish('ui.graph.domHover', { path: normalizedPath, selector });
  } catch {
    /* noop */
  }
  uiStateService.updateHover({ domPath: normalizedPath, lastUpdated: Date.now() }, 'hover-dom');
}

function handleContainerHover(containerId) {
  const normalizedId = containerId || null;
  if (!normalizedId) {
    if (hoverState.containerId) {
      hoverState.containerId = null;
      clearHoverChannel(HOVER_CONTAINER_CHANNEL);
      try {
        bus.publish('ui.graph.containerHover', { containerId: null });
      } catch {
        /* noop */
      }
      uiStateService.updateHover({ containerId: null, lastUpdated: Date.now() }, 'hover-container');
    }
    return;
  }
  if (!state.selectedSession && !ensureActiveSession()) {
    return;
  }
  if (hoverState.containerId === normalizedId) {
    return;
  }
  const selector = getContainerSelector(normalizedId, state.containerSnapshot?.container_tree);
  if (!selector) {
    hoverState.containerId = null;
    clearHoverChannel(HOVER_CONTAINER_CHANNEL);
    try {
      bus.publish('ui.graph.containerHover', { containerId: null });
    } catch {
      /* noop */
    }
    uiStateService.updateHover({ containerId: null, lastUpdated: Date.now() }, 'hover-container');
    return;
  }
  hoverState.containerId = normalizedId;
  triggerHighlight(selector, {
    channel: HOVER_CONTAINER_CHANNEL,
    style: HOVER_CONTAINER_STYLE,
    sticky: true,
    duration: 0,
    feedback: false,
    remember: false,
    clearBefore: false,
    delayMs: 0,
  });
  try {
    bus.publish('ui.graph.containerHover', { containerId: normalizedId, selector });
  } catch {
    /* noop */
  }
  uiStateService.updateHover({ containerId: normalizedId, lastUpdated: Date.now() }, 'hover-container');
}

function resolveSimulateElement(payload = {}) {
  const elementId = payload.elementId || payload.targetId || null;
  if (elementId) {
    const target = document.getElementById(elementId);
    if (target) return target;
  }
  const selector = payload.selector || payload.querySelector;
  if (selector) {
    const target = document.querySelector(selector);
    if (target) return target;
  }
  const controlId = payload.controlId || payload.target;
  if (controlId) {
    const target = document.querySelector(`[data-control-id="${controlId}"]`);
    if (target) return target;
  }
  return null;
}

function reportSimulateResult({ success, requestId, error }) {
  bus.publish('ui.simulate.result', {
    requestId,
    success,
    error: success ? null : error || 'unknown error',
    ts: Date.now(),
  });
}

function simulateUiAction(payload = {}) {
  const requestId = payload.requestId || payload.id || null;
  const element = resolveSimulateElement(payload);
  if (!element) {
    reportSimulateResult({ success: false, requestId, error: 'element not found' });
    return;
  }
  const type = (payload.type || 'click').toLowerCase();
  const commonInit = { bubbles: true, cancelable: true, composed: true, ...(payload.eventInit || {}) };
  try {
    switch (type) {
      case 'click':
      case 'dblclick':
      case 'contextmenu':
      case 'mousedown':
      case 'mouseup': {
        const event = new MouseEvent(type, {
          clientX: payload.clientX ?? 0,
          clientY: payload.clientY ?? 0,
          ...commonInit,
        });
        element.dispatchEvent(event);
        if (type === 'click') {
          element.click?.();
        }
        break;
      }
      case 'input': {
        if (payload.value !== undefined && 'value' in element) {
          element.value = payload.value;
        }
        element.dispatchEvent(new Event('input', commonInit));
        break;
      }
      case 'change': {
        if (payload.value !== undefined && 'value' in element) {
          element.value = payload.value;
        }
        element.dispatchEvent(new Event('change', commonInit));
        break;
      }
      case 'focus': {
        element.focus?.();
        break;
      }
      case 'blur': {
        element.blur?.();
        break;
      }
      case 'keydown':
      case 'keyup':
      case 'keypress': {
        const event = new KeyboardEvent(type, {
          key: payload.key || '',
          code: payload.code || '',
          ...commonInit,
        });
        element.dispatchEvent(event);
        break;
      }
      default: {
        const event = new Event(type, commonInit);
        element.dispatchEvent(event);
        break;
      }
    }
    reportSimulateResult({ success: true, requestId });
  } catch (err) {
    reportSimulateResult({
      success: false,
      requestId,
      error: err?.message || String(err),
    });
  }
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

function ensureAutoRefreshTimer(force = false) {
  if (!AUTO_REFRESH_INTERVAL_MS) {
    stopAutoRefreshTimer();
    return;
  }
  if (state.autoRefreshTimer && !force) {
    return;
  }
  stopAutoRefreshTimer();
  state.autoRefreshTimer = setInterval(() => {
    attemptAutoRefreshSnapshot().catch((err) => debugLog('auto refresh failed', err?.message || err));
  }, AUTO_REFRESH_INTERVAL_MS);
}

function stopAutoRefreshTimer() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
}

async function attemptAutoRefreshSnapshot() {
  if (state.loading.containers || state.autoRefreshBusy) return;
  state.autoRefreshBusy = true;
  try {
    await loadSessions({ silent: true, skipSnapshot: true });
    if (!state.selectedSession) {
      return;
    }
    const meta = state.snapshotMeta || {};
    const now = Date.now();
    const currentUrl = resolveCurrentPageUrl();
    const urlChanged = Boolean(currentUrl && meta.url && currentUrl !== meta.url);
    const neverCaptured = !meta.capturedAt;
    const stale = now - (meta.capturedAt || 0) >= AUTO_REFRESH_MAX_AGE_MS;
    if (!urlChanged && !stale && !neverCaptured) {
      return;
    }
    debugLog('auto refresh snapshot triggered', { urlChanged, stale, neverCaptured });
    await loadContainerSnapshot(true);
  } catch (err) {
    debugLog('auto refresh snapshot failed', err?.message || err);
  } finally {
    state.autoRefreshBusy = false;
  }
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
      ...DOM_BRANCH_OPTIONS,
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

function resetAutoExpandFlag() {
  if (AUTO_EXPAND_PATHS.length) {
    autoExpandTriggered = false;
  }
}

function annotateDomTreeWithMatches(matchMap = {}) {
  const domTree = getDomTree(state.domTreeStore);
  if (!domTree || !matchMap || typeof matchMap !== 'object') return;
  Object.entries(matchMap).forEach(([containerId, payload]) => {
    if (!containerId || !payload) return;
    if (getContainerDepth(containerId) < 0) {
      return;
    }
    const nodes = payload.nodes || [];
    nodes.forEach((node) => {
      const rawPath = node?.dom_path || node?.path;
      if (!rawPath) return;
      const normalized = normalizeDomPathString(rawPath);
      const target = ensureDomPathExists(state.domTreeStore, normalized);
      if (!target) return;
      if (!Array.isArray(target.containers)) {
        target.containers = [];
      }
      const exists = target.containers.some(
        (entry) =>
          entry?.container_id === containerId ||
          entry?.container_name === containerId ||
          entry?.containerId === containerId,
      );
      if (!exists) {
        target.containers.push({
          container_id: containerId,
          container_name: payload?.container?.name || payload?.container?.id || containerId,
          selector: node?.selector || null,
        });
      }
    });
  });
}

function getDomParentPath(path) {
  if (!path) return null;
  const entry = getDomNode(state.graphStore, path);
  return entry?.parentPath || null;
}

function shouldDisplayDomNode(node) {
  if (!node) return false;
  if (node.containerId) return true;
  if (Array.isArray(node.containerIds) && node.containerIds.length) return true;
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
  const linkCountByContainer = new Map();
  (graphData.links || []).forEach((link) => {
    if (!link?.from) return;
    linkCountByContainer.set(link.from, (linkCountByContainer.get(link.from) || 0) + 1);
  });
  const visibleDomByContainer = new Map();
  (graphData.domNodes || []).forEach((node) => {
    const idList =
      Array.isArray(node.containerIds) && node.containerIds.length
        ? node.containerIds
        : node.containerId
          ? [node.containerId]
          : [];
    if (!idList.length) return;
    const isVisible = visibilityMap.get(node.path) || false;
    idList.forEach((containerId) => {
      if (!visibleDomByContainer.has(containerId)) {
        visibleDomByContainer.set(containerId, 0);
      }
      if (isVisible) {
        visibleDomByContainer.set(containerId, (visibleDomByContainer.get(containerId) || 0) + 1);
      }
    });
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
      containerIds: Array.isArray(node.containerIds) ? node.containerIds : node.containerId ? [node.containerId] : [],
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
    containerCoverage: buildContainerCoverage(graphData, linkCountByContainer, visibleDomByContainer),
  };
}

function buildContainerCoverage(graphData, linkCountByContainer, visibleDomByContainer) {
  const stats = (graphData.containerRows || [])
    .map((row) => {
      const containerId = getContainerId(row?.container);
      if (!containerId) return null;
      const matchCount = Number(row?.container?.match?.match_count || 0);
      const linkCount = linkCountByContainer.get(containerId) || 0;
      const visibleDomNodes = visibleDomByContainer.get(containerId) || 0;
      return {
        containerId,
        matchCount,
        linkCount,
        visibleDomNodes,
        missingDom: matchCount > 0 && visibleDomNodes === 0,
      };
    })
    .filter(Boolean);
  const missing = stats.filter((entry) => entry.missingDom).map((entry) => entry.containerId);
  return {
    total: stats.length,
    missing,
    stats,
  };
}

function publishGraphReport(reason = 'manual') {
  const payload = buildGraphReportPayload();
  handleCoverageDiagnostics(payload.containerCoverage);
  bus.publish('ui.graph.report', { ...payload, reason });
}

function handleCoverageDiagnostics(coverage = {}) {
  const missing = Array.isArray(coverage?.missing) ? coverage.missing : [];
  const key = missing.slice().sort().join('|');
  if (key === state.coverage.lastMissingKey) {
    return;
  }
  state.coverage.lastMissingKey = key;
  if (missing.length) {
    showMessage(`以下容器缺少 DOM 连接：${missing.join(', ')}`, 'warn');
  }
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

function getContainerDepth(containerId) {
  if (!containerId || !state.containerSnapshot?.container_tree) return -1;
  if (!state.containerDepthCache) {
    state.containerDepthCache = new Map();
  }
  if (state.containerDepthCache.has(containerId)) {
    return state.containerDepthCache.get(containerId);
  }
  const depth = computeContainerDepth(state.containerSnapshot.container_tree, containerId, 0);
  state.containerDepthCache.set(containerId, depth);
  return depth;
}

function computeContainerDepth(node, targetId, depth) {
  if (!node) return -1;
  if (node.id === targetId || node.container_id === targetId) {
    return depth;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = computeContainerDepth(child, targetId, depth + 1);
      if (result !== -1) {
        return result;
      }
    }
  }
  return -1;
}

function pickBestContainerId(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return null;
  let bestId = null;
  let bestDepth = -1;
  entries.forEach((entry) => {
    const candidate = entry?.container_id || entry?.container_name || entry?.containerId;
    if (!candidate) return;
    const depth = getContainerDepth(candidate);
    if (depth < 0) return;
    if (depth > bestDepth) {
      bestDepth = depth;
      bestId = candidate;
    }
  });
  if (!bestId) {
    const rootId = getRootContainerId();
    const rootMatch = entries.find((entry) => {
      const candidate = entry?.container_id || entry?.container_name || entry?.containerId;
      return candidate === rootId;
    });
    return rootMatch ? rootId : null;
  }
  return bestId;
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
  const inferredSelector = deriveDomNodePrimarySelector(node);
  if (inferredSelector) {
    return inferredSelector;
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

function getContainerOperationsFromNode(node) {
  if (!node) return [];
  if (Array.isArray(node.operations)) return node.operations;
  if (Array.isArray(node.definition?.operations)) return node.definition.operations;
  return [];
}

function ensureHighlightRuntime() {
  if (!state.highlightRuntime) {
    state.highlightRuntime = {
      channelQueues: new Map(),
      persistedSelector: null,
    };
  }
  if (!(state.highlightRuntime.channelQueues instanceof Map)) {
    state.highlightRuntime.channelQueues = new Map();
  }
  return state.highlightRuntime;
}

function rememberPersistentHighlight(selector) {
  const runtime = ensureHighlightRuntime();
  runtime.persistedSelector = selector || null;
}

function resetPersistentHighlight() {
  rememberPersistentHighlight(null);
}

function queueHighlightTask(channel, task) {
  const runtime = ensureHighlightRuntime();
  const key = channel || 'default';
  const current = runtime.channelQueues.get(key) || Promise.resolve();
  const next = current.catch(() => {}).then(() => task());
  runtime.channelQueues.set(key, next);
  return next;
}

function triggerHighlight(selector, options = {}) {
  if (!selector || !state.selectedSession) return;
  const url = resolveCurrentPageUrl();
  if (!url) {
    console.warn('[ui] highlight missing page url, continue with session only');
    showMessage('当前页面 URL 未上报，仍尝试高亮', 'warn');
  }
  const channel = options.channel || 'default';
  const sticky = typeof options.sticky === 'boolean' ? options.sticky : Boolean(state.highlightOptions?.sticky);
  const duration = typeof options.duration === 'number' ? options.duration : sticky ? 0 : DEFAULT_HIGHLIGHT_DURATION;
  const style = options.style || DEFAULT_HIGHLIGHT_STYLE;
  const delayMs = typeof options.delayMs === 'number' ? options.delayMs : 40;
  const feedback = options.feedback !== false;
  const remember = Boolean(options.remember);
  const clearBefore = Boolean(options.clearBefore);
  debugLog('triggerHighlight', { selector, session: state.selectedSession, url, sticky, channel });
  if (feedback) {
    setHighlightFeedback({ selector, status: 'pending', message: '正在高亮...', persistent: sticky });
  }
  bus.publish('ui.highlight.request', {
    selector,
    sessionId: state.selectedSession,
    url,
    sticky,
    channel,
    ts: Date.now(),
  });
  return queueHighlightTask(channel, async () => {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    if (clearBefore) {
      try {
        await clearHighlightInternal?.({ silent: true, channel });
      } catch (err) {
        console.warn('[ui] clear before highlight failed', err?.message || err);
      }
    }
    try {
      const result = await invokeAction('browser:highlight', {
        profile: state.selectedSession,
        selector,
        ...(url ? { url } : {}),
        rootSelector: getRootDomSelector(),
        options: {
          channel,
          style,
          duration,
          sticky,
          maxMatches: options.maxMatches,
        },
      });
      if (remember) {
        rememberPersistentHighlight(selector);
      }
      if (feedback) {
        const count = result?.data?.details?.count ?? result?.data?.count ?? result?.details?.count ?? result?.count;
        const message = count ? `已高亮 ${count} 个节点` : `已高亮 ${selector}`;
        setHighlightFeedback({ selector, status: 'success', message, persistent: sticky });
      }
      bus.publish('ui.highlight.result', {
        success: true,
        selector,
        channel,
        details: result?.data || result || null,
      });
    } catch (err) {
      console.warn('[ui] highlight failed', err?.message || err);
      if (feedback) {
        setHighlightFeedback({ selector, status: 'error', message: err?.message || '高亮指令发送失败' });
      }
      bus.publish('ui.highlight.result', {
        success: false,
        selector,
        channel,
        error: err?.message || String(err),
      });
      throw err;
    }
  });
}

function setDomPickerState(updates = {}) {
  const prev = state.domPicker || { status: 'idle', message: '', result: null, lastError: '' };
  const next = {
    status: updates.status ?? prev.status ?? 'idle',
    message: updates.message ?? prev.message ?? '',
    result: Object.prototype.hasOwnProperty.call(updates, 'result') ? updates.result : prev.result ?? null,
    lastError: updates.lastError ?? prev.lastError ?? '',
  };
  if (next.status === 'error' && !updates.lastError && updates.message) {
    next.lastError = updates.message;
  }
  state.domPicker = next;
  renderDomActionPanel();
  updateDomCaptureButtons();
  updateSessionCaptureButtons();
}

function isDomPickerActive() {
  return state.domPicker?.status === 'active';
}

async function startDomPicker() {
  if (isDomPickerActive()) {
    await cancelDomPickerSession({ silent: true, reason: 'restart' });
  }
  if (!state.selectedSession) {
    showMessage('请选择会话后再拾取 DOM 元素', 'warn');
    return;
  }
  const url = resolveCurrentPageUrl();
  if (!url) {
    showMessage('无法确定当前页面 URL', 'error');
    return;
  }
  setDomPickerState({ status: 'active', message: '请在页面中点击目标元素（Esc 取消）' });
  try {
    const result = await invokeAction('browser:pick-dom', {
      profile: state.selectedSession,
      url,
      rootSelector: getRootDomSelector(),
      timeout: 25000,
    });
    const data = result?.data || result;
    if (data?.cancelled) {
      showMessage('元素拾取已取消', 'warn');
      setDomPickerState({ status: 'idle', message: '' });
      return;
    }
    if (data?.timeout) {
      showMessage('元素拾取超时', 'warn');
      setDomPickerState({ status: 'idle', message: '' });
      return;
    }
    if (data?.dom_path) {
      const normalizedPath = normalizeDomPathString(data.dom_path);
      const pickerNode = applyDomPickerResult(normalizedPath, data);
      state.selectedDomPath = normalizedPath;
      domTreeView?.render();
      renderContainers();
      handleDomSelection(normalizedPath);
      await loadDomBranch(normalizedPath);
      bus.publish('ui.domPicker.selected', {
        path: normalizedPath,
        selector: pickerNode?.selector || data.selector || null,
      });
    } else if (data?.selector) {
      showMessage(`已获取 selector: ${data.selector}`, 'success');
    } else {
      showMessage('未返回 DOM 信息', 'warn');
    }
    setDomPickerState({ status: 'idle', message: '' });
  } catch (err) {
    const message = err?.message || '元素拾取失败';
    showMessage(message, 'error');
    setDomPickerState({ status: 'idle', message: '', lastError: message });
  }
}

async function cancelDomPickerSession(options = {}) {
  if (!state.selectedSession) {
    setDomPickerState({ status: 'idle', message: '' });
    return;
  }
  try {
    await invokeAction('browser:cancel-pick', { profile: state.selectedSession });
  } catch (err) {
    if (!options.silent) {
      console.warn('[ui] cancel pick failed', err?.message || err);
      showMessage(err?.message || '取消捕获失败', 'warn');
    }
  } finally {
    setDomPickerState({ status: 'idle', message: '' });
  }
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
