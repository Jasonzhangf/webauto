import { contextBridge, ipcRenderer } from 'electron';
import path from 'node:path';
import os from 'node:os';

contextBridge.exposeInMainWorld('api', {
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (next) => ipcRenderer.invoke('settings:set', next),

  pathJoin: (...parts) => path.join(...parts.map((x) => String(x))),
  pathNormalize: (p) => path.normalize(String(p)),
  pathSep: path.sep,
  osHomedir: () => os.homedir(),

  cmdSpawn: (spec) => ipcRenderer.invoke('cmd:spawn', spec),
  cmdKill: (runId) => ipcRenderer.invoke('cmd:kill', { runId }),
  cmdRunJson: (spec) => ipcRenderer.invoke('cmd:runJson', spec),

  resultsScan: (spec) => ipcRenderer.invoke('results:scan', spec),
  fsListDir: (spec) => ipcRenderer.invoke('fs:listDir', spec),
  fsReadTextPreview: (spec) => ipcRenderer.invoke('fs:readTextPreview', spec),
  fsReadTextTail: (spec) => ipcRenderer.invoke('fs:readTextTail', spec),
  fsReadFileBase64: (spec) => ipcRenderer.invoke('fs:readFileBase64', spec),
  profilesList: () => ipcRenderer.invoke('profiles:list'),
  profilesScan: () => ipcRenderer.invoke('profiles:scan'),
  scriptsXhsFullCollect: () => ipcRenderer.invoke('scripts:xhsFullCollect'),
  profileCreate: (profileId) => ipcRenderer.invoke('profile:create', { profileId: String(profileId || '') }),
  profileDelete: (spec) => ipcRenderer.invoke('profile:delete', spec),
  fingerprintDelete: (spec) => ipcRenderer.invoke('fingerprint:delete', spec),
  fingerprintRegenerate: (spec) => ipcRenderer.invoke('fingerprint:regenerate', spec),
 osOpenPath: (p) => ipcRenderer.invoke('os:openPath', { path: p }),

  // Runtime Dashboard APIs
  runtimeListSessions: () => ipcRenderer.invoke('runtime:listSessions'),
  runtimeFocus: (spec) => ipcRenderer.invoke('runtime:focus', spec),
  runtimeKill: (spec) => ipcRenderer.invoke('runtime:kill', spec),
  runtimeRestartPhase1: (spec) => ipcRenderer.invoke('runtime:restartPhase1', spec),
  runtimeSetBrowserTitle: (spec) => ipcRenderer.invoke('runtime:setBrowserTitle', spec),
  runtimeSetHeaderBar: (spec) => ipcRenderer.invoke('runtime:setHeaderBar', spec),
  desktopHeartbeat: () => ipcRenderer.invoke('desktop:heartbeat'),

  // Generic IPC invoke for extensibility
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Event listeners
  onSettingsChanged: (handler) => {
    const fn = (_, payload) => handler(payload);
    ipcRenderer.on('settings:changed', fn);
    return () => ipcRenderer.removeListener('settings:changed', fn);
  },

  onCmdEvent: (handler) => {
    const fn = (_, payload) => handler(payload);
    ipcRenderer.on('cmd:event', fn);
    return () => ipcRenderer.removeListener('cmd:event', fn);
  },
  stateGetTasks: () => ipcRenderer.invoke('state:getTasks'),
  stateGetTask: (runId) => ipcRenderer.invoke('state:getTask', runId),
  stateGetEvents: (runId, since) => ipcRenderer.invoke('state:getEvents', runId, since),
  onStateUpdate: (cb) => {
    const listener = (_e, update) => cb(update);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  },
});

if (process.env.WEBAUTO_DESKTOP_CONSOLE_PRELOAD_TEST === '1') {
  try {
    ipcRenderer.send('preload:test', { ok: true });
  } catch {
    // ignore
  }
}
