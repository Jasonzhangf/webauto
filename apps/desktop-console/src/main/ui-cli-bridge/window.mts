import type { BrowserWindow } from 'electron';

export function isUiReady(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return false;
  const wc = win.webContents;
  if (!wc || wc.isDestroyed()) return false;
  if (typeof wc.isCrashed === 'function' && wc.isCrashed()) return false;
  return true;
}
