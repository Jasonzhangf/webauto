let containerTree: any = null;// @ts-nocheck
let capturePanel: any = null;// NOTE: Temporarily disable TypeScript checks during refactoring integration
// Will be removed after complete TypeScript migration

import { renderOperationsList, renderAddOperationPanel, buildDefaultOperations } from './operation-ui.mts';
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
import { CapturePanel, ContainerTree, OperationDragHandler } from './ui-components.js';


// UI logging helper
const log = (...args: any[]) => {
  console.log('[ui-renderer]', ...args);
};

const statusEl = document.getElementById('status');
const healthEl = document.getElementById('health');
const dragArea = document.getElementById('drag-area');
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingLabel = loadingIndicator?.querySelector('.loading-label') as HTMLElement | null;
const versionLabel = document.getElementById('versionLabel');

function setStatus(text: string, ok: boolean) {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = ok ? '#4CAF50' : '#f44336';
  }
  if (versionLabel) {
    versionLabel.textContent = `v${FLOATING_PANEL_VERSION}`;
  }
}

function setLoadingState(pending: number, detail?: Record<string, any>) {
  if (!loadingIndicator) return;
  if (pending > 0) {
    loadingIndicator.classList.add('active');
    if (loadingLabel) {
      const reason = typeof detail?.reason === 'string' ? detail.reason : '加载中';
      const friendly = reason.replace(/[_-]/g, ' ').trim() || '加载中';
      const suffix = pending > 1 ? ` (${pending})` : '';
      loadingLabel.textContent = `${friendly}${suffix}`;
    }
  } else {
    loadingIndicator.classList.remove('active');
    if (loadingLabel) {
      loadingLabel.textContent = '加载中...';
    }
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
const containerDetailsTab = document.querySelector('.tab[data-tab="containerDetails"]') as HTMLElement | null;

function renderContainerDetails(container: any | null) {
  if (!containerDetailsEl) return;

  if (!container) {
    containerDetailsEl.innerHTML =         `
    <div style="margin-bottom:6px;">
      <div style="font-size:12px;color:#fff;margin-bottom:2px;">
        ${name} <span style="color:#666;font-size:10px;">(${id})</span>
        ${isRoot ? '<span style="color:#fbbc05;font-size:10px;margin-left:6px;">[根容器]</span>' : ''}
      </div>
      <div style="font-size:10px;color:#999;margin-bottom:2px;">
        类型: <span style="color:#dcdcaa;">${type}</span>
        ${container.metadata?.isVirtual ? '<span style="margin-left:6px;color:#fbbc05;">[虚拟容器]</span>' : ''}
      </div>
      <div style="font-size:10px;color:#999;">
        能力: ${
          capabilities.length
            ? capabilities.map((c: string) => `<span style=\"margin-right:4px;color:#7ebd7e;\">${c}</span>`).join('')
            : '<span style="color:#555;">无</span>'
        }
      </div>
      <div style="margin-top:4px;font-size:10px;color:#999;display:flex;align-items:center;gap:4px;">
        <span>别名/显示名:</span>
        <input id="containerAliasInput" type="text" style="flex:1;min-width:0;font-size:10px;padding:2px 4px;border-radius:2px;border:1px solid #3e3e3e;background:#1e1e1e;color:#ccc;" />
        <button id="btnSaveAlias" style="font-size:10px;padding:2px 6px;">保存名称</button>
      </div>
    </div>
    <div style="margin-bottom:6px;font-size:10px;color:#999;">
      <div>匹配 DOM 路径: <span style="color:#9cdcfe;">${domPath || '未记录'}</span></div>
      <div>匹配 selector: <span style="color:#9cdcfe;">${selector || '未记录'}</span></div>
      <div>匹配计数: <span style="color:#9cdcfe;">${matchCount}</span></div>
    </div>
    <div style="margin-bottom:4px;font-size:11px;color:#ccc;font-weight:600;">Operation 列表（按触发事件分组）</div>
    <div id="containerOperationsList" style="margin-bottom:8px;">
      ${operationsHtml}
    </div>
    ${renderAddOperationPanel(selector, domPath)}
    <div style="margin-top:6px;font-size:10px;color:#666;">
      提示：当前 Operation 编辑会直接写入外置容器库（~/.webauto/container-lib）；演练按钮会在浏览器中实际执行操作。
    </div>
      `;

    return;
  }

  const id = container.id || container.name || 'unknown';
  const name = container.name || container.id || '未命名容器';
  const type = container.type || 'container';
  const capabilities = Array.isArray(container.capabilities) ? container.capabilities : [];
  const operations = Array.isArray(container.operations) ? container.operations : [];
  const alias =
    (container.metadata && (container.metadata.alias as string)) ||
    (container.alias as string) ||
    (container.nickname as string) ||
    '';

  const matchNode = container.match && Array.isArray(container.match.nodes) && container.match.nodes.length
    ? container.match.nodes[0]
    : null;

  const domPath = matchNode?.dom_path || null;
  const selector = matchNode?.selector || null;
  const matchCount = container.match?.match_count ?? (matchNode ? 1 : 0);
  const isRoot = isRootContainer(container);

  // 使用新的 operation UI 渲染函数
  const { html: operationsHtml, hasSuggested } = renderOperationsList({
    containerId: id,
    operations: operations,
    primarySelector: selector,
    domPath: domPath,
    hasRawOperations: operations.length > 0
  });



  containerDetailsEl.innerHTML = `
    <div style="margin-bottom:6px;">
      <div style="font-size:12px;color:#fff;margin-bottom:2px;">
        ${name} <span style="color:#666;font-size:10px;">(${id})</span>
      </div>
      <div style="font-size:10px;color:#999;margin-bottom:2px;">
        类型: <span style="color:#dcdcaa;">${type}</span>
        ${container.metadata?.isVirtual ? '<span style="margin-left:6px;color:#fbbc05;">[虚拟容器]</span>' : ''}
      </div>
      <div style="font-size:10px;color:#999;">
        能力: ${
          capabilities.length
            ? capabilities.map((c: string) => `<span style="margin-right:4px;color:#7ebd7e;">${c}</span>`).join('')
            : '<span style="color:#555;">无</span>'
        }
      </div>
      <div style="margin-top:4px;font-size:10px;color:#999;display:flex;align-items:center;gap:4px;">
        <span>别名/显示名:</span>
        <input id="containerAliasInput" type="text" style="flex:1;min-width:0;font-size:10px;padding:2px 4px;border-radius:2px;border:1px solid #3e3e3e;background:#1e1e1e;color:#ccc;" />
        <button id="btnSaveAlias" style="font-size:10px;padding:2px 6px;">保存名称</button>
      </div>
    </div>
    <div style="margin-bottom:6px;font-size:10px;color:#999;">
      <div>匹配 DOM 路径: <span style="color:#9cdcfe;">${domPath || '未记录'}</span></div>
      <div>匹配 selector: <span style="color:#9cdcfe;">${selector || '未记录'}</span></div>
      <div>匹配计数: <span style="color:#9cdcfe;">${matchCount}</span></div>
    </div>
    <div style="margin-bottom:4px;font-size:11px;color:#ccc;font-weight:600;">默认 Operation 列表（按顺序执行）</div>
    <div id="containerOperationsList">
      ${opsHtml}
    </div>
    <div style="margin-top:6px;font-size:10px;color:#999;">Operation 配置（JSON，可编辑）</div>
    <textarea
      id="containerOpsEditor"
      style="width:100%;height:120px;margin-top:2px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;border-radius:2px;font-family:Consolas,monospace;font-size:10px;padding:4px;resize:vertical;"
    ></textarea>
    <div style="margin-top:4px;display:flex;justify-content:flex-end;gap:6px;">
      <button id="btnSaveOps" style="font-size:10px;padding:2px 6px;">保存 Operation 列表</button>
    </div>
    <div style="margin-top:6px;font-size:10px;color:#666;">
      提示：当前 Operation 编辑会直接写入外置容器库（~/.webauto/container-lib）；演练按钮暂仅记录日志，不会实际执行操作。
    </div>
  `;

  const aliasInput = containerDetailsEl.querySelector('#containerAliasInput') as HTMLInputElement | null;
  if (aliasInput) {
    aliasInput.value = alias || name || id;
  }

  // 为操作按钮绑定事件
  bindOperationEventListeners(id, operations, isRoot);

  // 为快速添加操作面板绑定事件
  bindAddOperationPanelEvents(id, selector, domPath);

  // 如果有建议的操作，自动展开编辑器
  if (hasSuggested) {
    debugLog('floating-panel', 'suggested operations detected, showing editor', { containerId: id });
  // 初始化 Operation 拖拽处理器
  if (containerOperationsList) {
    const dragHandler = new OperationDragHandler(
      containerOperationsList,
      operations,
      async (newOperations: Operation[]) => {
        if (currentProfile && currentUrl) {
          try {
            const api = (window as any).api;
            if (!api?.invokeAction) {
              logger.warn("container-operations", "invokeAction not available");
              return;
            }
            await api.invokeAction("containers:update-operations", {
              profile: currentProfile,
              url: currentUrl,
              containerId: id,
              operations: newOperations,
            });
            await api.invokeAction("containers:match", {
              profile: currentProfile,
              url: currentUrl,
              rootSelector: currentRootSelector || undefined,
            });
          } catch (err) {
            logger.error("container-operations", "Failed to update operations order", err);
          }
        }
      }
    );
  }  }
}



// Helper functions for operation UI event binding

function bindOperationEventListeners(containerId: string, operations: any[], isRoot: boolean) {
  const listEl = containerDetailsEl?.querySelector('#containerOperationsList');
  if (!listEl) return;

  // 绑定演练按钮
  listEl.querySelectorAll('button[data-op-action="rehearse"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const indexAttr = (btn as HTMLElement).getAttribute('data-op-index');
      const index = typeof indexAttr === 'string' ? Number(indexAttr) : NaN;
      if (!Number.isFinite(index)) return;
      const op = operations[index];
      debugLog('floating-panel', 'op-rehearse-clicked', { containerId, opIndex: index, op });
      // 执行操作演练
      executeOperation(containerId, op, index);
    });
  });

  // 绑定编辑按钮
  listEl.querySelectorAll('button[data-op-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const indexAttr = (btn as HTMLElement).getAttribute('data-op-index');
      const index = typeof indexAttr === 'string' ? Number(indexAttr) : NaN;
      if (!Number.isFinite(index)) return;
      const op = operations[index];
      debugLog('floating-panel', 'op-edit-clicked', { containerId, opIndex: index, op });
      showOperationEditor(containerId, op, index, isRoot, operations);
    });
  });

  // 绑定删除按钮
  listEl.querySelectorAll('button[data-op-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const indexAttr = (btn as HTMLElement).getAttribute('data-op-index');
      const index = typeof indexAttr === 'string' ? Number(indexAttr) : NaN;
      if (!Number.isFinite(index)) return;
      const op = operations[index];
      debugLog('floating-panel', 'op-delete-clicked', { containerId, opIndex: index, op });
      const newOps = [...operations];
      newOps.splice(index, 1);
      updateContainerOperations(containerId, newOps);
    });
  });

  // 绑定启用/禁用按钮
  listEl.querySelectorAll('button[data-op-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const indexAttr = (btn as HTMLElement).getAttribute('data-op-index');
      const index = typeof indexAttr === 'string' ? Number(indexAttr) : NaN;
      if (!Number.isFinite(index)) return;
      const op = operations[index];
      if (op) {
        op.enabled = !op.enabled;
        debugLog('floating-panel', 'op-toggle-clicked', { containerId, opIndex: index, op, enabled: op.enabled });
        updateContainerOperations(containerId, operations);
      }
    });
  });
}

function showOperationEditor(containerId: string, op: any, index: number, isRoot: boolean, operations: any[]) {
  const editorHtml = renderOperationEditor(op, index, isRoot);
  const editorContainer = document.createElement('div');
  editorContainer.id = 'opEditorContainer';
  editorContainer.innerHTML = editorHtml;
  editorContainer.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10000;
    background: #2d2d2d;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 12px;
    width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(editorContainer);

  const saveBtn = editorContainer.querySelector(`button[data-op-action="save"]`) as HTMLButtonElement;
  const cancelBtn = editorContainer.querySelector(`button[data-op-action="cancel"]`) as HTMLButtonElement;

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const typeSelect = editorContainer.querySelector(`select[data-op-edit-type="${index}"]`) as HTMLSelectElement;
      const configTextarea = editorContainer.querySelector(`textarea[data-op-config="${index}"]`) as HTMLTextAreaElement;
      const checkboxes = editorContainer.querySelectorAll(`input[data-op-trigger="${index}"]`) as NodeListOf<HTMLInputElement>;
      const customTriggerInput = editorContainer.querySelector(`input[data-op-custom-trigger="${index}"]`) as HTMLInputElement;

      if (typeSelect && configTextarea) {
        const newType = typeSelect.value;
        let newConfig = {};
        try {
          newConfig = JSON.parse(configTextarea.value);
        } catch (e) {
          debugLog('floating-panel', 'invalid-json-config', { error: (e as Error).message });
          alert('配置JSON格式错误，请修正后重试');
          return;
        }

        const triggers: string[] = [];
        checkboxes.forEach(checkbox => {
          if (checkbox.checked) {
            triggers.push(checkbox.value);
          }
        });

        if (customTriggerInput && customTriggerInput.value.trim()) {
          const customTrigger = customTriggerInput.value.trim();
          if (!triggers.includes(customTrigger)) {
            triggers.push(customTrigger);
          }
        }

        const updatedOp = {
          ...op,
          type: newType,
          config: newConfig,
          triggers: triggers.length > 0 ? triggers : ['appear']
        };
        operations[index] = updatedOp;

        updateContainerOperations(containerId, operations);
        document.body.removeChild(editorContainer);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(editorContainer);
    });
  }
}

function bindAddOperationPanelEvents(containerId: string, primarySelector: string | null, domPath: string | null) {
  const addBtn = containerDetailsEl?.querySelector('#btnAddOp') as HTMLButtonElement;
  const triggerSelect = containerDetailsEl?.querySelector('#opTriggerSelect') as HTMLSelectElement;
  const typeSelect = containerDetailsEl?.querySelector('#opTypeSelect') as HTMLSelectElement;
  const seedBtn = containerDetailsEl?.querySelector('#btnSeedOps') as HTMLButtonElement;

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

  if (seedBtn) {
    seedBtn.addEventListener('click', () => {
      const defaultOps = buildDefaultOperations(containerId, primarySelector, domPath);
      updateContainerOperations(containerId, defaultOps);
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
  if (!currentProfile || !currentUrl) {
    logger.warn('operation-execute', 'Missing profile/url; skip execute', {
      profile: currentProfile,
      url: currentUrl,
    });
    return;
  }

  try {
    const api = (window as any).api;
    if (!api?.invokeAction) {
      logger.warn('operation-execute', 'invokeAction not available');
      return;
    }

    debugLog('floating-panel', 'executing-operation', {
      containerId,
      operationIndex: index,
      operationType: operation.type,
      operationId: operation.id
    });

    // 调用 unified-api 的 operations:run 接口
    const result = await api.invokeAction('operations:run', {
      profile: currentProfile,
      url: currentUrl,
      containerId: containerId,
      op: operation.type,
      config: operation.config || {},
      sessionId: currentProfile // 使用 profile 作为 sessionId
    });

    if (result?.success) {
      debugLog('floating-panel', 'operation-executed-success', {
        containerId,
        operationIndex: index,
        result: result.data
      });
      // 显示成功提示
      showOperationResult(operation, true, result.data);
    } else {
      debugLog('floating-panel', 'operation-executed-failed', {
        containerId,
        operationIndex: index,
        error: result?.error || 'Unknown error'
      });
      // 显示失败提示
      showOperationResult(operation, false, result?.error || 'Unknown error');
    }
  } catch (err) {
    logger.error('operation-execute', 'Failed to execute operation', err);
    debugLog('floating-panel', 'operation-execute-exception', {
      containerId,
      operationIndex: index,
      error: (err as Error).message
    });
    // 显示错误提示
    showOperationResult(operation, false, (err as Error).message);
  }
}

function showOperationResult(operation: any, success: boolean, data: any) {
  const resultContainer = document.getElementById('operationResultContainer');
  if (!resultContainer) {
    // 创建结果显示容器
    const container = document.createElement('div');
    container.id = 'operationResultContainer';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10001;
      background: ${success ? '#0e3d0e' : '#3d0e0e'};
      border: 1px solid ${success ? '#7ebd7e' : '#bd7e7e'};
      border-radius: 4px;
      padding: 12px;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(container);

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: ${success ? '#7ebd7e' : '#bd7e7e'};
      margin-bottom: 6px;
    `;
    title.textContent = success ? `✓ 操作执行成功: ${operation.id}` : `✗ 操作执行失败: ${operation.id}`;
    container.appendChild(title);

    const content = document.createElement('div');
    content.style.cssText = `
      font-size: 10px;
      color: #ccc;
      font-family: Consolas, monospace;
      max-height: 200px;
      overflow-y: auto;
    `;
    content.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    container.appendChild(content);

    // 3秒后自动关闭
    setTimeout(() => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 3000);
  }
}



import { CapturePanel } from './ui-components.js';
import { ContainerTree } from './ui-components.js';



// Initialize components
document.addEventListener('DOMContentLoaded', () => {
  // Initialize CapturePanel
  capturePanel = new CapturePanel();
  capturePanel.setCallbacks(
    (state) => {
      console.log('[capture-panel] start capture', state);
      // TODO: Start DOM capture mode
    },
    () => {
      console.log('[capture-panel] stop capture');
      // TODO: Stop DOM capture mode
    }
  );
  
  // Initialize ContainerTree
  containerTree = new ContainerTree();
  containerTree.setContainers([]);
  containerTree.setOnSelect((id) => {
    console.log('[container-tree] selected', id);
  });
  
  // Add elements to DOM
  const capturePanelContainer = document.getElementById('capturePanel');
  const containerTreeContainer = document.getElementById('containerTree');
  const statusPanel = document.getElementById('statusPanel');
  
  if (capturePanelContainer) {
    capturePanelContainer.appendChild(capturePanel.getElement());
    capturePanel.show();
  }
  
  if (containerTreeContainer) {
    containerTreeContainer.appendChild(containerTree.getElement());
  }
  
  if (statusPanel) {
    // Remove statusPanel and replace with component grid
    statusPanel.style.display = 'none';
  }
  
  console.log('[components] initialized');
});



// Initialize UI components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Capture Panel
  const captureEl = document.getElementById('capture');
  if (captureEl) {
    capturePanel = new CapturePanel();
    capturePanel.setCallbacks(
      (state) => {
        console.log('[capture] started', state);
        if ((window as any).api?.invokeAction) {
          (window as any).api.invokeAction('browser:capture-mode', { enabled: true, ...state });
        }
      },
      () => {
        console.log('[capture] stopped');
        if ((window as any).api?.invokeAction) {
          (window as any).api.invokeAction('browser:capture-mode', { enabled: false });
        }
      }
    );
    captureEl.appendChild(capturePanel.getElement());
    capturePanel.show();
  }

  // Container Tree
  const treeEl = document.getElementById('containerTree');
  if (treeEl) {
    containerTree = new ContainerTree();
    containerTree.setOnSelect((id) => {
      console.log('[tree] selected', id);
      // Trigger selection in graph if needed
    });
    treeEl.appendChild(containerTree.getElement());
  }
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
    setStatus(detail.reason || detail.message || '图谱加载失败', false);
  } else if (phase === 'snapshot:ready' || phase === 'ready') {
    setStatus('图谱已更新', true);
  }
}) as EventListener);

