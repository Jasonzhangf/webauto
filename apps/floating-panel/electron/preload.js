import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopAPI', {
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  close: () => ipcRenderer.send('window-control', 'close'),
  togglePin: (pinned) => ipcRenderer.invoke('window:set-pin', pinned),
  getMeta: () => ipcRenderer.invoke('app:get-meta'),
  toggleDevtools: () => ipcRenderer.send('window-control', 'toggle-devtools'),
});
