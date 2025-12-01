const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  close: () => ipcRenderer.send('window-control', 'close'),
  togglePin: (pinned) => ipcRenderer.invoke('window:set-pin', pinned),
  getMeta: () => ipcRenderer.invoke('app:get-meta'),
  toggleDevtools: () => ipcRenderer.send('window-control', 'toggle-devtools'),
  setCollapsed: (collapsed) => ipcRenderer.invoke('window:set-collapsed', collapsed),
  getBounds: () => ipcRenderer.invoke('window:get-bounds'),
  moveWindow: (x, y) => ipcRenderer.invoke('window:set-position', { x, y }),
  getWorkArea: () => ipcRenderer.invoke('window:get-workarea'),
});
