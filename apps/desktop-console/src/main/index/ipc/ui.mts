import { ipcMain } from 'electron';
import type { IpcDeps } from '../ipc-handlers.mts';

export function registerUiHandlers(deps: IpcDeps) {
  ipcMain.on('preload:test', () => {
    console.log('[preload-test] window.api OK');
    setTimeout(() => deps.appQuit(), 200);
  });
}
