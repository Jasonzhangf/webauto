import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

let coreDaemonProcess: ChildProcess | null = null;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export async function startCoreDaemon(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:7700/health', { signal: AbortSignal.timeout(1000) });
    if (res.ok) return true;
  } catch {}

  const scriptPath = path.join(REPO_ROOT, 'services/core-daemon/index.mjs');
  coreDaemonProcess = spawn('node', [scriptPath], {
    detached: true,
    stdio: 'ignore'
  });

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await fetch('http://127.0.0.1:7700/health', { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        console.log('[CoreDaemonManager] Started on port 7700');
        return true;
      }
    } catch {}
  }
  
  console.error('[CoreDaemonManager] Failed to start');
  return false;
}

export function stopCoreDaemon(): void {
  if (coreDaemonProcess) {
    coreDaemonProcess.kill();
    coreDaemonProcess = null;
  }
}
