// Preload 脚本 - 在 Node.js 上下文中运行
// 需要加载 electron 模块

import { contextBridge, ipcRenderer } from 'electron';

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
    console.log('[preload] invokeAction called:', action);
    return ipcRenderer.invoke('ui:action', { action, payload });
  },
  minimize: () => {
    console.log('[preload] minimize() called');
    return ipcRenderer.invoke('window:minimize');
  },
  close: () => {
    console.log('[preload] close() called');
    return ipcRenderer.invoke('window:close');
  },
  highlightElement: (selector, color = 'green') => {
    console.log('[preload] highlightElement called:', selector, color);
    return ipcRenderer.invoke('ui:highlight', { selector, color });
  },
  onBusEvent: (cb) => {
    console.log('[preload] onBusEvent registered');
    return ipcRenderer.on('bus:event', (_, msg) => {
      console.log('[preload] Bus event received:', msg?.topic);
      cb(msg);
    });
  },
  onBusStatus: (cb) => {
    console.log('[preload] onBusStatus registered');
    return ipcRenderer.on('bus:status', (_, status) => {
      console.log('[preload] Bus status received:', status);
      cb(status);
    });
  }
};

console.log('[preload] Exposing api to renderer');
contextBridge.exposeInMainWorld('api', api);
console.log('[preload] Preload script completed');
