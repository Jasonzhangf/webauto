import { spawn } from 'node:child_process';

const spawnedBrowserProcesses = new Set<number>();

export function trackBrowserProcess(pid: number) {
  if (pid > 0) {
    spawnedBrowserProcesses.add(pid);
  }
}

export function safeConsole(method: 'log' | 'warn', ...args: any[]) {
  try {
    const fn = console[method];
    if (typeof fn === 'function') fn(...args);
  } catch {
    // Ignore EPIPE/stream-closed console errors during shutdown.
  }
}

export function cleanupAllBrowserProcesses(reason: string = 'ui_close') {
  safeConsole('log', `[process-cleanup] Cleaning up ${spawnedBrowserProcesses.size} browser process(s) (${reason})`);
  for (const pid of spawnedBrowserProcesses) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch (err) {
      safeConsole('warn', `[process-cleanup] Failed to kill PID ${pid}:`, err);
    }
  }
  spawnedBrowserProcesses.clear();
  safeConsole('log', '[process-cleanup] Cleanup complete');
}
