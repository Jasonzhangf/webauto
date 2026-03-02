import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, '..', '..');
export const DIST_MAIN = path.join(APP_ROOT, 'dist', 'main', 'index.mjs');

export function resolveDownloadRoot() {
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  if (process.platform === 'win32') {
    try {
      if (existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore
    }
    return path.join(os.homedir(), '.webauto');
  }
  return path.join(os.homedir(), '.webauto', 'download');
}

export function checkBuildStatus() {
  return existsSync(DIST_MAIN);
}

export function resolveElectronBin() {
  const distDir = path.join(APP_ROOT, 'node_modules', 'electron', 'dist');
  const candidates = process.platform === 'win32'
    ? [path.join(distDir, 'electron.exe')]
    : (process.platform === 'darwin'
      ? [
        path.join(distDir, 'electron'),
        path.join(distDir, 'Electron.app', 'Contents', 'MacOS', 'Electron'),
      ]
      : [path.join(distDir, 'electron')]);
  return candidates.find((item) => existsSync(item)) || candidates[0];
}
