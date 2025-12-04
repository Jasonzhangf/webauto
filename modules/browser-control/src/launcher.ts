import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

export interface LaunchOptions {
  host?: string;
  port?: number;
  wsHost?: string;
  wsPort?: number;
  profile?: string;
  headless?: boolean;
  url?: string;
  restart?: boolean;
  devConsole?: boolean;
}

export interface LaunchResult {
  success: boolean;
  message?: string;
  sessionId?: string;
  profile: string;
  url?: string;
  headless: boolean;
  baseUrl: string;
  wsUrl: string;
  matchSuccess?: boolean;
  matchContainerId?: string;
  testMode?: boolean;
}

export interface StopOptions {
  host?: string;
  port?: number;
  profile: string;
}

export interface StopResult {
  success: boolean;
  message?: string;
}

export interface StatusOptions {
  host?: string;
  port?: number;
}

export interface ServiceStatus {
  success: boolean;
  healthy: boolean;
  sessions: any[];
  data?: any;
  message?: string;
}

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const FLOATING_APP_DIR = path.join(ROOT_DIR, 'apps', 'floating-panel');
const WORKFLOW_ENTRY = path.join(ROOT_DIR, 'dist', 'sharedmodule', 'engines', 'api-gateway', 'server.js');
const WORKFLOW_REQUIRED_FILES = [
  WORKFLOW_ENTRY,
  path.join(ROOT_DIR, 'dist', 'libs', 'browser', 'cookie-manager.js'),
  path.join(ROOT_DIR, 'dist', 'services', 'browser-service', 'index.js'),
];
const LIB_BROWSER_SRC = path.join(ROOT_DIR, 'libs', 'browser');
const LIB_BROWSER_DEST = path.join(ROOT_DIR, 'dist', 'libs', 'browser');
const DEFAULT_WS_HOST = '127.0.0.1';
const DEFAULT_WS_PORT = 8765;
interface BrowserServiceConfig {
  host: string;
  port: number;
  backend?: { baseUrl?: string };
}

