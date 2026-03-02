import path from 'node:path';
import { promises as fs } from 'node:fs';
import { DESKTOP_HEARTBEAT_FILE } from './paths.mts';

let coreServiceHeartbeatTimer: NodeJS.Timeout | null = null;
let coreServiceHeartbeatStopped = false;

async function writeCoreServiceHeartbeat(status: 'running' | 'stopped') {
  const filePath = String(process.env.WEBAUTO_HEARTBEAT_FILE || DESKTOP_HEARTBEAT_FILE).trim() || DESKTOP_HEARTBEAT_FILE;
  const payload = {
    pid: process.pid,
    ts: new Date().toISOString(),
    status,
    source: 'desktop-console',
  };
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
  } catch {
    // ignore heartbeat write errors
  }
}

export function startCoreServiceHeartbeat() {
  const filePath = String(process.env.WEBAUTO_HEARTBEAT_FILE || DESKTOP_HEARTBEAT_FILE).trim() || DESKTOP_HEARTBEAT_FILE;
  process.env.WEBAUTO_HEARTBEAT_FILE = filePath;
  if (!process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS) process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS = '5000';
  if (!process.env.WEBAUTO_HEARTBEAT_STALE_MS) process.env.WEBAUTO_HEARTBEAT_STALE_MS = '45000';

  coreServiceHeartbeatStopped = false;
  void writeCoreServiceHeartbeat('running');
  if (coreServiceHeartbeatTimer) clearInterval(coreServiceHeartbeatTimer);
  coreServiceHeartbeatTimer = setInterval(() => {
    if (coreServiceHeartbeatStopped) return;
    void writeCoreServiceHeartbeat('running');
  }, 5000);
  coreServiceHeartbeatTimer.unref();
}

export function stopCoreServiceHeartbeat() {
  if (coreServiceHeartbeatStopped) return;
  coreServiceHeartbeatStopped = true;
  if (coreServiceHeartbeatTimer) {
    clearInterval(coreServiceHeartbeatTimer);
    coreServiceHeartbeatTimer = null;
  }
  void writeCoreServiceHeartbeat('stopped');
}
