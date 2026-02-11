import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let coreDaemonProcess: ChildProcess | null = null;

export async function startCoreDaemon(): Promise<boolean> {
  // Check if already running
  try {
    const res = await fetch('http://127.0.0.1:7700/health', { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      console.log('[CoreDaemonManager] Already running on port 7700');
      return true;
    }
  } catch {
    // Not running, start it
  }

  const scriptPath = path.join(__dirname, '../../services/core-daemon/index.mjs');
  coreDaemonProcess = spawn('node', [scriptPath], {
    detached: true,
    stdio: 'ignore'
  });

  // Wait for it to be ready
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:7700/health', { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        console.log('[CoreDaemonManager] Started successfully');
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