function loadLocalBrowserConfig(): BrowserServiceConfig {
  const fallback: BrowserServiceConfig = {
    host: '0.0.0.0',
    port: 7704,
    backend: { baseUrl: 'http://127.0.0.1:7701' },
  };
  try {
    const configPath = path.join(ROOT_DIR, 'config', 'browser-service.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const overrides = JSON.parse(raw);
    return {
      host: overrides.host || fallback.host,
      port: Number(overrides.port || fallback.port),
      backend: overrides.backend || fallback.backend,
    };
  } catch {
    return fallback;
  }
}

const cfg = loadLocalBrowserConfig();
const WORKFLOW_BASE = (cfg.backend?.baseUrl || 'http://127.0.0.1:7701').replace(/\/$/, '');
const WORKFLOW_URL = new URL(WORKFLOW_BASE);
const IS_LOCAL_WORKFLOW = ['localhost', '127.0.0.1', '::1'].includes(WORKFLOW_URL.hostname);

function isTestMode() {
  return process.env.BROWSER_CONTROL_TEST_MODE === '1';
}

function resolveLaunchOptions(options: LaunchOptions): Required<LaunchOptions> {
  return {
    host: options.host ?? cfg.host ?? '0.0.0.0',
    port: options.port ?? Number(cfg.port || 7704),
    wsHost: options.wsHost ?? DEFAULT_WS_HOST,
    wsPort: options.wsPort ?? DEFAULT_WS_PORT,
    profile: options.profile ?? 'default',
    headless: options.headless ?? false,
    url: options.url ?? '',
    restart: options.restart ?? false,
    devConsole: options.devConsole ?? true,
  };
}

export async function launchOneClick(options: LaunchOptions = {}): Promise<LaunchResult> {
  const resolved = resolveLaunchOptions(options);
  const { port, host, headless, profile, url, restart, devConsole, wsHost, wsPort } = resolved;
  const baseHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const base = `http://${baseHost}:${port}`;
  const wsUrl = `ws://${wsHost}:${wsPort}`;

  if (isTestMode()) {
    return {
      success: true,
      sessionId: profile,
      profile,
      url,
      headless,
      baseUrl: base,
      wsUrl,
      matchSuccess: true,
      matchContainerId: 'test_container',
      message: 'test-mode launch completed',
      testMode: true,
    };
  }

  await ensureWorkflowApi();
  if (restart) {
    await runNodeScript('runtime/infra/utils/scripts/service/restart-browser-service.mjs', []);
  }

  let healthy = await waitHealth(`${base}/health`, 1000);
  let serviceChild: ChildProcess | null = null;
  const ensureBrowserService = async () => {
    if (healthy) return;
    for (let attempt = 0; attempt < 3 && !healthy; attempt++) {
      killBrowserServiceProcesses();
      killPort(port);
      killPort(wsPort);
      await wait(800);
      const child = spawn(process.execPath, [
        path.join('libs', 'browser', 'remote-service.js'),
        '--host',
        String(host),
        '--port',
        String(port),
        '--ws-host',
        String(wsHost),
        '--ws-port',
        String(wsPort),
      ], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: { ...process.env, BROWSER_SERVICE_AUTO_EXIT: '0' },
      });
      serviceChild = child;
      child.on('exit', (code) => {
        if (serviceChild !== child) return;
        if (code === 0) {
          process.exit(0);
        } else {
          console.warn(`[browser-control] browser service exited with code ${code}`);
        }
      });
      child.on('error', (err) => {
        console.warn('[browser-control] browser service spawn failed:', err?.message || String(err));
      });
      healthy = await waitHealth(`${base}/health`, 4000);
      if (healthy) return;
    }
    throw new Error(`[browser-control] browser service not healthy on :${port}`);
  };
  await ensureBrowserService();
  const exclusivityReady = await ensureExclusiveProfile(base, profile);
  if (exclusivityReady === false) {
    killBrowserServiceProcesses();
    killPort(port);
    killPort(wsPort);
    await wait(800);
    healthy = false;
    await ensureBrowserService();
    await ensureExclusiveProfile(base, profile);
  }

  const startRes = await post(`${base}/command`, {
    action: 'start',
    args: { headless, profileId: profile, url },
  });
  if (!(startRes && startRes.ok)) {
    throw new Error('[browser-control] start failed');
  }
  const sessionId = startRes.sessionId || startRes.profileId || profile;

  try {
    await post(`${base}/command`, {
      action: 'autoCookies:start',
      args: { profileId: profile, intervalMs: 2500 },
    });
  } catch {}

  let matchResult: any = null;
  if (url) {
    let gotoRes: any = null;
    try {
      gotoRes = await post(`${base}/command`, {
        action: 'goto',
        args: { url, profileId: profile, waitTime: 2, keepOpen: !headless },
      });
    } catch (err) {
      console.warn('[browser-control] goto failed:', (err as Error)?.message || String(err));
    }
    if (gotoRes && gotoRes.ok) {
      const cookiePath = url.includes('weibo.com')
        ? path.join(os.homedir(), '.webauto', 'cookies', 'weibo-domestic.json')
        : path.join(os.homedir(), '.webauto', 'cookies', 'visited-default.json');
      try {
        await post(`${base}/command`, { action: 'saveCookies', args: { path: cookiePath, profileId: profile } });
      } catch (err) {
        console.warn('[browser-control] saveCookies failed:', err?.message || String(err));
      }
      try {
        matchResult = await autoMatchRootContainer({
          sessionId,
          url,
          wsUrl,
        });
      } catch (err) {
        console.warn('[browser-control] match root failed:', err?.message || String(err));
      }
    }
  }

  if (devConsole) {
    await launchFloatingConsole(wsHost, wsPort, url);
  }

  const matchContainer = matchResult?.data?.data?.matched_container || matchResult?.data?.matched_container;
  const matchContainerId = matchContainer?.id || matchContainer?.container?.id;
  const matchSuccess = Boolean(matchResult?.data?.success);

  return {
    success: Boolean(matchResult ? matchResult?.data?.success : true),
    sessionId,
    profile,
    url,
    headless,
    baseUrl: base,
    wsUrl,
    matchSuccess,
    matchContainerId,
    message: matchSuccess ? 'launch complete' : 'launch complete but container match failed',
  };
}

