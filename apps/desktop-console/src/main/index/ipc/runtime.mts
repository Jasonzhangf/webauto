import { ipcMain } from 'electron';
import type { IpcDeps } from '../ipc-handlers.mts';
import { unifiedAction } from './unified.mts';

export function registerRuntimeHandlers(deps: IpcDeps) {
  ipcMain.handle('runtime:listSessions', async () => {
    const data = await unifiedAction(deps.readDesktopConsoleSettings, deps.appRoot, deps.repoRoot, 'session:list', {}).catch(() => null);
    const sessions = (data as any)?.data?.sessions || (data as any)?.sessions || [];
    if (!Array.isArray(sessions)) return [];
    const now = new Date().toISOString();
    return sessions
      .map((s: any) => ({
        profileId: String(s?.profileId || s?.profile_id || s?.sessionId || s?.session_id || ''),
        sessionId: String(s?.sessionId || s?.session_id || s?.profileId || s?.profile_id || ''),
        currentUrl: String(s?.currentUrl || s?.current_url || ''),
        lastPhase: String(s?.lastPhase || s?.phase || 'phase1'),
        lastActiveAt: String(s?.lastActiveAt || now),
        status: 'running',
      }))
      .filter((s: any) => s.profileId);
  });

  ipcMain.handle('runtime:focus', async (_evt, input: { profileId: string }) => {
    const profileId = String(input?.profileId || '').trim();
    if (!profileId) return { ok: false, error: 'missing profileId' };
    const focusRes = await unifiedAction(deps.readDesktopConsoleSettings, deps.appRoot, deps.repoRoot, 'browser:focus', { profile: profileId }).catch(() => ({ ok: false }));
    await unifiedAction(deps.readDesktopConsoleSettings, deps.appRoot, deps.repoRoot, 'browser:execute', {
      profile: profileId,
      script: `(() => {
        try {
          const id = '__webauto_focus_ring__';
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.position = 'fixed';
            el.style.left = '8px';
            el.style.top = '8px';
            el.style.right = '8px';
            el.style.bottom = '8px';
            el.style.border = '3px solid #2b67ff';
            el.style.borderRadius = '10px';
            el.style.zIndex = '2147483647';
            el.style.pointerEvents = 'none';
            document.body.appendChild(el);
          }
          el.style.display = 'block';
          setTimeout(() => { try { el.remove(); } catch {} }, 1500);
          return true;
        } catch {
          return false;
        }
      })()`,
    }).catch(() => null);
    return focusRes;
  });

  ipcMain.handle('runtime:kill', async (_evt, input: { profileId: string }) => {
    const profileId = String(input?.profileId || '').trim();
    if (!profileId) return { ok: false, error: 'missing profileId' };
    return unifiedAction(deps.readDesktopConsoleSettings, deps.appRoot, deps.repoRoot, 'session:delete', { profileId }).catch((err) => ({ ok: false, error: (err as any)?.message || String(err) }));
  });

  ipcMain.handle('runtime:restartPhase1', async (_evt, input: { profileId: string }) => {
    const profileId = String(input?.profileId || '').trim();
    if (!profileId) return { ok: false, error: 'missing profileId' };
    const args = [
      'scripts/xiaohongshu/phase1-boot.mjs',
      '--profile',
      profileId,
      '--headless',
      'false',
    ];
    return deps.spawnCommand({ title: `Phase1 restart ${profileId}`, cwd: deps.repoRoot, args, groupKey: 'phase1' });
  });

  ipcMain.handle('runtime:setBrowserTitle', async (_evt, input: { profileId: string; title: string }) => {
    const profileId = String(input?.profileId || '').trim();
    const title = String(input?.title || '').trim();
    if (!profileId || !title) return { ok: false, error: 'missing profileId/title' };
    return unifiedAction(deps.readDesktopConsoleSettings, deps.appRoot, deps.repoRoot, 'browser:execute', {
      profile: profileId,
      script: `(() => { try { document.title = ${JSON.stringify(title)}; return true; } catch { return false; } })()`,
    }).catch((err) => ({ ok: false, error: (err as any)?.message || String(err) }));
  });

  ipcMain.handle('runtime:setHeaderBar', async (_evt, input: { profileId: string; label: string; color: string }) => {
    const profileId = String(input?.profileId || '').trim();
    const label = String(input?.label || '').trim();
    const color = String(input?.color || '').trim();
    if (!profileId || !label || !color) return { ok: false, error: 'missing profileId/label/color' };
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2b67ff';
    return unifiedAction(deps.readDesktopConsoleSettings, deps.appRoot, deps.repoRoot, 'browser:execute', {
      profile: profileId,
      script: `(() => {
        try {
          const id = '__webauto_header_bar__';
          let bar = document.getElementById(id);
          if (!bar) {
            bar = document.createElement('div');
            bar.id = id;
            bar.style.position = 'fixed';
            bar.style.left = '0';
            bar.style.top = '0';
            bar.style.right = '0';
            bar.style.height = '22px';
            bar.style.zIndex = '2147483647';
            bar.style.display = 'flex';
            bar.style.alignItems = 'center';
            bar.style.padding = '0 10px';
            bar.style.fontSize = '12px';
            bar.style.fontFamily = 'system-ui, sans-serif';
            bar.style.fontWeight = '600';
            bar.style.color = '#fff';
            bar.style.pointerEvents = 'none';
            document.body.appendChild(bar);
            const html = document.documentElement;
            if (html) html.style.scrollPaddingTop = '22px';
          }
          bar.style.background = ${JSON.stringify(safeColor)};
          bar.textContent = ${JSON.stringify(label)};
          return true;
        } catch {
          return false;
        }
      })()`,
    }).catch((err) => ({ ok: false, error: (err as any)?.message || String(err) }));
  });
}
