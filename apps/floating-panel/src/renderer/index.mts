let containerTree: any = null;// @ts-nocheck
let capturePanel: any = null;// NOTE: Temporarily disable TypeScript checks during refactoring integration
// Will be removed after complete TypeScript migration

import { setupOperationListDelegation } from './operation-interactions.mts';import { renderOperationsList, renderAddOperationPanel, buildDefaultOperations } from './operation-ui.mts';
import { renderOperationEditor } from './operation-helpers.ts';
import { isRootContainer } from './operation-types.ts';
import {
  initGraph,
  handlePickerResult,
  updatePageContext,
  applyMatchSnapshot,
} from './graph.mjs';
import { logger } from './logger.mts';
import { FLOATING_PANEL_VERSION } from './version.mts';
import { CapturePanel, ContainerTree, OperationDragHandler, injectUIStyles } from './ui-components.js';


// UI logging helper
const log = (...args: any[]) => {
  console.log('[ui-renderer]', ...args);
};

// Inject new UI styles
injectUIStyles();

const statusEl = document.getElementById('status-icon');
const dragArea = document.getElementById('drag-area');
const loadingIndicator = document.getElementById('loadingIndicator');

function setStatus(text: string, ok: boolean) {
  if (statusEl) {
    statusEl.title = text;
    if (ok) statusEl.classList.add('connected');
    else statusEl.classList.remove('connected');
  }
}

function setLoadingState(pending: number, detail?: Record<string, any>) {
  if (!loadingIndicator) return;
  if (pending > 0) {
    loadingIndicator.classList.add('active');
    loadingIndicator.textContent = `Loading (${pending})...`;
  } else {
    loadingIndicator.classList.remove('active');
  }
}

// 模拟 debugLog
function debugLog(module: string, action: string, data: any) {
  if ((window as any).api?.debugLog) {
    (window as any).api.debugLog(module, action, data).catch(() => {});
  }
}

let currentProfile: string | null = null;
let currentRootSelector: string | null = null;
let currentUrl: string | null = null;
let currentContainer: any | null = null;

const containerDetailsEl = document.getElementById('containerDetailsContent');
const splitterHandle = document.getElementById('splitterHandle');
const bottomPanel = document.getElementById('bottom-panel');
const graphPanel = document.getElementById('graphPanel');
let isResizing = false;
let startY = 0;
let startBottomHeight = 0;

