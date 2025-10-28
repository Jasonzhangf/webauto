import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync, rmSync } from 'node:fs';

const baseDir = join(homedir(), '.webauto', 'sessions');

export function getBaseDir() {
  try { mkdirSync(baseDir, { recursive: true }); } catch {}
  return baseDir;
}

export function getSessionDir(sessionId) {
  return join(getBaseDir(), sessionId);
}

export function ensureSessionDir(sessionId) {
  const dir = getSessionDir(sessionId);
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

export function destroySessionDir(sessionId) {
  const dir = getSessionDir(sessionId);
  if (existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export default { getBaseDir, getSessionDir, ensureSessionDir, destroySessionDir };

