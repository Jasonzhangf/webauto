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
    }

    if (msg.topic === 'browser.runtime.event' || (msg.topic?.startsWith && msg.topic.startsWith('browser.runtime.'))) {
      const payload = msg.payload;
      if (payload?.pageUrl) {
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
