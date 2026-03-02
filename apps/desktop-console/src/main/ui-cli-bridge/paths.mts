import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

function normalizePathForPlatform(raw: string, platform = process.platform) {
  const input = String(raw || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(input);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(input) : path.resolve(input);
}

function normalizeLegacyWebautoRoot(raw: string, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const resolved = normalizePathForPlatform(raw, platform);
  const base = pathApi.basename(resolved).toLowerCase();
  return (base === '.webauto' || base === 'webauto')
    ? resolved
    : pathApi.join(resolved, '.webauto');
}

export function resolveWebautoRoot() {
  const explicitHome = String(process.env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome);

  const legacyRoot = String(process.env.WEBAUTO_ROOT || process.env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot);

  if (process.platform === 'win32') {
    try {
      if (existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore drive probing errors
    }
    return path.join(os.homedir(), '.webauto');
  }
  return path.join(os.homedir(), '.webauto');
}

export function resolveControlFile() {
  return path.join(resolveWebautoRoot(), 'run', 'ui-cli.json');
}

export function resolveActionLogFile() {
  return path.join(resolveWebautoRoot(), 'logs', 'ui-cli-actions.jsonl');
}
