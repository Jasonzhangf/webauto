const { contextBridge, ipcRenderer } = require('electron');

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
});

contextBridge.exposeInMainWorld('backendAPI', {
  invokeAction: (action, payload) => ipcRenderer.invoke('ui:action', { action, payload }),
});
