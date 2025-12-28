import { 
  initGraph, 
  updateContainerTree, 
  updateDomTree, 
  mergeDomBranch, 
  renderGraph, 
  expandDomPath, 
  markPathLoaded 
} from './graph.mjs';

const log = (...args: any[]) => {
  console.log('[ui-renderer]', ...args);
};

const statusEl = document.getElementById('status');
const healthEl = document.getElementById('health');
const dragArea = document.getElementById('drag-area');

function setStatus(text: string, ok: boolean) {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = ok ? '#4CAF50' : '#f44336';
  }
}

// 模拟 debugLog
function debugLog(module: string, action: string, data: any) {
  if ((window as any).api?.debugLog) {
    (window as any).api.debugLog(module, action, data).catch(() => {});
  }
}

if (dragArea) {
  log('drag-area found, enabling drag');
}

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
        setStatus("已识别", true);
        const snapshot = data.snapshot;
        
        // 1. 更新容器树
        updateContainerTree(snapshot.container_tree);
        
        // 2. 收集所有匹配的 DOM 路径并自动展开
        const matchedDomPaths = new Set<string>();
        function collectMatchedPaths(node: any) {
          if (node.match?.nodes) {
            node.match.nodes.forEach((m: any) => {
              if (m.dom_path) {
                matchedDomPaths.add(m.dom_path);
                log('发现匹配路径:', m.dom_path);
              }
            });
          }
          if (node.children) {
            node.children.forEach((c: any) => collectMatchedPaths(c));
          }
        }
        collectMatchedPaths(snapshot.container_tree);
        
        // 自动展开所有匹配的路径
        matchedDomPaths.forEach(path => {
          expandDomPath(path);
          log('已展开路径:', path);
        });
        
        // 3. 更新 DOM 树
        const profile = data.profileId;
        if (!profile) {
          log('Missing profile in containers.matched payload');
          return;
        }
        const url = data.url;
        const rootSelector = snapshot?.metadata?.root_selector || null;
        updateDomTree(snapshot.dom_tree, { profile, page_url: url, root_selector: rootSelector });
        
        // 4. 渲染
        renderGraph();
        
        log('容器树和DOM树更新完成，已自动展开', matchedDomPaths.size, '个匹配路径');
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
      log('Health check failed', e);
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
