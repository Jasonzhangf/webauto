import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ipcMain } from 'electron';
import type { IpcDeps } from '../ipc-handlers.mts';

export function registerEnvHandlers(deps: IpcDeps) {
  ipcMain.handle('env:checkCamo', async () => deps.checkCamoCli());
  ipcMain.handle('env:checkServices', async () => deps.checkServices());
  ipcMain.handle('env:checkFirefox', async () => deps.checkFirefox());
  ipcMain.handle('env:checkGeoIP', async () => deps.checkGeoIP());
  ipcMain.handle('env:checkAll', async () => deps.checkEnvironment());
  ipcMain.handle('env:repairCore', async () => {
    const ok = await deps.startCoreDaemon().catch(() => false);
    const services = await deps.checkServices().catch(() => ({ unifiedApi: false, camoRuntime: false }));
    return { ok, services };
  });
  ipcMain.handle('env:cleanup', async () => {
    deps.markUiHeartbeat('env_cleanup');
    console.log('[env:cleanup] Starting environment cleanup...');

    await deps.cleanupRuntimeEnvironment('env_cleanup_requested', {
      stopUiBridge: false,
      stopHeartbeat: false,
      stopCoreServices: false,
      stopStateBridge: false,
      includeLockCleanup: true,
    });

    let locksCleared = 0;
    try {
      const scan = await deps.profileStore.scanProfiles().catch(() => null);
      const entries = Array.isArray((scan as any)?.entries) ? (scan as any).entries : [];
      for (const entry of entries) {
        const profileDir = String(entry?.profileDir || '').trim();
        if (!profileDir) continue;
        const lockFile = path.join(profileDir, '.lock');
        try {
          await fs.unlink(lockFile);
          locksCleared++;
          console.log(`[env:cleanup] Cleared lock for profile ${entry?.profileId || profileDir}`);
        } catch (err: any) {
          if (err?.code !== 'ENOENT') {
            console.warn(`[env:cleanup] Failed to clear lock for ${entry?.profileId || profileDir}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn('[env:cleanup] Failed to list profiles:', err);
    }

    await deps.stopCoreDaemon().catch(() => null);
    const restarted = await deps.startCoreDaemon().catch(() => false);

    const services = await deps.checkServices().catch(() => ({ unifiedApi: false, camoRuntime: false }));
    const firefox = await deps.checkFirefox().catch(() => ({ installed: false }));
    const camo = await deps.checkCamoCli().catch(() => ({ installed: false }));

    console.log('[env:cleanup] Cleanup complete:', { locksCleared, restarted, services, firefox, camo });

    return {
      ok: true,
      locksCleared,
      coreRestarted: restarted,
      services,
      firefox,
      camo,
    };
  });
  ipcMain.handle('env:repairDeps', async (_evt, input: {
    core?: boolean;
    browser?: boolean;
    geoip?: boolean;
    reinstall?: boolean;
    uninstall?: boolean;
    ensureBackend?: boolean;
  }) => {
    const wantCore = Boolean(input?.core);
    const wantBrowser = Boolean(input?.browser);
    const wantGeoip = Boolean(input?.geoip);
    const wantReinstall = Boolean(input?.reinstall);
    const wantUninstall = Boolean(input?.uninstall);
    const wantEnsureBackend = Boolean(input?.ensureBackend);
    const result: any = { ok: true, core: null, install: null, env: null };

    if (wantCore) {
      const coreOk = await deps.startCoreDaemon().catch(() => false);
      result.core = {
        ok: coreOk,
        services: await deps.checkServices().catch(() => ({ unifiedApi: false, camoRuntime: false })),
      };
      if (!coreOk) result.ok = false;
    }

    if (wantBrowser || wantGeoip) {
      const args = [path.join('apps', 'webauto', 'entry', 'xhs-install.mjs')];
      if (wantReinstall) args.push('--reinstall');
      else if (wantUninstall) args.push('--uninstall');
      else args.push('--install');
      if (wantBrowser) args.push('--download-browser');
      if (wantGeoip) args.push('--download-geoip');
      if (!wantUninstall && wantEnsureBackend) args.push('--ensure-backend');
      const installRes = await deps.runJson({
        title: 'env repair deps',
        cwd: deps.repoRoot,
        args,
        timeoutMs: 300_000,
      }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      result.install = installRes;
      if (!installRes?.ok) result.ok = false;
    }

    result.env = await deps.checkEnvironment().catch(() => null);
    return result;
  });
}
