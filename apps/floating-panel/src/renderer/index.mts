export {};
console.log('[ui-renderer] starting');

declare global {
  interface Window {
    api: {
      health(): Promise<{ ok: boolean; error?: string }>;
      onBusEvent(cb: (msg: unknown) => void): void;
      onBusStatus(cb: (status: { connected: boolean }) => void): void;
      invokeAction(action: string, payload?: any): Promise<any>;
    };
    lastSnapshot?: any;
  }
}

import { initGraph, updateContainerTree, updateDomTree } from './graph.mjs';
import { initDrag } from './drag.mjs';

const statusEl   = document.getElementById('status')   as HTMLSpanElement;
const healthEl   = document.getElementById('health')   as HTMLDivElement;
const eventsEl   = document.getElementById('events')   as HTMLDivElement;
const modeEl     = document.getElementById('mode')     as HTMLDivElement;
const containerTreeEl = document.getElementById('containerTree') as HTMLDivElement;
const domTreeEl  = document.getElementById('domTree')  as HTMLDivElement;
const graphEl     = document.getElementById('graphPanel') as HTMLDivElement;
const btnHealth  = document.getElementById('btnHealth') as HTMLButtonElement;
const btnClear   = document.getElementById('btnClear')  as HTMLButtonElement;

function log(...args: any[]) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log('[ui-renderer]', line);
  const div = document.createElement('div');
  div.className = 'log';
  div.textContent = line;
  eventsEl?.appendChild(div);
  if (eventsEl?.children && eventsEl.children.length > 50) {
    eventsEl.firstChild?.remove();
  }
}

function setStatus(text: string, ok: boolean) {
  // log('setStatus', text, ok);  /* Don't log status updates to reduce noise */
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.className = ok ? 'ok' : 'bad';
  }
}

// Initialize graph
if (graphEl) {
  initGraph(graphEl);
}

// Enable drag for the Electron window
const dragArea = document.getElementById('drag-area') as HTMLElement | null;
if (dragArea) {
  initDrag(dragArea);
} else {
  console.warn('[ui-renderer] drag-area not found, drag disabled');
}

if (!window.api) {
  log('fatal: window.api missing from preload');
  setStatus('API 缺失', false);
} else {
  log('preload API available');

  // Subscribe to bus events
  window.api.onBusEvent((msg: unknown) => {
    log('bus event >>>', msg);
    if (!msg || typeof msg !== 'object') return;
    const data = msg as any;
    
    if (data.topic === "containers.matched") {
      log("收到 containers.matched 事件", data);
      const ok = data.payload?.success === true || data.payload?.matched === true;
      log("匹配检查结果:", { ok, success: data.payload?.success, matched: data.payload?.matched });
      if (ok) {
        setStatus("已识别", true);
        if (healthEl) healthEl.textContent = "✅ 容器匹配成功";
        window.lastSnapshot = data.payload?.snapshot || {};
        log("设置 snapshot:", window.lastSnapshot);
        
        // Update graph with container tree
        if (window.lastSnapshot?.container_tree) {
          log("准备更新容器树:", window.lastSnapshot.container_tree);
          updateContainerTree(window.lastSnapshot.container_tree);
          log("Updated container tree in graph");
        } else {
          log("警告: 未收到 container_tree 数据");
        }
        
        // Update DOM tree if available
        if (window.lastSnapshot?.dom_tree) {
          log("准备更新DOM树:", window.lastSnapshot.dom_tree);
          updateDomTree(window.lastSnapshot.dom_tree);
          log("Updated DOM tree in graph");
        } else {
          log("警告: 未收到 dom_tree 数据");
      return;
    }        setStatus('匹配失败', false);
        if (healthEl) healthEl.textContent = '❌ 容器匹配失败';
      }
      return;
    }
    
    if (data.topic === 'containers.snapshot') {
      const snapshot = data.payload?.snapshot;
      if (snapshot) {
        const summary = snapshot.root?.id || snapshot.container_tree?.id || '未知容器';
        if (healthEl) healthEl.textContent = `📦 容器树: ${summary}`;
        window.lastSnapshot = snapshot;
        
        if (snapshot.container_tree) {
          updateContainerTree(snapshot.container_tree);
          log('Updated container tree from snapshot');
        }
        if (snapshot.dom_tree) {
          updateDomTree(snapshot.dom_tree);
          log('Updated DOM tree from snapshot');
        }
      }
      return;
    }
    
    if (data.topic === 'dom.tree') {
      if (domTreeEl && data.payload?.tree) {
        // Update both text view and graph
        domTreeEl.textContent = JSON.stringify(data.payload.tree, null, 2);
        updateDomTree(data.payload.tree);
        log('Updated DOM tree from dom.tree event');
      }
      return;
    }
    
    if (data.topic === 'browser.mode') {
      if (modeEl) modeEl.textContent = `mode: ${data.payload?.headless ? 'headless' : 'headful'}`;
      return;
    }
  });

  window.api.onBusStatus((status) => {
    log('bus status >>>', status);
    setStatus(status.connected ? '已连接' : '未连接', status.connected);
  });

  if (typeof window.api.invokeAction === 'function') {
    window.api
      .invokeAction('containers:match', {
        profile: 'weibo_fresh',
        url: 'https://weibo.com',
        maxDepth: 2,
        maxChildren: 5
      })
      .then((res) => {
        log('containers:match invokeAction result', res);
      })
      .catch((err) => {
        log('containers:match invokeAction error', err);
      });
  }
}

async function checkHealth() {
  // log('health check >>>'); /* Don't log every health check */
  try {
    const res = await window.api!.health();
    // log('health result', res);  /* Don't log successful health results */
    if (res.ok) {
      if (healthEl) healthEl.textContent = '✅ 服务健康';
      setStatus('已连接', true);
    } else {
      if (healthEl) healthEl.textContent = '❌ 服务异常';
      setStatus('未连接', false);
    }
  } catch (e) {
    log('health error', e);
    if (healthEl) healthEl.textContent = '❌ 健康检查失败';
    setStatus('未连接', false);
  }
}

log('ui init complete');
checkHealth();
setInterval(checkHealth, 5000);

btnHealth?.addEventListener('click', checkHealth);
btnClear?.addEventListener('click', () => {
  if (eventsEl) eventsEl.innerHTML = '';
});