export async function stopProfile(options: StopOptions): Promise<StopResult> {
  const resolved = resolveLaunchOptions(options);
  const profile = options.profile;
  if (isTestMode()) {
    return { success: true, message: `test-mode stop ${profile}` };
  }
  if (!profile) {
    throw new Error('stop requires profile');
  }
  const baseHost = resolved.host === '0.0.0.0' ? '127.0.0.1' : resolved.host!;
  const base = `http://${baseHost}:${resolved.port}`;
  try {
    const response = await post(`${base}/command`, { action: 'stop', args: { profileId: profile } });
    if (response?.ok) {
      return { success: true, message: `profile ${profile} stopped` };
    }
    return { success: false, message: response?.error || 'stop failed' };
  } catch (err) {
    return { success: false, message: err?.message || String(err) };
  }
}

export async function getServiceStatus(options: StatusOptions = {}): Promise<ServiceStatus> {
  if (isTestMode()) {
    return {
      success: true,
      healthy: true,
      sessions: [],
      data: { sessions: [], ok: true },
      message: 'test-mode status',
    };
  }
  const resolved = resolveLaunchOptions(options);
  const baseHost = resolved.host === '0.0.0.0' ? '127.0.0.1' : resolved.host!;
  const base = `http://${baseHost}:${resolved.port}`;
  const healthy = await waitHealth(`${base}/health`, 3000);
  if (!healthy) {
    return { success: false, healthy: false, sessions: [], message: 'browser service unhealthy' };
  }
  try {
    const status = await post(`${base}/command`, { action: 'getStatus' });
    const sessions = Array.isArray(status?.sessions) ? status.sessions : [];
    return { success: true, healthy: true, sessions, data: status };
  } catch (err) {
    return { success: false, healthy: true, sessions: [], message: err?.message || String(err) };
  }
}

async function ensureWorkflowApi() {
  if (isTestMode()) return;
  const healthUrl = `${WORKFLOW_BASE}/health`;
  const healthy = await waitHealth(healthUrl, 1000);
  if (healthy) return;
  if (!IS_LOCAL_WORKFLOW) {
    throw new Error(`Workflow API (${WORKFLOW_BASE}) unavailable`);
  }
  if (!workflowDistReady()) {
    console.log('[browser-control] Workflow API missing, running npm run build:services');
    await runNpmCommand(['run', 'build:services']);
    copyBrowserLibs();
    if (!workflowDistReady()) {
      throw new Error('Workflow API outputs missing after build');
    }
  } else {
    copyBrowserLibs();
  }
  console.log(`[browser-control] starting Workflow API (${WORKFLOW_BASE})...`);
  const server = spawn(process.execPath, [WORKFLOW_ENTRY], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  });
  server.unref();
  const ready = await waitHealth(healthUrl, 20000);
  if (!ready) {
    throw new Error(`Workflow API not ready at ${WORKFLOW_BASE}`);
  }
}

function workflowDistReady() {
  return WORKFLOW_REQUIRED_FILES.every((file) => fs.existsSync(file));
}

