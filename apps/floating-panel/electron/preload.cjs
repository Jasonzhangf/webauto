const { contextBridge, ipcRenderer } = require('electron');
console.log('[preload] initializing context bridges');

function sendWindowControl(action, value) {
  if (value === undefined) {
    ipcRenderer.send('window-control', action);
  } else {
    ipcRenderer.send('window-control', { action, value });
  }
}

contextBridge.exposeInMainWorld('desktopAPI', {
  close: () => sendWindowControl('close'),
  minimize: () => sendWindowControl('minimize'),
  toggleCollapse: (nextState) => sendWindowControl('toggle-collapse', nextState),
  setHeadlessMode: (enabled) => sendWindowControl('set-headless', Boolean(enabled)),
  fitContentHeight: (height) => {
    if (height && Number.isFinite(Number(height))) {
      ipcRenderer.send('window:fit-height', Number(height));
    }
  },
  openInspector: (payload) => ipcRenderer.invoke('inspector:open', payload),
  sendInspectorCommand: (command) => ipcRenderer.send('inspector:command', command),
  notifyInspectorReady: () => ipcRenderer.send('inspector:ready'),
  onCollapseState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'window:collapse-state';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onInspectorData: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'inspector:data';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onInspectorEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'inspector:event';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onHeadlessState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'window:headless-state';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  publishMessage: (topic, payload) => {
    if (!topic) return;
    ipcRenderer.send('bus:publish', { topic, payload });
  },
  onMessage: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'bus:event';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});

contextBridge.exposeInMainWorld('backendAPI', {
  invokeAction: (action, payload) => ipcRenderer.invoke('ui:action', { action, payload }),
});

contextBridge.exposeInMainWorld('floatingLogger', {
  log: (...args) => ipcRenderer.send('ui:log', { level: 'log', args }),
  warn: (...args) => ipcRenderer.send('ui:log', { level: 'warn', args }),
  error: (...args) => ipcRenderer.send('ui:log', { level: 'error', args }),
});

contextBridge.exposeInMainWorld('healthAPI', {
  // 请求健康检查报告
  requestHealthReport: () => {
    ipcRenderer.send('bus:publish', { topic: 'health.request', payload: {} });
  },
  
  // 获取当前健康状态
  getHealthStatus: () => {
    ipcRenderer.send('bus:publish', { topic: 'health.status', payload: {} });
  },
  
  // 尝试重连
  attemptReconnect: () => {
    ipcRenderer.send('bus:publish', { topic: 'health.reconnect', payload: {} });
  },
  
  // 监听健康报告
  onHealthReport: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'health:report';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  
  // 监听健康错误
  onHealthError: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'health:error';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  
  // 监听健康状态响应
  onHealthStatusResponse: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'health.status.response';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  
  // 监听重连响应
  onReconnectResponse: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'health.reconnect.response';
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
