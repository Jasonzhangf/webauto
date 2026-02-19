import electron from 'electron';
const { app, BrowserWindow, ipcMain, shell, clipboard } = electron;

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, promises as fs } from 'node:fs';

import { readDesktopConsoleSettings, resolveDefaultDownloadRoot, writeDesktopConsoleSettings, saveCrawlConfig, loadCrawlConfig, exportConfigToFile, importConfigFromFile, type CrawlConfig } from './desktop-settings.mts';
import type { DesktopConsoleSettings } from './desktop-settings.mts';
import { startCoreDaemon, stopCoreDaemon } from './core-daemon-manager.mts';
import { createProfileStore } from './profile-store.mts';
import { decideWatchdogAction, resolveUiHeartbeatTimeoutMs } from './heartbeat-watchdog.mts';

type CmdEvent =
  | { type: 'started'; runId: string; title: string; pid: number; ts: number }
  | { type: 'stdout'; runId: string; line: string; ts: number }
  | { type: 'stderr'; runId: string; line: string; ts: number }
  | { type: 'exit'; runId: string; exitCode: number | null; signal: string | null; ts: number };

type SpawnSpec = {
  title: string;
  cwd: string;
  args: string[];
  env?: Record<string, string>;
  groupKey?: string;
};

type RunJsonSpec = {
  title: string;
  cwd: string;
  args: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
};

type UiSettings = DesktopConsoleSettings;
import { stateBridge } from './state-bridge.mts';
import { checkCamoCli, checkServices, checkFirefox, checkGeoIP, checkEnvironment } from './env-check.mts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..'); // apps/desktop-console/dist/main -> apps/desktop-console
const REPO_ROOT = path.resolve(APP_ROOT, '../..');
const DESKTOP_HEARTBEAT_FILE = path.join(
  os.homedir(),
  '.webauto',
  'run',
  'desktop-console-heartbeat.json',
);
const profileStore = createProfileStore({ repoRoot: REPO_ROOT });
const XHS_SCRIPTS_ROOT = path.join(REPO_ROOT, 'scripts', 'xiaohongshu');
const XHS_FULL_COLLECT_RE = /collect-content\.mjs$/;

function configureElectronPaths() {
  try {
    const downloadRoot = resolveDefaultDownloadRoot();
    const normalized = path.normalize(downloadRoot);
    const baseDir = path.basename(normalized).toLowerCase() === 'download'
      ? path.dirname(normalized)
      : normalized;
    const userDataRoot = path.join(baseDir, 'desktop-console');
    const cacheRoot = path.join(userDataRoot, 'cache');
    const gpuCacheRoot = path.join(cacheRoot, 'gpu');

    try { mkdirSync(cacheRoot, { recursive: true }); } catch {}
    try { mkdirSync(gpuCacheRoot, { recursive: true }); } catch {}

    app.setPath('userData', userDataRoot);
    app.setPath('cache', cacheRoot);
    app.commandLine.appendSwitch('disk-cache-dir', cacheRoot);
    app.commandLine.appendSwitch('gpu-cache-dir', gpuCacheRoot);
  } catch (err) {
    console.warn('[desktop-console] failed to configure cache paths', err);
  }
}

function now() {
  return Date.now();
}

class GroupQueue {
  private running = false;
  private queue: Array<() => Promise<void>> = [];

  enqueue(job: () => Promise<void>) {
    this.queue.push(job);
    void this.pump();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        await job();
      }
    } finally {
      this.running = false;
    }
  }
}

const groupQueues = new Map<string, GroupQueue>();
const runs = new Map<string, { child: ReturnType<typeof spawn>; title: string; startedAt: number; profiles?: string[] }>();

const UI_HEARTBEAT_TIMEOUT_MS = resolveUiHeartbeatTimeoutMs(process.env);
let lastUiHeartbeatAt = Date.now();
let heartbeatWatchdog: NodeJS.Timeout | null = null;
let heartbeatTimeoutHandled = false;
let coreServicesStopRequested = false;
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