async function ensureExclusiveProfile(baseUrl: string, profileId: string) {
  if (isTestMode()) return true;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const sessions = await listActiveSessions(baseUrl);
    const duplicates = sessions.filter((session) => {
      const pid = session.profileId || session.profile_id || session.session_id;
      return pid === profileId;
    });
    if (!duplicates.length) {
      return true;
    }
    if (attempt === 0) {
      console.log(`[browser-control] found ${duplicates.length} sessions for profile=${profileId}, cleaning...`);
    }
    const targets = Array.from(new Set(duplicates.map((session) => session.profileId || session.profile_id || profileId)));
    for (const target of targets) {
      try {
        await post(`${baseUrl}/command`, { action: 'stop', args: { profileId: target } });
        console.log(`[browser-control] closed old session profile=${target}`);
      } catch (err) {
        const message = err?.message || '';
        if (message.includes('Unknown action: stop')) {
          console.warn('[browser-control] stop unsupported, need service restart');
          return false;
        }
        console.warn(`[browser-control] failed to close profile=${target}:`, message || err);
      }
    }
    await wait(600);
  }
  throw new Error(`[browser-control] unable to clean profile=${profileId} sessions`);
}

async function listActiveSessions(baseUrl: string) {
  try {
    const status = await post(`${baseUrl}/command`, { action: 'getStatus' });
    const sessions = status?.sessions || [];
    return Array.isArray(sessions) ? sessions : [];
  } catch (err) {
    console.warn('[browser-control] list sessions failed:', err?.message || String(err));
    return [];
  }
}

async function launchFloatingConsole(wsHost: string, wsPort: number, targetUrl?: string) {
  if (isTestMode()) return;
  if (!fs.existsSync(path.join(FLOATING_APP_DIR, 'package.json'))) {
    console.warn('[browser-control] floating console not installed, skip');
    return;
  }
  killFloatingPanelProcesses();
  const ready = await waitForSocket(wsHost, wsPort, 8000);
  if (!ready) {
    console.warn(`[browser-control] ws://${wsHost}:${wsPort} not ready, UI will retry`);
  }
  const wsUrl = `ws://${wsHost}:${wsPort}`;
  const env: Record<string, string> = { WEBAUTO_FLOATING_WS_URL: wsUrl };
  if (targetUrl) {
    env.WEBAUTO_FLOATING_TARGET_URL = targetUrl;
  }
  const uiProc = spawnNpmDev(env);
  const cleanup = () => {
    if (uiProc && !uiProc.killed) {
      uiProc.kill();
    }
  };
  const signalHandler = () => {
    cleanup();
    process.exit();
  };
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  try {
    await new Promise<void>((resolve, reject) => {
      uiProc.on('exit', (code) => {
        console.log(`[browser-control] floating console exited (code=${code ?? 0})`);
        resolve();
      });
      uiProc.on('error', (err) => {
        console.error('[browser-control] floating console failed:', err?.message || String(err));
        reject(err);
      });
    });
  } finally {
    cleanup();
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
  }
}

function waitForSocket(host: string, port: number, timeoutMs = 8000) {
  return new Promise<boolean>((resolve) => {
    const start = Date.now();
    const attempt = () => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

function spawnNpmDev(extraEnv: Record<string, string> = {}) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    WEBAUTO_FLOATING_DISABLE_DEVTOOLS: process.env.WEBAUTO_FLOATING_DISABLE_DEVTOOLS || '1',
    ...extraEnv,
  };
  return spawn(npmCmd, ['run', 'dev'], {
    cwd: FLOATING_APP_DIR,
    stdio: 'inherit',
    env,
  });
}

async function post(url: string, body: any) {
  if (isTestMode()) {
    if (body?.action === 'start') {
      return { ok: true, sessionId: body?.args?.profileId };
    }
    if (body?.action === 'getStatus') {
      return { ok: true, sessions: [] };
    }
    if (body?.action === 'stop') {
      return { ok: true };
    }
    if (body?.action === 'goto') {
      return { ok: true, info: { title: 'test' } };
    }
    if (body?.action === 'saveCookies') {
      return { ok: true };
    }
    if (body?.action?.startsWith('autoCookies')) {
      return { ok: true };
    }
    return { ok: true };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, raw: text };
  }
}

