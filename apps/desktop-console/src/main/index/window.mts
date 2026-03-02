import path from 'node:path';
import { BrowserWindow } from 'electron';
import { APP_ROOT } from './paths.mts';
import { appendDesktopLifecycle } from './lifecycle.mts';

export type WindowDeps = {
  versionInfo: { windowTitle: string };
  ensureStateBridge: () => void;
};

export function createMainWindow(deps: WindowDeps) {
  const win = new BrowserWindow({
    title: deps.versionInfo.windowTitle,
    width: 1280,
    height: 900,
    minWidth: 920,
    minHeight: 800,
    show: true,
    webPreferences: {
      preload: path.join(APP_ROOT, 'dist', 'main', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Prevent renderer timer throttling when app loses focus; heartbeat must remain stable.
      backgroundThrottling: false,
    },
  });

  const htmlPath = path.join(APP_ROOT, 'dist', 'renderer', 'index.html');
  void appendDesktopLifecycle('window_created', {
    width: win.getBounds().width,
    height: win.getBounds().height,
    title: deps.versionInfo.windowTitle,
  });
  win.on('close', () => {
    void appendDesktopLifecycle('window_close');
  });
  win.on('closed', () => {
    void appendDesktopLifecycle('window_closed');
  });
  win.on('unresponsive', () => {
    void appendDesktopLifecycle('window_unresponsive');
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    void appendDesktopLifecycle('render_process_gone', {
      reason: String(details?.reason || '').trim() || null,
      exitCode: Number.isFinite(Number(details?.exitCode)) ? Number(details?.exitCode) : null,
    });
  });
  win.webContents.on('did-fail-load', (_event, code, desc, validatedURL, isMainFrame) => {
    void appendDesktopLifecycle('did_fail_load', {
      code,
      desc: String(desc || ''),
      url: String(validatedURL || ''),
      isMainFrame: Boolean(isMainFrame),
    });
  });
  win.once('ready-to-show', () => {
    try {
      if (win?.isMinimized()) win.restore();
      win?.show();
      win?.focus();
      try { win?.setAlwaysOnTop(true); } catch {}
      setTimeout(() => {
        try { win?.setAlwaysOnTop(false); } catch {}
      }, 1200);
      void appendDesktopLifecycle('window_ready_show', {
        visible: win?.isVisible() ?? null,
        minimized: win?.isMinimized() ?? null,
      });
    } catch {
      // ignore show/focus errors
    }
  });
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    try {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      void appendDesktopLifecycle('window_show_retry', {
        visible: win.isVisible(),
        minimized: win.isMinimized(),
      });
    } catch {
      // ignore show/focus errors
    }
  }, 2000);
  void win.loadFile(htmlPath);
  deps.ensureStateBridge();

  return win;
}
