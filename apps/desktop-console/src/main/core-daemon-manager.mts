import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const UNIFIED_API_HEALTH_URL = 'http://127.0.0.1:7701/health';
const CAMO_RUNTIME_HEALTH_URL = 'http://127.0.0.1:7704/health';
const CORE_HEALTH_URLS = [UNIFIED_API_HEALTH_URL, CAMO_RUNTIME_HEALTH_URL];
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
  const fromPath = resolveOnPath(process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node']);
  if (fromPath) return fromPath;
  return process.execPath;
}

function resolveNpxBin() {
  const fromPath = resolveOnPath(
    process.platform === 'win32'
      ? ['npx.cmd', 'npx.exe', 'npx.bat', 'npx.ps1']
      : ['npx'],
  );
  if (fromPath) return fromPath;
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function resolveOnPath(candidates: string[]): string | null {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function quoteCmdArg(value: string) {
  if (!value) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
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

async function isUnifiedApiHealthy() {
  return checkHttpHealth(UNIFIED_API_HEALTH_URL);
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
    const lower = String(command || '').toLowerCase();
    let spawnCommand = command;
    let spawnArgs = args;
    if (process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
      spawnCommand = 'cmd.exe';
      const cmdLine = [quoteCmdArg(command), ...args.map(quoteCmdArg)].join(' ');
      spawnArgs = ['/d', '/s', '/c', cmdLine];
    } else if (process.platform === 'win32' && lower.endsWith('.ps1')) {
      spawnCommand = 'powershell.exe';
      spawnArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', command, ...args];
    }
    const child = spawn(spawnCommand, spawnArgs, {
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

  const startedBrowser = await runCommand(
    resolveNpxBin(),
    ['--yes', '--package=@web-auto/camo', 'camo', 'init'],
    40_000,
  );
  if (!startedBrowser) {
    console.warn('[CoreDaemonManager] Failed to start camo browser backend, continue in degraded mode');
  }

  for (let i = 0; i < 20; i += 1) {
    const [allHealthy, unifiedHealthy] = await Promise.all([
      areCoreServicesHealthy(),
      isUnifiedApiHealthy(),
    ]);
    if (allHealthy) return true;
    if (unifiedHealthy) return true;
    await sleep(300);
  }

  console.error('[CoreDaemonManager] Unified API still unhealthy after start');
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
