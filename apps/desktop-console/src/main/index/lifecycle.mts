import path from 'node:path';
import { promises as fs } from 'node:fs';
import { DESKTOP_LIFECYCLE_LOG_FILE, RUN_LOG_DIR } from './paths.mts';

export async function appendDesktopLifecycle(event: string, extra: Record<string, any> = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event: String(event || 'unknown').trim() || 'unknown',
    pid: process.pid,
    ...extra,
  };
  try {
    await fs.mkdir(path.dirname(DESKTOP_LIFECYCLE_LOG_FILE), { recursive: true });
    await fs.appendFile(DESKTOP_LIFECYCLE_LOG_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // ignore lifecycle log failures
  }
}

export function appendRunLog(runId: string, line: string) {
  const rid = String(runId || '').trim();
  const text = String(line || '').replace(/\r?\n/g, ' ').trim();
  if (!rid || !text) return;
  const logPath = path.join(RUN_LOG_DIR, `ui-run-${rid}.log`);
  void fs.mkdir(RUN_LOG_DIR, { recursive: true })
    .then(() => fs.appendFile(logPath, `${text}\n`, 'utf8'))
    .catch(() => {});
}
