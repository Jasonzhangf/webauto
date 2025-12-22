const { contextBridge, ipcRenderer } = require('electron');

const api = {
  health: () => ipcRenderer.invoke('health'),
  invokeAction: (action, payload) => 
    ipcRenderer.invoke('ui:action', { action, payload }),
  onBusEvent: (cb) => {
    ipcRenderer.on('bus:event', (_, msg) => cb(msg));
  },
  onBusStatus: (cb) => {
    ipcRenderer.on('bus:status', (_, status) => cb(status));
  }
};

contextBridge.exposeInMainWorld('api', api);