function renderContainerDetails(container: any | null) {
  if (!containerDetailsEl) return;

  if (!container) {
    containerDetailsEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:#666;font-size:10px;">
        Select a container in the graph
      </div>
    `;
    return;
  }

  const id = container.id || container.name || 'unknown';
  const name = container.name || container.id || 'Unnamed';
  const type = container.type || 'container';
  const operations = Array.isArray(container.operations) ? container.operations : [];

  const matchNode = container.match && Array.isArray(container.match.nodes) && container.match.nodes.length
    ? container.match.nodes[0]
    : null;

  const domPath = matchNode?.dom_path || null;
  const selector = matchNode?.selector || null;
  const matchCount = container.match?.match_count ?? (matchNode ? 1 : 0);
  const isRoot = isRootContainer(container);

  // 使用新的 operation UI 渲染函数
  const { html: operationsHtml, hasSuggested } = renderOperationsList({ isRoot: isRoot,
    containerId: id,
    operations: operations,
    primarySelector: selector,
    domPath: domPath,
    hasRawOperations: operations.length > 0
  });

  // 渲染 Meta Header 和 Grid
  const metaHtml = `
    <div style="padding:4px 8px;border-bottom:1px solid #3e3e3e;display:flex;justify-content:space-between;align-items:center;background:#2d2d2d;">
      <div>
        <span style="font-weight:600;color:#eee;">${name}</span>
        <span style="color:#666;font-family:monospace;margin-left:4px;font-size:10px;">#${id}</span>
      </div>
      <div style="font-size:9px;color:#555;">Match: ${matchCount}</div>
    </div>
    
    <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 8px;padding:4px 8px;font-size:10px;border-bottom:1px solid #3e3e3e;background:#252526;">
      <span style="color:#888;text-align:right;">Type:</span>
      <span style="color:#dcdcaa;font-family:monospace;">${type}</span>
      <span style="color:#888;text-align:right;">Path:</span>
      <span style="color:#dcdcaa;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;" title="${domPath || ''}">${domPath || '-'}</span>
      <span style="color:#888;text-align:right;">Selector:</span>
      <span style="color:#dcdcaa;font-family:monospace;grid-column:span 3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${selector || ''}">${selector || '-'}</span>
    </div>
  `;

  containerDetailsEl.innerHTML = `
    ${metaHtml}
    ${operationsHtml}
    ${renderAddOperationPanel(selector, domPath, isRoot)}
  `;

  // 为操作按钮绑定事件
  bindOperationEventListeners(id, operations, isRoot);
  // 为快速添加操作面板绑定事件
  bindAddOperationPanelEvents(id, selector, domPath);
}

// Helper functions for operation UI event binding

function bindOperationEventListeners(containerId: string, operations: any[], isRoot: boolean) {
  const listEl = containerDetailsEl?.querySelector('.op-list-wrapper');
  if (!listEl) return;
  
  setupOperationListDelegation(listEl as HTMLElement, operations, {
    isRoot,
    onUpdate: (newOps) => updateContainerOperations(containerId, newOps),
    onExecute: (op, index) => executeOperation(containerId, op, index)
  });
}

function bindAddOperationPanelEvents(containerId: string, primarySelector: string | null, domPath: string | null) {
  const addBtn = containerDetailsEl?.querySelector('#btnAddOp') as HTMLButtonElement;
  const triggerSelect = containerDetailsEl?.querySelector('#opTriggerSelect') as HTMLSelectElement;
  const typeSelect = containerDetailsEl?.querySelector('#opTypeSelect') as HTMLSelectElement;

  if (addBtn && triggerSelect && typeSelect) {
    addBtn.addEventListener('click', () => {
      const trigger = triggerSelect.value;
      const type = typeSelect.value;

      const newOp = {
        id: `${containerId}.${Date.now()}.${type}`,
        type: type,
        triggers: [trigger],
        enabled: true,
        config: {
          selector: primarySelector || undefined,
          dom_path: domPath || undefined
        }
      };

      const currentOps = Array.isArray(currentContainer?.operations) ? [...currentContainer.operations] : [];
      currentOps.push(newOp);
      updateContainerOperations(containerId, currentOps);
    });
  }
}

async function updateContainerOperations(containerId: string, operations: any[]) {
  if (!currentProfile || !currentUrl) {
    logger.warn('container-operations', 'Missing profile/url; skip update', {
      profile: currentProfile,
      url: currentUrl,
    });
    return;
  }
  try {
    const api = (window as any).api;
    if (!api?.invokeAction) {
      logger.warn('container-operations', 'invokeAction not available');
      return;
    }
    await api.invokeAction('containers:update-operations', {
      profile: currentProfile,
      url: currentUrl,
      containerId: containerId,
      operations: operations,
    });
    // Trigger graph refresh
    await api.invokeAction('containers:match', {
      profile: currentProfile,
      url: currentUrl,
      rootSelector: currentRootSelector || undefined,
    });
  } catch (err) {
    logger.error('container-operations', 'Failed to update operations', err);
  }
}

async function executeOperation(containerId: string, operation: any, index: number) {
  if (!currentProfile || !currentUrl) return;

  try {
    const api = (window as any).api;
    if (!api?.invokeAction) return;

    debugLog('floating-panel', 'executing-operation', {
      containerId,
      operationIndex: index,
      operationType: operation.type
    });

    const result = await api.invokeAction('operations:run', {
      profile: currentProfile,
      url: currentUrl,
      containerId: containerId,
      op: operation.type,
      config: operation.config || {},
      sessionId: currentProfile
    });

    if (result?.success) {
      log('Operation executed successfully');
    } else {
      log('Operation execution failed', result?.error);
    }
  } catch (err) {
    logger.error('operation-execute', 'Failed to execute operation', err);
  }
}

// Initialize UI components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Capture Panel
  const captureEl = document.getElementById('capture'); // If exists
  
  // Container Tree
  const treeEl = document.getElementById('containerTree'); // If exists
});


if (dragArea) {
  log('drag-area found, enabling drag');
}

window.addEventListener('webauto:graph-loading', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  const pending = Number(detail.pending || 0);
  setLoadingState(pending, detail);
}) as EventListener);

window.addEventListener('webauto:graph-status', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  const phase = detail.phase as string | undefined;

  if (phase === 'error') {
    setStatus('Error loading graph', false);
  } else if (phase === 'snapshot:ready' || phase === 'ready') {
    setStatus('Ready', true);
  }
}) as EventListener);

// 监听容器节点选中事件，更新“容器详情”面板。
window.addEventListener('webauto:container-selected', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  currentContainer = detail.container || null;
  renderContainerDetails(currentContainer);
}) as EventListener);

if (!(window as any).api) {
  log('fatal: window.api missing from preload');
} else {
  log('preload API available');

  // 监听总线连接状态
  if ((window as any).api.onBusStatus) {
    (window as any).api.onBusStatus((status: any) => {
      log('Bus status:', status);
      setStatus(status.connected ? 'Connected' : 'Disconnected', status.connected);
    });
  }

  window.api.onBusEvent(async (msg: any) => {
    if (msg.topic === "containers.matched") {
      log("收到 containers.matched 事件");
      const data = msg.payload;
      if (data && data.matched) {
        setStatus('Matched', true);
        const snapshot = data.snapshot;
        const profile = data.profileId;
        const url = data.url;
        const rootSelector = snapshot?.metadata?.root_selector || null;

        currentProfile = profile;
        currentRootSelector = rootSelector;
        currentUrl = url || currentUrl;

        await applyMatchSnapshot(snapshot, {
          profile,
          url,
          rootSelector,
        });

        // 每次刷新快照后，如当前选中容器不再存在，重置详情面板。
        if (!currentContainer) {
          renderContainerDetails(null);
        }
      }
    }

    if (msg.topic === 'ui.domPicker.result') {
      log('收到 ui.domPicker.result 事件');
      const data = msg.payload;
      if (data?.success && data?.domPath) {
        handlePickerResult(data.domPath, data.selector || null);
      }
    }
  });

  // 初始健康检查
  (async () => {
    try {
      const res = await (window.api as any).invokeAction('health', {});
      if (res.ok) {
        log('Health check OK');
      }
    } catch (e) {
      logger.error('health-check', 'Health check failed', e);
    }
  })();
}

const canvas = document.getElementById('graphPanel');
if (canvas) {
  initGraph(canvas);
}

if (splitterHandle && bottomPanel && graphPanel) {
  splitterHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    const rect = bottomPanel.getBoundingClientRect();
    startBottomHeight = rect.height;
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = e.clientY - startY;
    const newHeight = Math.min(
      window.innerHeight - 100,
      Math.max(100, startBottomHeight - delta)
    );
    bottomPanel.style.height = `${newHeight}px`;
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
    }
  });
}

// 绑定窗口控制按钮
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');
const btnPicker = document.getElementById('btnPicker');

if (btnMinimize) {
  btnMinimize.addEventListener('click', () => {
    if ((window as any).api?.minimize) {
      (window as any).api.minimize().catch(() => {});
    }
  });
}

if (btnPicker) {
  btnPicker.addEventListener('click', async () => {
    log('Picker button clicked');
    try {
      btnPicker.textContent = '...';
      btnPicker.style.background = '#e5b507';

      if (!currentProfile) {
        log('Error: No profile set.');
        btnPicker.textContent = '捕获元素';
        btnPicker.style.background = '';
        return;
      }

      const result = await (window.api as any).invokeAction('browser:pick-dom', {
        profile: currentProfile,
        rootSelector: currentRootSelector,
        timeout: 60000,
        mode: 'hover-select'
      });
      
      btnPicker.textContent = '捕获元素';
      btnPicker.style.background = '';

      if (result.success && result.data) {
        const { dom_path: domPath, selector } = result.data;
        if (domPath) {
          handlePickerResult(domPath, selector || null);
        }
      }
    } catch (err) {
      log('Picker failed:', err);
      btnPicker.textContent = '捕获元素';
      btnPicker.style.background = '';
    }
  });
}

if (btnClose) {
  btnClose.addEventListener('click', () => {
    if ((window as any).api?.close) {
      (window as any).api.close().catch(() => {});
    }
  });
}
