import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CORE_DAEMON_SCRIPT = path.join(REPO_ROOT, 'scripts', 'core-daemon.mjs');
const CORE_HEALTH_URLS = ['http://127.0.0.1:7701/health', 'http://127.0.0.1:7704/health'];
const DESKTOP_HEARTBEAT_FILE = path.join(os.homedir(), '.webauto', 'run', 'desktop-console-heartbeat.json');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveNodeBin() {
  const explicit = String(process.env.WEBAUTO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode) return npmNode;
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

async function checkHttpHealth(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function areCoreServicesHealthy() {
  const health = await Promise.all(CORE_HEALTH_URLS.map((url) => checkHttpHealth(url)));
  return health.every(Boolean);
}

type CoreDaemonCommand = 'start' | 'stop';

async function runCoreDaemon(command: CoreDaemonCommand, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const nodeBin = resolveNodeBin();
    const child = spawn(nodeBin, [CORE_DAEMON_SCRIPT, command], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        WEBAUTO_DAEMON: '1',
        WEBAUTO_HEARTBEAT_FILE: String(process.env.WEBAUTO_HEARTBEAT_FILE || DESKTOP_HEARTBEAT_FILE),
        // Keep browser-service alive while Desktop UI is open.
        BROWSER_SERVICE_AUTO_EXIT: '0',
      },
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
      resolve(false);
    }, timeoutMs);

    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function startCoreDaemon(): Promise<boolean> {
  if (await areCoreServicesHealthy()) return true;
  const started = await runCoreDaemon('start', 60_000);
  if (!started) {
    console.error('[CoreDaemonManager] Failed to execute core-daemon start');
    return false;
  }

  for (let i = 0; i < 20; i += 1) {
    if (await areCoreServicesHealthy()) return true;
    await sleep(300);
  }

  console.error('[CoreDaemonManager] Services still unhealthy after start');
  return false;
}

export async function stopCoreDaemon(): Promise<boolean> {
  const stopped = await runCoreDaemon('stop', 30_000);
  if (!stopped) {
    console.error('[CoreDaemonManager] Failed to execute core-daemon stop');
    return false;
  }
  return true;
}
