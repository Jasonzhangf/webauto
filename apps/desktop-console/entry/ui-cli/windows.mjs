import {
  parseIntSafe,
} from './constants.mjs';
import { runCommandCapture } from './process.mjs';

export async function resolveWindowsProcessSessionId(pid, timeoutMs = 4_000) {
  if (process.platform !== 'win32') return null;
  const targetPid = parseIntSafe(pid, 0);
  if (targetPid <= 0) return null;
  const psScript = [
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${targetPid}" | Select-Object -First 1 -ExpandProperty SessionId`,
    'if ($null -ne $p) { Write-Output $p }',
  ].join('; ');
  const ret = await runCommandCapture('powershell', ['-NoProfile', '-Command', psScript], timeoutMs);
  if (!ret.ok) return null;
  const sid = Number(String(ret.stdout || '').trim());
  return Number.isFinite(sid) ? Math.floor(sid) : null;
}

let cachedCurrentWindowsSessionId = null;
export async function resolveCurrentWindowsSessionId() {
  if (process.platform !== 'win32') return null;
  if (Number.isFinite(cachedCurrentWindowsSessionId)) return cachedCurrentWindowsSessionId;
  const sid = await resolveWindowsProcessSessionId(process.pid, 3_000);
  if (!Number.isFinite(sid)) return null;
  cachedCurrentWindowsSessionId = sid;
  return sid;
}

export async function detectWindowsSessionMismatch(targetPid) {
  if (process.platform !== 'win32') {
    return { mismatch: false, currentSessionId: null, targetSessionId: null };
  }
  const pid = parseIntSafe(targetPid, 0);
  if (pid <= 0) {
    return { mismatch: false, currentSessionId: null, targetSessionId: null };
  }
  const [currentSessionId, targetSessionId] = await Promise.all([
    resolveCurrentWindowsSessionId(),
    resolveWindowsProcessSessionId(pid),
  ]);
  const mismatch = Number.isFinite(currentSessionId)
    && Number.isFinite(targetSessionId)
    && currentSessionId > 0
    && targetSessionId === 0;
  return {
    mismatch,
    currentSessionId: Number.isFinite(currentSessionId) ? currentSessionId : null,
    targetSessionId: Number.isFinite(targetSessionId) ? targetSessionId : null,
  };
}