function startCoreServiceHeartbeat() {
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

function stopCoreServiceHeartbeat() {
  if (coreServiceHeartbeatStopped) return;
  coreServiceHeartbeatStopped = true;
  if (coreServiceHeartbeatTimer) {
    clearInterval(coreServiceHeartbeatTimer);
    coreServiceHeartbeatTimer = null;
  }
  void writeCoreServiceHeartbeat('stopped');
}

let stateBridgeStarted = false;
function ensureStateBridge() {
  if (stateBridgeStarted) return;
  const w = getWin();
  if (w) { stateBridge.start(w); stateBridgeStarted = true; }
}

let win: BrowserWindow | null = null;

configureElectronPaths();

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function getWin() {
  if (!win || win.isDestroyed()) return null;
  return win;
}

if (singleInstanceLock) {
  app.on('second-instance', () => {
    const w = getWin();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
      return;
    }
    if (app.isReady()) {
      createWindow();
    } else {
      app.whenReady().then(() => createWindow());
    }
  });
}

function isUiOperational() {
  const w = getWin();
  if (!w) return false;
  const wc = w.webContents;
  if (!wc || wc.isDestroyed()) return false;
  if (typeof wc.isCrashed === 'function' && wc.isCrashed()) return false;
  return true;
}

function sendEvent(evt: CmdEvent) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('cmd:event', evt);
}

function markUiHeartbeat(source = 'renderer') {
  lastUiHeartbeatAt = Date.now();
  heartbeatTimeoutHandled = false;
  return { ok: true, ts: new Date(lastUiHeartbeatAt).toISOString(), source };
}

function terminateRunProcess(runId: string, reason = 'manual') {
  const run = runs.get(runId);
  if (!run) return false;
  const child = run.child;
  const pid = Number(child.pid || 0);

  try {
    if (process.platform === 'win32') {
      if (pid > 0) {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      }
    } else {
      if (pid > 0) {
        // Best-effort: terminate direct children first, then root process.
        spawn('pkill', ['-TERM', '-P', String(pid)], { stdio: 'ignore' }).on('error', () => {});
      }
    }
  } catch {
    // ignore
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }

  sendEvent({ type: 'stderr', runId, line: `[watchdog] kill requested (${reason})`, ts: now() });
  return true;
}

async function stopCoreServicesBestEffort(reason: string) {
  if (coreServicesStopRequested) return;
  coreServicesStopRequested = true;
  try {
    await stopCoreDaemon();
  } catch (err) {
    console.warn(`[desktop-console] core-daemon stop failed (${reason})`, err);
  }
}

function killAllRuns(reason = 'ui_heartbeat_timeout') {
  for (const runId of Array.from(runs.keys())) {
    terminateRunProcess(runId, reason);
  }
  if (reason === 'ui_heartbeat_timeout' || reason === 'window_closed') {
    void stopCoreServicesBestEffort(reason);
  }
}

function ensureHeartbeatWatchdog() {
  if (heartbeatWatchdog) return;
  heartbeatWatchdog = setInterval(() => {
    const staleMs = Date.now() - lastUiHeartbeatAt;
    const decision = decideWatchdogAction({
      staleMs,
      timeoutMs: UI_HEARTBEAT_TIMEOUT_MS,
      alreadyHandled: heartbeatTimeoutHandled,
      runCount: runs.size,
      uiOperational: isUiOperational(),
    });
    heartbeatTimeoutHandled = decision.nextHandled;

    if (decision.action === 'none') {
      if (decision.reason === 'stale_ui_alive') {
        console.warn(
          `[desktop-heartbeat] stale ${staleMs}ms > ${UI_HEARTBEAT_TIMEOUT_MS}ms, UI still alive, skip kill (likely timer throttling)`,
        );
      }
      return;
    }

    if (decision.action === 'kill_runs') {
      console.warn(`[desktop-heartbeat] stale ${staleMs}ms > ${UI_HEARTBEAT_TIMEOUT_MS}ms, killing ${runs.size} run(s)`);
      killAllRuns('ui_heartbeat_timeout');
      return;
    }

    console.warn(`[desktop-heartbeat] stale ${staleMs}ms > ${UI_HEARTBEAT_TIMEOUT_MS}ms, stopping core services`);
    void stopCoreServicesBestEffort('heartbeat_stop_only');
  }, 5_000);
  heartbeatWatchdog.unref();
}

