import { ipcMain, shell, clipboard } from 'electron';
import type { CrawlConfig } from '../../desktop-settings.mts';
import type { IpcDeps } from '../ipc-handlers.mts';

export function registerSettingsHandlers(deps: IpcDeps) {
  ipcMain.handle('settings:get', async () => deps.readDesktopConsoleSettings({ appRoot: deps.appRoot, repoRoot: deps.repoRoot }));
  ipcMain.handle('app:getVersion', async () => deps.versionInfo);
  ipcMain.handle('settings:set', async (_evt, next) => {
    const updated = await deps.writeDesktopConsoleSettings({ appRoot: deps.appRoot, repoRoot: deps.repoRoot }, next || {});
    const w = deps.getWin();
    if (w) w.webContents.send('settings:changed', updated);
    return updated;
  });

  ipcMain.handle('config:saveLast', async (_evt, config: CrawlConfig) => {
    await deps.saveCrawlConfig({ appRoot: deps.appRoot, repoRoot: deps.repoRoot }, config);
    return { ok: true };
  });
  ipcMain.handle('config:loadLast', async () => deps.loadCrawlConfig({ appRoot: deps.appRoot, repoRoot: deps.repoRoot }));
  ipcMain.handle('config:export', async (_evt, { filePath, config }: { filePath: string; config: CrawlConfig }) =>
    deps.exportConfigToFile(filePath, config),
  );
  ipcMain.handle('config:import', async (_evt, { filePath }: { filePath: string }) => deps.importConfigFromFile(filePath));

  ipcMain.handle('os:openPath', async (_evt, input: { path: string }) => {
    const p = String(input?.path || '');
    const r = await shell.openPath(p);
    return { ok: !r, error: r || null };
  });

  ipcMain.handle('clipboard:writeText', async (_evt, input: { text: string }) => {
    try {
      clipboard.writeText(String(input?.text || ''));
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
}
