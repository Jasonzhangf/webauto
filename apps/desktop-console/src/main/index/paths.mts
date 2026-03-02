import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, '../..');
export const REPO_ROOT = path.resolve(APP_ROOT, '../..');

export const DESKTOP_HEARTBEAT_FILE = path.join(
  os.homedir(),
  '.webauto',
  'run',
  'desktop-console-heartbeat.json',
);
export const DESKTOP_LIFECYCLE_LOG_FILE = path.join(
  os.homedir(),
  '.webauto',
  'logs',
  'desktop-lifecycle.jsonl',
);
export const RUN_LOG_DIR = path.join(os.homedir(), '.webauto', 'logs');

export const XHS_SCRIPTS_ROOT = path.join(REPO_ROOT, 'scripts', 'xiaohongshu');
export const XHS_FULL_COLLECT_RE = /collect-content\.mjs$/;

export function resolveUnifiedApiBaseUrl() {
  const candidates = [
    process.env.WEBAUTO_UNIFIED_API_BASE,
    process.env.WEBAUTO_UNIFIED_API,
    process.env.WEBAUTO_UNIFIED_URL,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (candidates.length > 0) return candidates[0];
  return 'http://127.0.0.1:7701';
}