function getQueue(groupKey: string) {
  const key = groupKey || 'default';
  let q = groupQueues.get(key);
  if (!q) {
    q = new GroupQueue();
    groupQueues.set(key, q);
  }
  return q;
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

type StreamEventType = 'stdout' | 'stderr';

function createLineEmitter(runId: string, type: StreamEventType) {
  let pending = '';

  const emit = (line: string) => {
    const normalized = String(line || '').replace(/\r$/, '');
    if (!normalized) return;
    sendEvent({ type, runId, line: normalized, ts: now() });
  };

  return {
    push(chunk: Buffer) {
      pending += chunk.toString('utf8');
      let idx = pending.indexOf('\n');
      while (idx >= 0) {
        const line = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        emit(line);
        idx = pending.indexOf('\n');
      }
    },
    flush() {
      if (!pending) return;
      emit(pending);
      pending = '';
    },
  };
}

function resolveNodeBin() {
  const explicit = String(process.env.WEBAUTO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode) return npmNode;
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function resolveCwd(input?: string) {
  const raw = String(input || '').trim();
  if (!raw) return REPO_ROOT;
  return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

let cachedStateMod: any = null;
async function getStateModule() {
  if (cachedStateMod) return cachedStateMod;
  try {
    const p = path.join(REPO_ROOT, 'dist', 'modules', 'state', 'src', 'xiaohongshu-collect-state.js');
    cachedStateMod = await import(pathToFileURL(p).href);
    return cachedStateMod;
  } catch {
    cachedStateMod = null;
    return null;
  }
}

async function spawnCommand(spec: SpawnSpec) {
  const runId = generateRunId();
  const groupKey = spec.groupKey || 'xiaohongshu';
  const q = getQueue(groupKey);
  const cwd = resolveCwd(spec.cwd);
  const args = Array.isArray(spec.args) ? spec.args : [];

  const isXhsRunCommand = args.some((item) => /xhs-(orchestrate|unified)\.mjs$/i.test(String(item || '').replace(/\\/g, '/')));
  const extractProfilesFromArgs = (argv: string[]) => {
    const out: string[] = [];
    for (let i = 0; i < argv.length; i += 1) {
      const flag = String(argv[i] || '').trim();
      if (flag === '--profile' || flag === '--profile-id') {
        const value = String(argv[i + 1] || '').trim();
        if (value) out.push(value);
      } else if (flag === '--profiles') {
        const value = String(argv[i + 1] || '').trim();
        if (value) {
          value.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => out.push(v));
        }
      }
    }
    return Array.from(new Set(out));
  };
  const requestedProfiles = isXhsRunCommand ? extractProfilesFromArgs(args) : [];
  if (requestedProfiles.length > 0) {
    for (const run of runs.values()) {
      const activeProfiles = Array.isArray(run.profiles) ? run.profiles : [];
      const conflict = requestedProfiles.find((p) => activeProfiles.includes(p));
      if (conflict) {
        throw new Error(`profile already running: ${conflict}`);
      }
    }
  }

  q.enqueue(
    () =>
      new Promise<void>((resolve) => {
        let finished = false;
        let exitCode: number | null = null;
        let exitSignal: string | null = null;
        const finalize = (code: number | null, signal: string | null) => {
          if (finished) return;
          finished = true;
          sendEvent({ type: 'exit', runId, exitCode: code, signal, ts: now() });
          runs.delete(runId);
          resolve();
        };

        const child = spawn(resolveNodeBin(), args, {
          cwd,
          env: {
            ...process.env,
            WEBAUTO_DAEMON: '1',
            WEBAUTO_UI_HEARTBEAT: '1',
            ...(spec.env || {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        runs.set(runId, { child, title: spec.title, startedAt: now(), profiles: requestedProfiles });
        sendEvent({ type: 'started', runId, title: spec.title, pid: child.pid ?? -1, ts: now() });

        const stdoutLines = createLineEmitter(runId, 'stdout');
        const stderrLines = createLineEmitter(runId, 'stderr');

        child.stdout?.on('data', (chunk: Buffer) => {
          stdoutLines.push(chunk);
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          stderrLines.push(chunk);
        });
        child.on('error', (err: any) => {
          sendEvent({ type: 'stderr', runId, line: `[spawn-error] ${err?.message || String(err)}`, ts: now() });
          finalize(null, 'error');
        });
        child.on('exit', (code, signal) => {
          exitCode = code;
          exitSignal = signal;
        });
        child.on('close', (code, signal) => {
          stdoutLines.flush();
          stderrLines.flush();
          finalize(exitCode ?? code ?? null, exitSignal ?? signal ?? null);
        });
      }),
  );

  return { runId };
}

async function runJson(spec: RunJsonSpec) {
  const timeoutMs = typeof spec.timeoutMs === 'number' ? spec.timeoutMs : 20_000;
  const cwd = resolveCwd(spec.cwd);
  const child = spawn(resolveNodeBin(), spec.args, {
    cwd,
    env: { ...process.env, ...(spec.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout?.on('data', (c: Buffer) => stdout.push(c));
  child.stderr?.on('data', (c: Buffer) => stderr.push(c));

  const timer = setTimeout(() => {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }, timeoutMs);

  const { code } = await new Promise<{ code: number | null }>((resolve) => {
    child.on('exit', (c) => resolve({ code: c }));
  });
  clearTimeout(timer);

  const out = Buffer.concat(stdout).toString('utf8').trim();
  const err = Buffer.concat(stderr).toString('utf8').trim();

  if (code !== 0) {
    return { ok: false, code, stdout: out, stderr: err };
  }

  try {
    const json = JSON.parse(out);
    return { ok: true, code, json };
  } catch {
    return { ok: true, code, stdout: out, stderr: err };
  }
}

async function scanResults(input: { downloadRoot?: string }) {
  const downloadRoot = String(input.downloadRoot || resolveDefaultDownloadRoot());
  const root = path.join(downloadRoot, 'xiaohongshu');

  const result: any = { ok: true, root, entries: [] as any[] };
  try {
    const stateMod = await getStateModule();
    const envDirs = await fs.readdir(root, { withFileTypes: true });
    for (const envEnt of envDirs) {
      if (!envEnt.isDirectory()) continue;
      const env = envEnt.name;
      const envPath = path.join(root, env);
      const keywordDirs = await fs.readdir(envPath, { withFileTypes: true });
      for (const kwEnt of keywordDirs) {
        if (!kwEnt.isDirectory()) continue;
        const keyword = kwEnt.name;
        const kwPath = path.join(envPath, keyword);
        const stat = await fs.stat(kwPath).catch(() => null);
        let stateSummary: any = null;
        if (stateMod?.loadXhsCollectState) {
          try {
            const state = await stateMod.loadXhsCollectState({ keyword, env, downloadRoot });
            stateSummary = {
              status: state?.status,
              links: state?.listCollection?.collectedUrls?.length || 0,
              target: state?.listCollection?.targetCount || 0,
              completed: state?.detailCollection?.completed || 0,
              failed: state?.detailCollection?.failed || 0,
              updatedAt: state?.lastUpdateTime || null,
            };
          } catch {
            // ignore
          }
        }
        result.entries.push({ env, keyword, path: kwPath, mtimeMs: stat?.mtimeMs || 0, state: stateSummary });
      }
    }
    result.entries.sort((a: any, b: any) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  } catch (e: any) {
    result.ok = false;
    result.error = e?.message || String(e);
  }
  return result;
}

async function listXhsFullCollectScripts() {
  try {
    const entries = await fs.readdir(XHS_SCRIPTS_ROOT, { withFileTypes: true });
    const scripts = entries
      .filter((ent) => ent.isFile() && XHS_FULL_COLLECT_RE.test(ent.name))
      .map((ent) => {
        const name = ent.name;
        return {
          id: `xhs:${name}`,
          label: `Full Collect (${name})`,
          path: path.join(XHS_SCRIPTS_ROOT, name),
        };
      });
    return { ok: true, scripts };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), scripts: [] };
  }
}

async function readTextPreview(input: { path: string; maxBytes?: number; maxLines?: number }) {
  const filePath = String(input.path || '');
  const maxBytes = typeof input.maxBytes === 'number' ? input.maxBytes : 80_000;
  const maxLines = typeof input.maxLines === 'number' ? input.maxLines : 200;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const clipped = raw.slice(0, maxBytes);
    const lines = clipped.split(/\r?\n/g).slice(0, maxLines);
    return { ok: true, path: filePath, text: lines.join('\n') };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ok: false, path: filePath, error: 'not_found' };
    return { ok: false, path: filePath, error: err?.message || String(err) };
  }
}



async function readTextTail(input: { path: string; fromOffset?: number; maxBytes?: number }) {
  const filePath = String(input?.path || '');
  const requestedOffset = typeof input?.fromOffset === 'number' ? Math.max(0, Math.floor(input.fromOffset)) : 0;
  const maxBytes = typeof input?.maxBytes === 'number' ? Math.max(1024, Math.floor(input.maxBytes)) : 256_000;

  const st = await fs.stat(filePath);
  const size = Number(st?.size || 0);
  const fromOffset = requestedOffset > size ? 0 : requestedOffset;
  const toRead = Math.max(0, Math.min(maxBytes, size - fromOffset));
  if (toRead <= 0) {
    return { ok: true, path: filePath, text: '', fromOffset, nextOffset: fromOffset, fileSize: size };
  }

  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(toRead);
    const { bytesRead } = await fh.read(buf, 0, toRead, fromOffset);
    const text = buf.subarray(0, bytesRead).toString('utf8');
    return {
      ok: true,
      path: filePath,
      text,
      fromOffset,
      nextOffset: fromOffset + bytesRead,
      fileSize: size,
    };
  } finally {
    await fh.close();
  }
}

async function readFileBase64(input: { path: string; maxBytes?: number }) {
  const filePath = String(input.path || '');
  const maxBytes = typeof input.maxBytes === 'number' ? input.maxBytes : 8_000_000;
  const buf = await fs.readFile(filePath);
  if (buf.byteLength > maxBytes) {
    return { ok: false, error: `file too large: ${buf.byteLength}` };
  }
  return { ok: true, data: buf.toString('base64') };
}

async function listDir(input: { root: string; recursive?: boolean; maxEntries?: number }) {
  const root = String(input?.root || '');
  const recursive = Boolean(input?.recursive);
  const maxEntries = typeof input?.maxEntries === 'number' ? input.maxEntries : 2000;
  const entries: Array<{
    path: string;
    rel: string;
    name: string;
    isDir: boolean;
    size: number;
    mtimeMs: number;
  }> = [];

  const stack: string[] = [root];
  while (stack.length > 0 && entries.length < maxEntries) {
    const dir = stack.pop()!;
    const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of items) {
      if (entries.length >= maxEntries) break;
      const full = path.join(dir, ent.name);
      const st = await fs.stat(full).catch(() => null);
      entries.push({
        path: full,
        rel: path.relative(root, full),
        name: ent.name,
        isDir: ent.isDirectory(),
        size: st?.size || 0,
        mtimeMs: st?.mtimeMs || 0,
      });
      if (recursive && ent.isDirectory()) stack.push(full);
    }
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return b.mtimeMs - a.mtimeMs;
  });

  return { ok: true, root, entries, truncated: entries.length >= maxEntries };
}

function createWindow() {
  win = new BrowserWindow({
    title: "WebAuto Desktop v0.1.1",
    width: 1280,
    height: 900,
    minWidth: 920,
    minHeight: 800,
    webPreferences: {
      preload: path.join(APP_ROOT, 'dist', 'main', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Prevent renderer timer throttling when app loses focus; heartbeat must remain stable.
      backgroundThrottling: false,
    },
  });

  const htmlPath = path.join(APP_ROOT, 'dist', 'renderer', 'index.html');
  void win.loadFile(htmlPath);
  ensureStateBridge();
}

app.on('window-all-closed', () => {
  killAllRuns('window_closed');
  // macOS 下关闭窗口后也退出应用，避免命令行挂起
  app.quit();
});

// 确保窗口关闭时命令行能退出
app.on('before-quit', () => {
  killAllRuns('before_quit');
  stopCoreServiceHeartbeat();
  void stopCoreServicesBestEffort('before_quit');
  if (heartbeatWatchdog) {
    clearInterval(heartbeatWatchdog);
    heartbeatWatchdog = null;
  }
});

app.on('will-quit', () => {
  killAllRuns('will_quit');
  stopCoreServiceHeartbeat();
  void stopCoreServicesBestEffort('will_quit');
  stateBridge.stop();
});

app.whenReady().then(async () => {
  startCoreServiceHeartbeat();
  const started = await startCoreDaemon().catch(() => false);
  if (!started) {
    console.warn('[desktop-console] core services are not healthy at startup');
  }
  markUiHeartbeat('main_ready');
  ensureHeartbeatWatchdog();
  createWindow();
});

ipcMain.on('preload:test', () => {
  console.log('[preload-test] window.api OK');
  // give renderer a moment to flush
  setTimeout(() => app.quit(), 200);
});

ipcMain.handle('settings:get', async () => readDesktopConsoleSettings({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }));
ipcMain.handle('settings:set', async (_evt, next) => {
  const updated = await writeDesktopConsoleSettings({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }, next || {});
  // Broadcast to all tabs so they can refresh aliases/colors without manual reload.
  const w = getWin();
  if (w) w.webContents.send('settings:changed', updated);
  return updated;
});

ipcMain.handle('ai:listModels', async (_evt, input: { baseUrl: string; apiKey: string; path?: string }) => {
  try {
    const baseUrl = String(input?.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(input?.apiKey || '').trim();
    const apiPath = String(input?.path || '/v1/models').trim() || '/v1/models';
    if (!baseUrl) return { ok: false, models: [], rawCount: 0, error: 'baseUrl is required' };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}${apiPath}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        rawCount: 0,
        error: (json as any)?.error?.message || `HTTP ${res.status}`,
      };
    }

    const data = Array.isArray((json as any)?.data) ? (json as any).data : [];
    const models = data.map((m: any) => String(m?.id || '')).filter(Boolean);
    return { ok: true, models, rawCount: data.length };
  } catch (e: any) {
    return { ok: false, models: [], rawCount: 0, error: e?.message || String(e) };
  }
});

ipcMain.handle(
  'ai:testChatCompletion',
  async (_evt, input: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }) => {
    const startedAt = Date.now();
    try {
      const baseUrl = String(input?.baseUrl || '').trim().replace(/\/+$/, '');
      const apiKey = String(input?.apiKey || '').trim();
      const model = String(input?.model || '').trim();
      const timeoutMs = Math.max(5000, Number(input?.timeoutMs || 25000));

      if (!baseUrl) return { ok: false, latencyMs: 0, model, error: 'baseUrl is required' };
      if (!model) return { ok: false, latencyMs: 0, model, error: 'model is required' };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          model,
          error: (json as any)?.error?.message || `HTTP ${res.status}`,
        };
      }

      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        model,
      };
    } catch (e: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        model: String(input?.model || ''),
        error: e?.message || String(e),
      };
    }
  },
);

