import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const UNIFIED_API_HEALTH_URL = 'http://127.0.0.1:7701/health';
const CAMO_RUNTIME_HEALTH_URL = 'http://127.0.0.1:7704/health';
const CORE_HEALTH_URLS = [UNIFIED_API_HEALTH_URL, CAMO_RUNTIME_HEALTH_URL];
const START_API_SCRIPT = path.join(REPO_ROOT, 'runtime', 'infra', 'utils', 'scripts', 'service', 'start-api.mjs');
const STOP_API_SCRIPT = path.join(REPO_ROOT, 'runtime', 'infra', 'utils', 'scripts', 'service', 'stop-api.mjs');
const START_SEARCH_GATE_SCRIPT = path.join(REPO_ROOT, 'runtime', 'infra', 'utils', 'scripts', 'service', 'start-search-gate.mjs');
const STOP_SEARCH_GATE_SCRIPT = path.join(REPO_ROOT, 'runtime', 'infra', 'utils', 'scripts', 'service', 'stop-search-gate.mjs');
const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveNodeBin() {
  const explicit = String(process.env.WEBAUTO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode && existsSync(npmNode)) return npmNode;
  const fromPath = resolveOnPath(process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node']);
  if (fromPath) return fromPath;
  if (process.platform === 'darwin') {
    for (const candidate of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']) {
      if (existsSync(candidate)) return candidate;
    }
  }
  if (process.platform === 'linux') {
    for (const candidate of ['/usr/bin/node', '/usr/local/bin/node']) {
      if (existsSync(candidate)) return candidate;
    }
  }
  if (process.platform === 'win32') {
    const winCandidates = [
      path.join(String(process.env.ProgramFiles || 'C:\\Program Files'), 'nodejs', 'node.exe'),
      path.join(String(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'), 'nodejs', 'node.exe'),
      path.join(String(process.env.LOCALAPPDATA || ''), 'Programs', 'nodejs', 'node.exe'),
    ].filter((item) => String(item || '').trim().length > 0);
    for (const candidate of winCandidates) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
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

function resolveCamoCliEntry() {
  const direct = path.join(REPO_ROOT, 'node_modules', '@web-auto', 'camo', 'bin', 'camo.mjs');
  if (existsSync(direct)) return direct;
  try {
    const resolved = requireFromRepo.resolve('@web-auto/camo/bin/camo.mjs');
    if (resolved && existsSync(resolved)) return resolved;
  } catch {
    // ignore resolution errors
  }
  return null;
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
  const searchGateHealthy = await checkHttpHealth('http://127.0.0.1:7790/health');
  return health.every(Boolean) && searchGateHealthy;
}

type RunResult = {
  ok: boolean;
  code: number | null;
  error: string;
};

async function runNodeScript(scriptPath: string, timeoutMs: number, args: string[] = [], envExtra: Record<string, string> = {}) {
  return new Promise<RunResult>((resolve) => {
    const nodeBin = resolveNodeBin();
    const child = spawn(nodeBin, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        ...envExtra,
      },
    });
    const stderrLines: string[] = [];
    const stdoutLines: string[] = [];
    child.stdout?.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;
      stdoutLines.push(text);
      if (stdoutLines.length > 6) stdoutLines.shift();
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;
      stderrLines.push(text);
      if (stderrLines.length > 6) stderrLines.shift();
    });

    const summarize = (prefix: string) => {
      const stderr = stderrLines.join('\n').trim();
      const stdout = stdoutLines.join('\n').trim();
      if (stderr) return `${prefix}: ${stderr}`;
      if (stdout) return `${prefix}: ${stdout}`;
      return prefix;
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
      resolve({ ok: false, code: null, error: summarize('timeout') });
    }, timeoutMs);

    child.once('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, error: summarize(err?.message || 'spawn_error') });
    });

    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, code, error: '' });
        return;
      }
      resolve({ ok: false, code, error: summarize(`exit ${code ?? 'null'}`) });
    });
  });
}

export async function startCoreDaemon(): Promise<boolean> {
  if (await areCoreServicesHealthy()) return true;

  if (!existsSync(START_API_SCRIPT)) {
    console.error('[CoreDaemonManager] Unified API start script not found');
    return false;
  }
  const startedApi = await runNodeScript(START_API_SCRIPT, 40_000, [], {
    BROWSER_SERVICE_AUTO_EXIT: '0',
  });
  if (!startedApi.ok) {
    console.error(`[CoreDaemonManager] Failed to start unified API service (${startedApi.error || 'unknown'})`);
    return false;
  }

  const camoEntry = resolveCamoCliEntry();
  if (!camoEntry) {
    console.error('[CoreDaemonManager] Camo CLI entry not found: @web-auto/camo/bin/camo.mjs');
    return false;
  }
  const startedBrowser = await runNodeScript(camoEntry, 60_000, ['init']);
  if (!startedBrowser.ok) {
    console.error(`[CoreDaemonManager] Failed to start camo browser backend (${startedBrowser.error || 'unknown'})`);
    return false;
  }

  if (!existsSync(START_SEARCH_GATE_SCRIPT)) {
    console.error('[CoreDaemonManager] SearchGate start script not found');
    return false;
  }
  const startedGate = await runNodeScript(START_SEARCH_GATE_SCRIPT, 40_000, [], {
    WEBAUTO_SEARCH_GATE_DISABLE_HEARTBEAT: '1',
  });
  if (!startedGate.ok) {
    console.error(`[CoreDaemonManager] Failed to start SearchGate (${startedGate.error || 'unknown'})`);
    return false;
  }

  for (let i = 0; i < 60; i += 1) {
    const allHealthy = await areCoreServicesHealthy();
    if (allHealthy) return true;
    await sleep(500);
  }

  console.error('[CoreDaemonManager] Core services still unhealthy after start');
  return false;
}

export async function stopCoreDaemon(): Promise<boolean> {
  if (!existsSync(STOP_API_SCRIPT)) {
    console.error('[CoreDaemonManager] Unified API stop script not found');
    return false;
  }

  if (existsSync(STOP_SEARCH_GATE_SCRIPT)) {
    const stoppedGate = await runNodeScript(STOP_SEARCH_GATE_SCRIPT, 20_000);
    if (!stoppedGate.ok) {
      console.error(`[CoreDaemonManager] Failed to stop SearchGate (${stoppedGate.error || 'unknown'})`);
      return false;
    }
  } else {
    console.error('[CoreDaemonManager] SearchGate stop script not found');
    return false;
  }

  const stoppedApi = await runNodeScript(STOP_API_SCRIPT, 20_000);
  if (!stoppedApi.ok) {
    console.error(`[CoreDaemonManager] Failed to stop core services (${stoppedApi.error || 'unknown'})`);
    return false;
  }
  return true;
}
