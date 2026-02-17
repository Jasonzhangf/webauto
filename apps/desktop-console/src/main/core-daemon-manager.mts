import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CORE_HEALTH_URLS = ['http://127.0.0.1:7701/health', 'http://127.0.0.1:7704/health'];
const START_API_SCRIPT = path.join(REPO_ROOT, 'runtime', 'infra', 'utils', 'scripts', 'service', 'start-api.mjs');
const STOP_API_SCRIPT = path.join(REPO_ROOT, 'runtime', 'infra', 'utils', 'scripts', 'service', 'stop-api.mjs');

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

async function runNodeScript(scriptPath: string, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const nodeBin = resolveNodeBin();
    const child = spawn(nodeBin, [scriptPath], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
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

async function runCommand(command: string, args: string[], timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
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

  const startedApi = await runNodeScript(START_API_SCRIPT, 40_000);
  if (!startedApi) {
    console.error('[CoreDaemonManager] Failed to start unified API service');
    return false;
  }

  const startedBrowser = await runCommand('npx', ['--yes', '@web-auto/camo', 'init'], 40_000);
  if (!startedBrowser) {
    console.error('[CoreDaemonManager] Failed to start camo browser backend');
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
  const stoppedApi = await runNodeScript(STOP_API_SCRIPT, 20_000);
  if (!stoppedApi) {
    console.error('[CoreDaemonManager] Failed to stop core services');
    return false;
  }
  return true;
}