// 监听容器节点选中事件，更新“容器详情”面板。
window.addEventListener('webauto:container-selected', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  currentContainer = detail.container || null;
  renderContainerDetails(currentContainer);

  // 自动切换到底部“容器详情”标签，方便查看。
  try {
    if (containerDetailsTab) {
      containerDetailsTab.click();
    }
  } catch {
    // ignore
  }
}) as EventListener);

if (!(window as any).api) {
  log('fatal: window.api missing from preload');
} else {
  log('preload API available');

  // 监听总线连接状态
  if ((window as any).api.onBusStatus) {
    (window as any).api.onBusStatus((status: any) => {
      log('Bus status:', status);
      if (status.connected) {
        if (healthEl) healthEl.textContent = '✅ 已连接总线';
        setStatus('已连接', true);
      } else {
        if (healthEl) healthEl.textContent = '❌ 总线断开';
        setStatus('未连接', false);
      }
    });
  }

  window.api.onBusEvent(async (msg: any) => {
    if (msg.topic === "containers.matched") {
      log("收到 containers.matched 事件");
      const data = msg.payload;
      if (data && data.matched) {
        setStatus('已识别', true);
        const snapshot = data.snapshot;
        const profile = data.profileId;
        const url = data.url;
        const rootSelector = snapshot?.metadata?.root_selector || null;

        currentProfile = profile;
        currentRootSelector = rootSelector;
        currentUrl = url || currentUrl;

        if (!profile) {
          log('Missing profile in containers.matched payload');
          return;
        }

        // 统一交给 graph 模块处理：
        // 1) 覆盖容器/DOM 树
        // 2) 自动展开匹配路径并预拉取
        // 3) 等待关键路径加载后统一重绘
        await applyMatchSnapshot(snapshot, {
          profile,
          url,
          rootSelector,
        });

        log('容器树和DOM树更新完成（统一快照刷新）');

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
      } else {
        log('domPicker result missing domPath:', data);
      }
    }

    if (msg.topic === 'handshake.status') {
      const payload = msg.payload;
      if (payload?.profileId) {
        currentProfile = payload.profileId;
      }
      updatePageContext({
        profile: payload?.profileId,
        url: payload?.url,
      });
      if (payload?.url) {
        currentUrl = payload.url;
      }
    }

    if (msg.topic === 'browser.runtime.event' || (msg.topic?.startsWith && msg.topic.startsWith('browser.runtime.'))) {
      const payload = msg.payload;
      if (payload?.pageUrl) {
        currentUrl = payload.pageUrl;
        updatePageContext({ url: payload.pageUrl });
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

// 绑定窗口控制按钮
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');
const btnPicker = document.getElementById('btnPicker');

if (btnMinimize) {
  btnMinimize.addEventListener('click', () => {
    log('Minimize button clicked');
    if ((window as any).api?.minimize) {
      (window as any).api.minimize().catch((err: any) => {
        log('Minimize failed:', err);
      });
    }
  });
}

if (btnPicker) {
  btnPicker.addEventListener('click', async () => {
    log('Picker button clicked');
    log('🔍 [DEBUG] currentProfile:', currentProfile);
    log('🔍 [DEBUG] currentRootSelector:', currentRootSelector);
    try {
      // 设置按钮状态
      btnPicker.textContent = '捕获中...';
      btnPicker.style.background = '#e5b507';
      btnPicker.style.color = '#000';

      if (!currentProfile) {
        log('Error: No profile set. Please connect to a page first.');
        btnPicker.textContent = '捕获元素';
        btnPicker.style.background = '';
        btnPicker.style.color = '';
        return;
      }

      const result = await (window.api as any).invokeAction('browser:pick-dom', {
        profile: currentProfile,
        rootSelector: currentRootSelector,
        timeout: 60000,
        mode: 'hover-select'
      });
      
      log('🔍 [DEBUG] Picker result:', result);
      
      // 恢复按钮状态
      btnPicker.textContent = '捕获元素';
      btnPicker.style.background = '';
      btnPicker.style.color = '';

      if (result.success && result.data) {
        // 处理选中结果
        const { dom_path: domPath, selector } = result.data;
        if (domPath) {
          handlePickerResult(domPath, selector || null);
        } else {
          log('Picker returned selector but no domPath:', selector);
        }
      }
    } catch (err) {
      log('Picker failed:', err);
      btnPicker.textContent = '捕获元素';
      btnPicker.style.background = '';
      btnPicker.style.color = '';
    }
  });
}

if (btnClose) {
  btnClose.addEventListener('click', () => {
    log('Close button clicked');
    if ((window as any).api?.close) {
      (window as any).api.close().catch((err: any) => {
        log('Close failed:', err);
      });
    }
  });
}
