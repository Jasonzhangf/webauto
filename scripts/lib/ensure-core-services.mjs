import { spawn } from 'node:child_process';

/**
 * Ensure all core services are running by delegating to core-daemon.
 *
 * Requirement:
 * - Scripts should not implement service orchestration logic.
 * - Use core-daemon as the single source of truth for lifecycle management.
 */
export async function ensureCoreServices({ timeoutMs = 120000 } = {}) {
  const start = Date.now();

  // Prefer using core-daemon, which knows how to start/stop/status services.
  const child = spawn('node', ['scripts/core-daemon.mjs', 'start'], {
    stdio: 'inherit',
    detached: false,
  });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      reject(new Error(`core-daemon start timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (c) => {
      clearTimeout(timer);
      resolve(c ?? 1);
    });
  });

  if (code !== 0) {
    throw new Error(`core-daemon start failed (exit code ${code})`);
  }

  const elapsed = Date.now() - start;
  if (elapsed > timeoutMs) {
    throw new Error(`core-daemon start exceeded timeout (${elapsed}ms)`);
  }
}

