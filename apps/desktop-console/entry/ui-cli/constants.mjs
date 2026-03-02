import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, '..', '..');
export const ROOT = path.resolve(APP_ROOT, '..', '..');

export const DEFAULT_HOST = process.env.WEBAUTO_UI_CLI_HOST || '127.0.0.1';
export const DEFAULT_PORT = Number(process.env.WEBAUTO_UI_CLI_PORT || 7716);

export function readEnvPositiveInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const DEFAULT_HTTP_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_HTTP_TIMEOUT_MS', 25_000);
export const DEFAULT_HTTP_RETRIES = readEnvPositiveInt('WEBAUTO_UI_CLI_HTTP_RETRIES', 1);
export const DEFAULT_START_HEALTH_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_START_HEALTH_TIMEOUT_MS', 8_000);
export const DEFAULT_STATUS_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_STATUS_TIMEOUT_MS', 45_000);
export const DEFAULT_ACTION_HTTP_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_ACTION_HTTP_TIMEOUT_MS', 40_000);
export const DEFAULT_START_READY_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_START_READY_TIMEOUT_MS', 90_000);
export const DEFAULT_START_ACTION_READY_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_START_ACTION_READY_TIMEOUT_MS', 20_000);

export function normalizePathForPlatform(raw, platform = process.platform) {
  const input = String(raw || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(input);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(input) : path.resolve(input);
}

export function normalizeLegacyWebautoRoot(raw, platform = process.platform) {
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

export const CONTROL_FILE = path.join(resolveWebautoRoot(), 'run', 'ui-cli.json');
export const DIST_MAIN = path.join(APP_ROOT, 'dist', 'main', 'index.mjs');
export const DESKTOP_MAIN_MARKER = String(DIST_MAIN || '').replace(/\\/g, '/').toLowerCase();

export function readControlFile() {
  try {
    if (!existsSync(CONTROL_FILE)) return null;
    const raw = JSON.parse(readFileSync(CONTROL_FILE, 'utf8'));
    const host = String(raw?.host || '').trim() || DEFAULT_HOST;
    const port = parseIntSafe(raw?.port, DEFAULT_PORT);
    const pid = parseIntSafe(raw?.pid, 0);
    return {
      host,
      port,
      pid: pid > 0 ? pid : null,
      startedAt: String(raw?.startedAt || '').trim() || null,
    };
  } catch {
    return null;
  }
}

export function removeControlFileIfPresent() {
  try {
    rmSync(CONTROL_FILE, { force: true });
  } catch {
    // ignore
  }
}

export function resolveEndpoint(args = {}) {
  const fromFile = readControlFile();
  const host = String(args.host || fromFile?.host || DEFAULT_HOST).trim();
  const port = parseIntSafe(args.port || fromFile?.port, DEFAULT_PORT);
  return { host, port };
}

export function parseIntSafe(input, fallback) {
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function buildUiCliClientMeta(cmd = '') {
  return {
    client: 'webauto-ui-cli',
    cmd: String(cmd || '').trim() || null,
    pid: process.pid,
    ppid: process.ppid,
  };
}
