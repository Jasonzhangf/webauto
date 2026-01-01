import {
  initGraph,
  handlePickerResult,
  updatePageContext,
  applyMatchSnapshot,
} from './graph.mjs';
import { logger } from './logger.mts';
import { FLOATING_PANEL_VERSION } from './version.mts';

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
    containerDetailsEl.innerHTML = `
      <div style="margin-bottom:4px;color:#777;">未选择任何容器节点</div>
      <div style="font-size:10px;color:#555;">在左侧图中点击一个容器节点以查看详情和操作列表。</div>
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

  // 将 operations 按消息触发分组：默认触发为 appear。
  const DEFAULT_TRIGGER = 'appear';
  const preferredOrder = ['appear', 'click', 'manual:rehearsal'];
  const grouped = new Map<string, Array<{ op: any; index: number }>>();
  operations.forEach((op: any, index: number) => {
    const triggers = Array.isArray(op.triggers) && op.triggers.length ? op.triggers : [DEFAULT_TRIGGER];
    triggers.forEach((raw) => {
      const key = String(raw || '').trim() || DEFAULT_TRIGGER;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ op, index });
    });
  });
  const triggerOrder: string[] = [];
  preferredOrder.forEach((t) => {
    if (grouped.has(t)) triggerOrder.push(t);
  });
  Array.from(grouped.keys()).forEach((t) => {
    if (!triggerOrder.includes(t)) triggerOrder.push(t);
  });

  const renderTriggerLabel = (trigger: string) => {
    if (trigger === 'appear') return 'appear（出现）';
    if (trigger === 'click') return 'click（点击）';
    if (trigger === 'manual:rehearsal') return 'manual:rehearsal（演练）';
    return trigger;
  };

  const messageOpsHtml =
    operations.length && triggerOrder.length
      ? triggerOrder
          .map((trigger) => {
            const rows = grouped.get(trigger) || [];
            const rowsHtml = rows
              .map(({ op, index }) => {
                const key = op.id || op.type || `op-${index + 1}`;
                const configPreview = op.config ? JSON.stringify(op.config).slice(0, 48) : '{}';
                const enabled = op.enabled !== false;
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;">
                  <div style="flex:1;min-width:0;">
                    <span style="color:${enabled ? '#ffd700' : '#777'};font-size:11px;">${key}</span>
                    <span style="color:#888;font-size:10px;margin-left:4px;">${op.type || ''}</span>
                    <span style="color:#555;font-size:10px;margin-left:6px;">${configPreview}</span>
                  </div>
                  <div style="display:flex;gap:4px;">
                    <button data-op-index="${index}" data-op-action="rehearse" style="font-size:10px;padding:2px 4px;">演练</button>
                  </div>
                </div>`;
              })
              .join('');
            return `<div style="display:flex;align-items:flex-start;padding:4px 0;border-bottom:1px solid #2a2a2a;">
              <div style="width:96px;font-size:10px;color:#9cdcfe;padding-top:2px;">${renderTriggerLabel(trigger)}</div>
              <div style="flex:1;min-width:0;">${
                rowsHtml || `<div style="font-size:10px;color:#666;">当前消息下暂无操作</div>`
              }</div>
            </div>`;
          })
          .join('')
      : `<div style="font-size:10px;color:#666;">无操作定义（operations 为空）</div>`;

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
    <div style="margin-bottom:4px;font-size:11px;color:#ccc;font-weight:600;">消息与 Operation 列表</div>
    <div id="containerOperationsList">
      ${messageOpsHtml}
    </div>
    <div style="margin-top:6px;font-size:10px;color:#999;">高级：Operation 配置（JSON，可编辑）</div>
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

  const opsEditor = containerDetailsEl.querySelector('#containerOpsEditor') as HTMLTextAreaElement | null;
  if (opsEditor) {
    try {
      opsEditor.value = JSON.stringify(operations, null, 2);
    } catch {
      opsEditor.value = '[]';
    }
  }

  const btnSaveAlias = containerDetailsEl.querySelector('#btnSaveAlias') as HTMLButtonElement | null;
  if (btnSaveAlias && aliasInput) {
    btnSaveAlias.addEventListener('click', async () => {
      const nextAlias = aliasInput.value.trim();
      debugLog('floating-panel', 'update-alias-clicked', { containerId: id, alias: nextAlias });
      if (!currentProfile || !currentUrl) {
        logger.warn('container-alias', 'Missing profile/url; skip update', {
          profile: currentProfile,
          url: currentUrl,
        });
        return;
      }
      try {
        const api = (window as any).api;
        if (!api?.invokeAction) {
          logger.warn('container-alias', 'invokeAction not available');
          return;
        }
        await api.invokeAction('containers:update-alias', {
          profile: currentProfile,
          url: currentUrl,
          containerId: id,
          alias: nextAlias,
        });
        await api.invokeAction('containers:match', {
          profile: currentProfile,
          url: currentUrl,
          rootSelector: currentRootSelector || undefined,
        });
      } catch (err) {
        logger.error('container-alias', 'Failed to update alias', err);
      }
    });
  }

  const btnSaveOps = containerDetailsEl.querySelector('#btnSaveOps') as HTMLButtonElement | null;
  if (btnSaveOps && opsEditor) {
    btnSaveOps.addEventListener('click', async () => {
      if (!currentProfile || !currentUrl) {
        logger.warn('container-operations', 'Missing profile/url; skip update', {
          profile: currentProfile,
          url: currentUrl,
        });
        return;
      }
      let nextOperations: any[] = [];
      try {
        const raw = opsEditor.value || '[]';
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error('operations JSON must be an array');
        }
        nextOperations = parsed;
      } catch (err: any) {
        logger.error('container-operations', 'Invalid operations JSON', err);
        debugLog('floating-panel', 'operations-parse-error', {
          containerId: id,
          error: err?.message || String(err),
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
          containerId: id,
          operations: nextOperations,
        });
        await api.invokeAction('containers:match', {
          profile: currentProfile,
          url: currentUrl,
          rootSelector: currentRootSelector || undefined,
        });
      } catch (err) {
        logger.error('container-operations', 'Failed to update operations', err);
      }
    });
  }

  // 为演练按钮挂载简单的占位行为（后续可以接入真正的后台 action）。
  const listEl = containerDetailsEl.querySelector('#containerOperationsList');
  if (listEl) {
    listEl.querySelectorAll('button[data-op-action="rehearse"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const indexAttr = (btn as HTMLElement).getAttribute('data-op-index');
        const index = typeof indexAttr === 'string' ? Number(indexAttr) : NaN;
        if (!Number.isFinite(index)) return;
        const op = operations[index];
        debugLog('floating-panel', 'op-rehearse-clicked', { containerId: id, opIndex: index, op });
        // 这里暂时仅记录日志，不做实际执行，避免影响现有流程。
      });
    });
  }
}

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