function waitHealth(url: string, timeoutMs = 15000) {
  if (isTestMode()) return Promise.resolve(true);
  const t0 = Date.now();
  const loop = async (): Promise<boolean> => {
    if (Date.now() - t0 >= timeoutMs) {
      return false;
    }
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await wait(300);
    return loop();
  };
  return loop();
}

async function autoMatchRootContainer({ sessionId, url, wsUrl }: { sessionId: string; url: string; wsUrl: string }) {
  if (isTestMode()) {
    return {
      data: {
        success: true,
        data: {
          matched_container: {
            id: 'test_container',
          },
        },
      },
    };
  }
  if (!sessionId || !url) return null;
  console.log(`[browser-control] matching root container via ${wsUrl} (${url})`);
  const payload = {
    type: 'command',
    session_id: sessionId,
    data: {
      command_type: 'container_operation',
      action: 'match_root',
      page_context: { url },
    },
  };
  const response = await sendWsCommand(wsUrl, payload);
  if (response?.data?.success) {
    const match = response.data.data || {};
    const container = match.matched_container || match.container;
    console.log('[browser-control] container match:', container?.name || container?.id || 'unknown');
    return response;
  }
  const error = response?.data?.error || response?.error || 'unknown';
  console.warn('[browser-control] container match failed:', error);
  throw new Error(error);
}

function sendWsCommand(wsUrl: string, payload: any, timeoutMs = 8000) {
  return new Promise<any>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error('WebSocket command timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeAllListeners();
    };

    socket.once('open', () => {
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        cleanup();
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });

    socket.once('message', (data) => {
      cleanup();
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(data.toString('utf-8')));
      } catch (err) {
        reject(err);
      } finally {
        socket.close();
      }
    });

    socket.once('error', (err) => {
      cleanup();
      if (settled) return;
      settled = true;
      reject(err);
    });

    socket.once('close', () => {
      cleanup();
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });
  });
}

function runNpmCommand(args: string[] = []) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise<void>((resolve, reject) => {
    const child = spawn(npmCmd, args, { cwd: ROOT_DIR, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

function copyBrowserLibs() {
  try {
    if (!fs.existsSync(LIB_BROWSER_SRC)) return;
    fs.mkdirSync(path.dirname(LIB_BROWSER_DEST), { recursive: true });
    fs.cpSync(LIB_BROWSER_SRC, LIB_BROWSER_DEST, { recursive: true });
  } catch (err) {
    console.warn('[browser-control] failed to copy browser libs:', err?.message || String(err));
  }
}

function runNodeScript(relPath: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [relPath, ...args], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${relPath} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function killPort(port: number) {
  if (isTestMode()) return;
  try {
    if (process.platform === 'win32') {
      execSync(
        `for /f "tokens=5" %p in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /F /PID %p`,
        { stdio: 'ignore' },
      );
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 || true`, { stdio: 'ignore' });
    }
  } catch {}
}

function killBrowserServiceProcesses() {
  if (isTestMode()) return;
  try {
    if (process.platform === 'win32') {
      execSync(
        'taskkill /F /IM remote-service.exe || taskkill /F /IM node.exe /FI "WINDOWTITLE eq remote-service"',
        { stdio: 'ignore' },
      );
    } else {
      execSync('pkill -f "libs/browser/remote-service.js" || true', { stdio: 'ignore' });
      execSync('pkill -f "dist/services/browser-service/index.js" || true', { stdio: 'ignore' });
    }
  } catch {}
}

function killFloatingPanelProcesses() {
  if (isTestMode()) return;
  try {
    if (process.platform === 'win32') {
      execSync(
        'taskkill /F /IM electron.exe /FI "WINDOWTITLE eq WebAuto Floating Console" || true',
        { stdio: 'ignore' },
      );
      execSync('taskkill /F /IM electronmon.exe || true', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "apps/floating-panel/node_modules/electron/dist/Electron.app" || true', {
        stdio: 'ignore',
      });
      execSync('pkill -f "electronmon" || true', { stdio: 'ignore' });
    }
  } catch {}
}
