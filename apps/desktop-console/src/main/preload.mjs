import { contextBridge, ipcRenderer } from 'electron';
import path from 'node:path';

contextBridge.exposeInMainWorld('api', {
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (next) => ipcRenderer.invoke('settings:set', next),

  pathJoin: (...parts) => path.join(...parts.map((x) => String(x))),
  pathNormalize: (p) => path.normalize(String(p)),
  pathSep: path.sep,

  cmdSpawn: (spec) => ipcRenderer.invoke('cmd:spawn', spec),
  cmdKill: (runId) => ipcRenderer.invoke('cmd:kill', { runId }),
  cmdRunJson: (spec) => ipcRenderer.invoke('cmd:runJson', spec),

  resultsScan: (spec) => ipcRenderer.invoke('results:scan', spec),
  fsListDir: (spec) => ipcRenderer.invoke('fs:listDir', spec),
  fsReadTextPreview: (spec) => ipcRenderer.invoke('fs:readTextPreview', spec),
  fsReadFileBase64: (spec) => ipcRenderer.invoke('fs:readFileBase64', spec),
  profilesList: () => ipcRenderer.invoke('profiles:list'),
  profilesScan: () => ipcRenderer.invoke('profiles:scan'),
  profileCreate: (profileId) => ipcRenderer.invoke('profile:create', { profileId: String(profileId || '') }),
  profileDelete: (spec) => ipcRenderer.invoke('profile:delete', spec),
  fingerprintDelete: (spec) => ipcRenderer.invoke('fingerprint:delete', spec),
  fingerprintRegenerate: (spec) => ipcRenderer.invoke('fingerprint:regenerate', spec),
  osOpenPath: (p) => ipcRenderer.invoke('os:openPath', { path: p }),

  onCmdEvent: (handler) => {
    const fn = (_, payload) => handler(payload);
    ipcRenderer.on('cmd:event', fn);
    return () => ipcRenderer.removeListener('cmd:event', fn);
  },
});

if (process.env.WEBAUTO_DESKTOP_CONSOLE_PRELOAD_TEST === '1') {
  try {
    ipcRenderer.send('preload:test', { ok: true });
  } catch {
    // ignore
  }
}
