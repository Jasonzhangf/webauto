// Preload 脚本 - 在 Node.js 上下文中运行
// 需要加载 electron 模块

import electron from 'electron';
const { contextBridge, ipcRenderer } = electron;

console.log('[preload] Starting preload script');
console.log('[preload] Electron modules loaded:', {
  contextBridge: !!contextBridge,
  ipcRenderer: !!ipcRenderer
});

const api = {
  health: () => {
    console.log('[preload] health() called');
    return ipcRenderer.invoke('health');
  },
  invokeAction: (action, payload) => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    console.log('[preload] invokeAction called:', action, 'requestId:', requestId);
    return ipcRenderer.invoke('ui:action', { action, payload, request_id: requestId });
  },
  minimize: () => {
    console.log('[preload] minimize() called');
    return ipcRenderer.invoke('window:minimize');
  },
  close: () => {
    console.log('[preload] close() called');
    return ipcRenderer.invoke('window:close');
  },
highlightElement: (selector, color = "green", options = {}, profile = null) => {
    console.log('[preload] highlightElement() called:', selector);
    return ipcRenderer.invoke('ui:highlight', { selector, color, options, profile });
  },
  clearHighlight: (profile = null) => {
    console.log('[preload] clearHighlight() called');
    return ipcRenderer.invoke('ui:clearHighlight', { profile });
  },
  debugLog: (module, action, data) => {
    console.log('[preload] debugLog:', module, action, data);
    return ipcRenderer.invoke('ui:debug-log', { module, action, data });
  },
  onBusStatus: (callback) => {
    console.log('[preload] onBusStatus listener registered');
    ipcRenderer.on('bus:status', (event, status) => callback(status));
  },
  onBusEvent: (callback) => {
    console.log('[preload] onBusEvent listener registered');
    ipcRenderer.on('bus:event', (event, msg) => callback(msg));
  },
  saveLayoutState: (layoutState) => {
    console.log('[preload] saveLayoutState() called:', layoutState);
    return ipcRenderer.invoke('layout:save', layoutState);
  },
  loadLayoutState: () => {
    console.log('[preload] loadLayoutState() called');
    return ipcRenderer.invoke('layout:load');
  }
};

const isContextIsolationEnabled = typeof process !== 'undefined' && process.contextIsolated;
if (isContextIsolationEnabled) {
  console.log('[preload] Exposing API to renderer via contextBridge');
  contextBridge.exposeInMainWorld('api', api);
  console.log('[preload] API exposed successfully');
} else {
  // Fallback for contextIsolation=false
  console.log('[preload] contextBridge unavailable, attaching to window');
  globalThis.api = api;
}
