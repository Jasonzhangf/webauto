import electron from 'electron';
const { app, BrowserWindow, ipcMain, shell } = electron;

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

import { readDesktopConsoleSettings, resolveDefaultDownloadRoot, writeDesktopConsoleSettings } from './desktop-settings.mts';
import type { DesktopConsoleSettings } from './desktop-settings.mts';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..'); // apps/desktop-console/dist/main -> apps/desktop-console
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

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
const runs = new Map<string, { child: ReturnType<typeof spawn>; title: string }>();

let win: BrowserWindow | null = null;

function sendEvent(evt: CmdEvent) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('cmd:event', evt);
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

function splitLines(buf: Buffer) {
  return buf.toString('utf8').split(/\r?\n/g).filter(Boolean);
}

function resolveNodeBin() {
  const explicit = String(process.env.WEBAUTO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode) return npmNode;
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

async function spawnCommand(spec: SpawnSpec) {
  const runId = generateRunId();
  const groupKey = spec.groupKey || 'xiaohongshu';
  const q = getQueue(groupKey);

  q.enqueue(
    () =>
      new Promise<void>((resolve) => {
        const child = spawn(resolveNodeBin(), spec.args, {
          cwd: spec.cwd,
          env: { ...process.env, ...(spec.env || {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        runs.set(runId, { child, title: spec.title });
        sendEvent({ type: 'started', runId, title: spec.title, pid: child.pid ?? -1, ts: now() });

        child.stdout?.on('data', (chunk: Buffer) => {
          splitLines(chunk).forEach((line) => sendEvent({ type: 'stdout', runId, line, ts: now() }));
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          splitLines(chunk).forEach((line) => sendEvent({ type: 'stderr', runId, line, ts: now() }));
        });
        child.on('exit', (code, signal) => {
          sendEvent({ type: 'exit', runId, exitCode: code, signal, ts: now() });
          runs.delete(runId);
          resolve();
        });
      }),
  );

  return { runId };
}

async function runJson(spec: RunJsonSpec) {
  const timeoutMs = typeof spec.timeoutMs === 'number' ? spec.timeoutMs : 20_000;
  const child = spawn(resolveNodeBin(), spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
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
        result.entries.push({ env, keyword, path: kwPath, mtimeMs: stat?.mtimeMs || 0 });
      }
    }
    result.entries.sort((a: any, b: any) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  } catch (e: any) {
    result.ok = false;
    result.error = e?.message || String(e);
  }
  return result;
}

async function readTextPreview(input: { path: string; maxBytes?: number; maxLines?: number }) {
  const filePath = String(input.path || '');
  const maxBytes = typeof input.maxBytes === 'number' ? input.maxBytes : 80_000;
  const maxLines = typeof input.maxLines === 'number' ? input.maxLines : 200;
  const raw = await fs.readFile(filePath, 'utf8');
  const clipped = raw.slice(0, maxBytes);
  const lines = clipped.split(/\r?\n/g).slice(0, maxLines);
  return { ok: true, path: filePath, text: lines.join('\n') };
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

async function listProfiles() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir() || '';
  const root = path.join(homeDir, '.webauto', 'profiles');
  const entries: string[] = [];
  try {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      if (!name || name.startsWith('.')) continue;
      entries.push(name);
    }
  } catch {
    // ignore
  }
  entries.sort((a, b) => a.localeCompare(b));
  return { ok: true, root, profiles: entries };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 920,
    minHeight: 640,
    webPreferences: {
      preload: path.join(APP_ROOT, 'dist', 'main', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const htmlPath = path.join(APP_ROOT, 'dist', 'renderer', 'index.html');
  void win.loadFile(htmlPath);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(() => {
  createWindow();
});

ipcMain.on('preload:test', () => {
  console.log('[preload-test] window.api OK');
  // give renderer a moment to flush
  setTimeout(() => app.quit(), 200);
});

ipcMain.handle('settings:get', async () => readDesktopConsoleSettings({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }));
ipcMain.handle('settings:set', async (_evt, next) =>
  writeDesktopConsoleSettings({ appRoot: APP_ROOT, repoRoot: REPO_ROOT }, next || {}),
);

ipcMain.handle('cmd:spawn', async (_evt, spec: SpawnSpec) => {
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
    r.child.kill('SIGTERM');
    return { ok: true };
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
ipcMain.handle('fs:readFileBase64', async (_evt, spec: { path: string; maxBytes?: number }) => readFileBase64(spec));
ipcMain.handle('profiles:list', async () => listProfiles());
ipcMain.handle('os:openPath', async (_evt, input: { path: string }) => {
  const p = String(input?.path || '');
  const r = await shell.openPath(p);
  return { ok: !r, error: r || null };
});