ipcMain.handle('desktop:heartbeat', async () => markUiHeartbeat());

ipcMain.handle('cmd:spawn', async (_evt, spec: SpawnSpec) => {
  markUiHeartbeat('cmd_spawn');
  const title = String(spec?.title || 'command');
  const cwd = String(spec?.cwd || REPO_ROOT);
  const args = Array.isArray(spec?.args) ? spec.args : [];
  return spawnCommand({ title, cwd, args, env: spec.env, groupKey: spec.groupKey });
});

ipcMain.handle('cmd:kill', async (_evt, input: { runId: string }) => {
  const runId = String(input?.runId || '');
  const r = runs.get(runId);
  if (!r) return { ok: false, error: 'not found' };
  try {
    const ok = terminateRunProcess(runId, 'manual_stop');
    return { ok };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('cmd:runJson', async (_evt, spec: RunJsonSpec) => {
  const cwd = String(spec?.cwd || REPO_ROOT);
  const args = Array.isArray(spec?.args) ? spec.args : [];
  return runJson({ ...spec, cwd, args });
});

ipcMain.handle('results:scan', async (_evt, spec: { downloadRoot?: string }) => scanResults(spec || {}));
ipcMain.handle('fs:listDir', async (_evt, spec: { root: string; recursive?: boolean; maxEntries?: number }) => listDir(spec));
ipcMain.handle('fs:readTextPreview', async (_evt, spec: { path: string; maxBytes?: number; maxLines?: number }) =>
  readTextPreview(spec),
);
ipcMain.handle('fs:readTextTail', async (_evt, spec: { path: string; fromOffset?: number; maxBytes?: number }) =>
  readTextTail(spec),
);
ipcMain.handle('fs:readFileBase64', async (_evt, spec: { path: string; maxBytes?: number }) => readFileBase64(spec));
ipcMain.handle('profiles:list', async () => profileStore.listProfiles());
ipcMain.handle('profiles:scan', async () => profileStore.scanProfiles());
ipcMain.handle('scripts:xhsFullCollect', async () => listXhsFullCollectScripts());
ipcMain.handle('profile:create', async (_evt, input: { profileId: string }) => profileStore.profileCreate(input || ({} as any)));
ipcMain.handle('profile:delete', async (_evt, input: { profileId: string; deleteFingerprint?: boolean }) =>
  profileStore.profileDelete(input || ({} as any)),
);
ipcMain.handle('fingerprint:delete', async (_evt, input: { profileId: string }) => profileStore.fingerprintDelete(input || ({} as any)));
ipcMain.handle('fingerprint:regenerate', async (_evt, input: { profileId: string; platform?: 'windows' | 'macos' | 'random' }) =>
  profileStore.fingerprintRegenerate(input || ({} as any)),
);
ipcMain.handle('os:openPath', async (_evt, input: { path: string }) => {
  const p = String(input?.path || '');
  const r = await shell.openPath(p);
  return { ok: !r, error: r || null };
});

// Environment and config management IPC handlers
ipcMain.handle('env:checkCamo', async () => checkCamoCli());
ipcMain.handle('env:checkServices', async () => checkServices());
ipcMain.handle('env:checkFirefox', async () => checkFirefox());
ipcMain.handle('env:checkGeoIP', async () => checkGeoIP());
ipcMain.handle('env:checkAll', async () => checkEnvironment());
ipcMain.handle('env:repairCore', async () => {
  const ok = await startCoreDaemon().catch(() => false);
  const services = await checkServices().catch(() => ({ unifiedApi: false, browserService: false }));
  return { ok, services };
});
ipcMain.handle('env:repairDeps', async (_evt, input: { core?: boolean; browser?: boolean; geoip?: boolean }) => {
  const wantCore = Boolean(input?.core);
  const wantBrowser = Boolean(input?.browser);
  const wantGeoip = Boolean(input?.geoip);
  const result: any = { ok: true, core: null, install: null, env: null };

  if (wantCore) {
    const coreOk = await startCoreDaemon().catch(() => false);
    result.core = {
      ok: coreOk,
      services: await checkServices().catch(() => ({ unifiedApi: false, browserService: false })),
    };
    if (!coreOk) result.ok = false;
  }

  if (wantBrowser || wantGeoip) {
    const args = [path.join('apps', 'webauto', 'entry', 'xhs-install.mjs')];
    if (wantBrowser) args.push('--download-browser');
    if (wantGeoip) args.push('--download-geoip');
    args.push('--ensure-backend');
    const installRes = await runJson({
      title: 'env repair deps',
      cwd: REPO_ROOT,
      args,
      timeoutMs: 300_000,
    }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
    result.install = installRes;
    if (!installRes?.ok) result.ok = false;
  }

  result.env = await checkEnvironment().catch(() => null);
  return result;
});
ipcMain.handle('config:saveLast', async (_evt, config: CrawlConfig) => {
  await saveCrawlConfig({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }, config);
  return { ok: true };
});
ipcMain.handle('config:loadLast', async () => {
  const config = await loadCrawlConfig({ appRoot: APP_ROOT, repoRoot: REPO_ROOT });
  return config;
});
ipcMain.handle('config:export', async (_evt, { filePath, config }: { filePath: string; config: CrawlConfig }) => {
  return await exportConfigToFile(filePath, config);
});
ipcMain.handle('config:import', async (_evt, { filePath }: { filePath: string }) => {
  return await importConfigFromFile(filePath);
});

ipcMain.handle('clipboard:writeText', async (_evt, input: { text: string }) => {
  try {
    clipboard.writeText(String(input?.text || ''));
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// ---- Runtime Dashboard APIs ----

async function unifiedGet(pathname: string) {
  const base = String((await readDesktopConsoleSettings({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }))?.unifiedApiUrl || 'http://127.0.0.1:7701');
  const url = `${base}${pathname}`;
  const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function unifiedAction(action: string, payload: any) {
  const base = String((await readDesktopConsoleSettings({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }))?.unifiedApiUrl || 'http://127.0.0.1:7701');
  const res = await fetch(`${base}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false || json?.ok === false) throw new Error(json?.error || 'unified action failed');
  return json;
}

ipcMain.handle('runtime:listSessions', async () => {
  // Prefer live sessions from controller; StateRegistry may lag behind.
  const data = await unifiedAction('session:list', {}).catch(() => null);
  const sessions = data?.data?.sessions || data?.sessions || [];
  if (!Array.isArray(sessions)) return [];
  const now = new Date().toISOString();
  return sessions
    .map((s: any) => ({
      profileId: String(s?.profileId || s?.profile_id || s?.sessionId || s?.session_id || ''),
      sessionId: String(s?.sessionId || s?.session_id || s?.profileId || s?.profile_id || ''),
      currentUrl: String(s?.currentUrl || s?.current_url || ''),
      lastPhase: String(s?.lastPhase || s?.phase || 'phase1'),
      lastActiveAt: String(s?.lastActiveAt || now),
      status: 'running',
    }))
    .filter((s: any) => s.profileId);
});

ipcMain.handle('runtime:focus', async (_evt, input: { profileId: string }) => {
  const profileId = String(input?.profileId || '').trim();
  if (!profileId) return { ok: false, error: 'missing profileId' };
  // Best-effort: some controllers may not implement browser:focus; fail gracefully.
  const focusRes = await unifiedAction('browser:focus', { profile: profileId }).catch(() => ({ ok: false }));
  // Add a temporary highlight overlay in the page to help locate the window.
  await unifiedAction('browser:execute', {
    profile: profileId,
    script: `(() => {
      try {
        const id = '__webauto_focus_ring__';
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement('div');
          el.id = id;
          el.style.position = 'fixed';
          el.style.left = '8px';
          el.style.top = '8px';
          el.style.right = '8px';
          el.style.bottom = '8px';
          el.style.border = '3px solid #2b67ff';
          el.style.borderRadius = '10px';
          el.style.zIndex = '2147483647';
          el.style.pointerEvents = 'none';
          document.body.appendChild(el);
        }
        el.style.display = 'block';
        setTimeout(() => { try { el.remove(); } catch {} }, 1500);
        return true;
      } catch {
        return false;
      }
    })()`
  }).catch(() => null);
  return focusRes;
});

ipcMain.handle('runtime:kill', async (_evt, input: { profileId: string }) => {
  const profileId = String(input?.profileId || '').trim();
  if (!profileId) return { ok: false, error: 'missing profileId' };
  return unifiedAction('session:delete', { profileId }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
});

ipcMain.handle('runtime:restartPhase1', async (_evt, input: { profileId: string }) => {
  const profileId = String(input?.profileId || '').trim();
  if (!profileId) return { ok: false, error: 'missing profileId' };
  const args = [path.join(REPO_ROOT, 'scripts', 'xiaohongshu', 'phase1-boot.mjs'), '--profile', profileId, '--headless', 'false'];
  return spawnCommand({ title: `Phase1 restart ${profileId}`, cwd: REPO_ROOT, args, groupKey: 'phase1' });
});

ipcMain.handle('runtime:setBrowserTitle', async (_evt, input: { profileId: string; title: string }) => {
  const profileId = String(input?.profileId || '').trim();
  const title = String(input?.title || '').trim();
  if (!profileId || !title) return { ok: false, error: 'missing profileId/title' };
  return unifiedAction('browser:execute', {
    profile: profileId,
    script: `(() => { try { document.title = ${JSON.stringify(title)}; return true; } catch { return false; } })()`,
  }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
});

ipcMain.handle('runtime:setHeaderBar', async (_evt, input: { profileId: string; label: string; color: string }) => {
  const profileId = String(input?.profileId || '').trim();
  const label = String(input?.label || '').trim();
  const color = String(input?.color || '').trim();
  if (!profileId || !label || !color) return { ok: false, error: 'missing profileId/label/color' };
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2b67ff';
  return unifiedAction('browser:execute', {
    profile: profileId,
    script: `(() => {
      try {
        const id = '__webauto_header_bar__';
        let bar = document.getElementById(id);
        if (!bar) {
          bar = document.createElement('div');
          bar.id = id;
          bar.style.position = 'fixed';
          bar.style.left = '0';
          bar.style.top = '0';
          bar.style.right = '0';
          bar.style.height = '22px';
          bar.style.zIndex = '2147483647';
          bar.style.display = 'flex';
          bar.style.alignItems = 'center';
          bar.style.padding = '0 10px';
          bar.style.fontSize = '12px';
          bar.style.fontFamily = 'system-ui, sans-serif';
          bar.style.fontWeight = '600';
          bar.style.color = '#fff';
          bar.style.pointerEvents = 'none';
          document.body.appendChild(bar);
          const html = document.documentElement;
          if (html) html.style.scrollPaddingTop = '22px';
        }
        bar.style.background = ${JSON.stringify(safeColor)};
        bar.textContent = ${JSON.stringify(label)};
        return true;
      } catch {
        return false;
      }
    })()`
  }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
});
