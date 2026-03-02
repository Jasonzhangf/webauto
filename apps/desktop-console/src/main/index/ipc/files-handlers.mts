import { ipcMain } from 'electron';
import type { IpcDeps } from '../ipc-handlers.mts';
import {
  scanResults,
  listXhsFullCollectScripts,
  readTextPreview,
  readTextTail,
  readFileBase64,
  listDir,
} from './files.mts';

export function registerFileHandlers(deps: IpcDeps) {
  ipcMain.handle('results:scan', async (_evt, spec: { downloadRoot?: string }) =>
    scanResults(deps.repoRoot, deps.resolveDefaultDownloadRoot, spec || {}),
  );
  ipcMain.handle('fs:listDir', async (_evt, spec: { root: string; recursive?: boolean; maxEntries?: number }) => listDir(spec));
  ipcMain.handle('fs:readTextPreview', async (_evt, spec: { path: string; maxBytes?: number; maxLines?: number }) =>
    readTextPreview(spec),
  );
  ipcMain.handle('fs:readTextTail', async (_evt, spec: { path: string; fromOffset?: number; maxBytes?: number }) =>
    readTextTail(spec),
  );
  ipcMain.handle('fs:readFileBase64', async (_evt, spec: { path: string; maxBytes?: number }) => readFileBase64(spec));
  ipcMain.handle('profiles:list', async () => deps.profileStore.listProfiles());
  ipcMain.handle('profiles:scan', async () => deps.profileStore.scanProfiles());
  ipcMain.handle('scripts:xhsFullCollect', async () => listXhsFullCollectScripts(deps.xhsScriptsRoot, deps.xhsFullCollectRe));
  ipcMain.handle('profile:create', async (_evt, input: { profileId: string }) => deps.profileStore.profileCreate(input || ({} as any)));
  ipcMain.handle('profile:delete', async (_evt, input: { profileId: string; deleteFingerprint?: boolean }) =>
    deps.profileStore.profileDelete(input || ({} as any)),
  );
  ipcMain.handle('fingerprint:delete', async (_evt, input: { profileId: string }) => deps.profileStore.fingerprintDelete(input || ({} as any)));
  ipcMain.handle('fingerprint:regenerate', async (_evt, input: { profileId: string; platform?: 'windows' | 'macos' | 'random' }) =>
    deps.profileStore.fingerprintRegenerate(input || ({} as any)),
  );
}
