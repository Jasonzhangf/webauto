/**
 * UI 自动化测试统一上下文
 * 整合 API/WS/CLI/UI 控制和状态管理
 */

import { spawn, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export interface Task {
  runId: string;
  status: 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  title?: string;
  progress?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface Session {
  profileId: string;
  sessionId: string;
  currentUrl?: string;
  lastPhase?: string;
  status: string;
}

export interface EnvStatus {
  camo: { installed: boolean };
  services: { unifiedApi: boolean; camoRuntime: boolean };
  browserReady: boolean;
}

export interface Settings {
  [key: string]: any;
}

export interface Snapshot {
  tasks: Task[];
  sessions: Session[];
  env: EnvStatus;
  settings: Settings;
  timestamp: number;
}

type WsHandler = (event: string, data: any) => void;

class MockWebSocket {
  private handlers = new Map<string, Set<WsHandler>>();
  private connected = false;

  async connect(url: string): Promise<void> {
    // 简化实现：使用 HTTP 轮询模拟
    this.connected = true;
  }

  subscribe(event: string, handler: WsHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  unsubscribe(event: string, handler?: WsHandler): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }

  close(): void {
    this.connected = false;
    this.handlers.clear();
  }

  emit(event: string, data: any): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(event, data));
    }
    // Wildcard handlers
    this.handlers.forEach((handlers, pattern) => {
      if (pattern.endsWith('*') && event.startsWith(pattern.slice(0, -1))) {
        handlers.forEach(h => h(event, data));
      }
    });
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://127.0.0.1:7701') {
    this.baseUrl = baseUrl;
  }

  private async request(method: string, pathname: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${pathname}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${method} ${pathname} failed: ${res.status} ${text}`);
    }
    return res.json().catch(() => ({}));
  }

  async get(pathname: string): Promise<any> {
    return this.request('GET', pathname);
  }

  async post(pathname: string, body?: any): Promise<any> {
    return this.request('POST', pathname, body);
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.get('/health');
      return res?.status === 'ok' || res?.ok === true;
    } catch {
      return false;
    }
  }

  async listTasks(): Promise<Task[]> {
    const res = await this.get('/api/v1/tasks');
    return res?.data || res?.tasks || res || [];
  }

  async getTask(runId: string): Promise<Task | null> {
    const res = await this.get(`/api/v1/tasks/${runId}`);
    return res?.data || res?.task || res || null;
  }
}

class CliWrapper {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  private async run(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; json?: any }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: this.repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => { stdout += chunk; });
      child.stderr?.on('data', (chunk) => { stderr += chunk; });

      child.on('close', (code) => {
        let json: any = undefined;
        try {
          json = JSON.parse(stdout);
        } catch {}
        resolve({
          ok: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          json,
        });
      });

      child.on('error', (err) => {
        resolve({
          ok: false,
          stdout: '',
          stderr: err.message,
        });
      });
    });
  }

  async webauto(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; json?: any }> {
    const nodeBin = process.execPath;
    const script = path.join(this.repoRoot, 'bin', 'webauto.mjs');
    return this.run(nodeBin, [script, ...args]);
  }

  async camo(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; json?: any }> {
    const nodeBin = process.execPath;
    const script = path.join(this.repoRoot, 'bin', 'camoufox-cli.mjs');
    return this.run(nodeBin, [script, ...args]);
  }
}

class UiCliController {
  private repoRoot: string;
  private cli: CliWrapper;
  private running = false;

  constructor(repoRoot: string, cli: CliWrapper) {
    this.repoRoot = repoRoot;
    this.cli = cli;
  }

  private async exec(args: string[]): Promise<any> {
    const result = await this.cli.webauto(['ui', 'cli', ...args]);
    return result.json || { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  async start(build: boolean = false): Promise<void> {
    try {
      const status = await this.status();
      const alreadyRunning = Boolean(
        status?.running === true
        || status?.alive === true
        || status?.ok === true,
      );
      if (alreadyRunning) {
        this.running = true;
        return;
      }
    } catch {
      // ignore status probe failure and continue start flow
    }

    const args = ['start'];
    if (build) args.push('--build');
    await this.exec(args);
    this.running = true;
  }

  async stop(): Promise<void> {
    try {
      const status = await this.status();
      const alreadyStopped = status?.running === false && status?.alive === false;
      if (alreadyStopped) {
        this.running = false;
        return;
      }
    } catch {
      // ignore status probe failure and try stop once
    }

    await this.exec(['stop']);
    this.running = false;
  }

  async status(): Promise<any> {
    return this.exec(['status', '--json']);
  }

  async snapshot(): Promise<any> {
    return this.exec(['snapshot', '--json']);
  }

  async tab(name: string): Promise<void> {
    await this.exec(['tab', '--tab', name]);
  }

  async input(selector: string, value: string): Promise<void> {
    await this.exec(['input', '--selector', selector, '--value', value]);
  }

  async click(selector: string): Promise<void> {
    await this.exec(['click', '--selector', selector]);
  }

  async clickText(text: string): Promise<void> {
    await this.exec(['click-text', '--text', text]);
  }

  async probe(selector: string): Promise<{ exists: boolean; visible: boolean; value?: string }> {
    return this.exec(['probe', '--selector', selector]);
  }

  async wait(selector: string, state: 'visible' | 'exists' | 'hidden', timeout: number = 10000): Promise<void> {
    await this.exec(['wait', '--selector', selector, '--state', state, '--timeout', String(timeout)]);
  }

  async dialogs(value: 'silent' | 'restore'): Promise<void> {
    await this.exec(['dialogs', '--value', value]);
  }

  async run(spec: { tab: string; actions: Array<{ type: string; selector?: string; value?: string; text?: string }> }): Promise<void> {
    await this.tab(spec.tab);
    for (const action of spec.actions) {
      if (action.type === 'input' && action.selector && action.value) {
        await this.input(action.selector, action.value);
      } else if (action.type === 'click' && action.selector) {
        await this.click(action.selector);
      } else if (action.type === 'clickText' && action.text) {
        await this.clickText(action.text);
      } else if (action.type === 'wait' && action.selector) {
        await this.wait(action.selector, (action.value as any) || 'visible');
      }
    }
  }

  async fullCover(output?: string): Promise<{ ok: boolean; report: any }> {
    const args = ['full-cover', '--json'];
    if (output) args.push('--output', output);
    const result = await this.exec(args);
    return {
      ok: result?.ok === true || result?.report?.ok === true,
      report: result?.report || result,
    };
  }

  isRunning(): boolean {
    return this.running;
  }
}

export class TestContext {
  private appProcess: ChildProcess | null = null;
  private wsClient: MockWebSocket | null = null;
  
  public readonly api: ApiClient;
  public readonly cli: CliWrapper;
  public readonly ui: UiCliController;

  constructor(options?: { apiUrl?: string; repoRoot?: string }) {
    const repoRoot = options?.repoRoot || REPO_ROOT;
    this.api = new ApiClient(options?.apiUrl);
    this.cli = new CliWrapper(repoRoot);
    this.ui = new UiCliController(repoRoot, this.cli);
  }

  async spawnApp(options?: { headless?: boolean }): Promise<void> {
    if (this.appProcess) {
      throw new Error('App already running');
    }

    const nodeBin = process.execPath;
    const mainPath = path.join(REPO_ROOT, 'apps', 'desktop-console', 'dist', 'main', 'index.mjs');

    this.appProcess = spawn(nodeBin, [mainPath], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...(options?.headless ? { HEADLESS: '1' } : {}),
      },
    });

    // Wait for app to be ready
    let attempts = 0;
    while (attempts < 30) {
      const healthy = await this.api.health();
      if (healthy) return;
      await sleep(1000);
      attempts++;
    }

    throw new Error('App failed to start within 30s');
  }

  async stopApp(): Promise<void> {
    if (this.appProcess) {
      this.appProcess.kill();
      this.appProcess = null;
    }
  }

  get ws(): MockWebSocket {
    if (!this.wsClient) {
      this.wsClient = new MockWebSocket();
    }
    return this.wsClient;
  }

  async snapshot(): Promise<Snapshot> {
    const [tasks, sessions, env, settings] = await Promise.all([
      this.api.listTasks().catch(() => [] as Task[]),
      this.api.get('/api/v1/sessions').catch(() => []) as Promise<Session[]>,
      this.api.get('/api/v1/env').catch(() => ({})) as Promise<EnvStatus>,
      this.api.get('/api/v1/settings').catch(() => ({})) as Promise<Settings>,
    ]);

    return {
      tasks,
      sessions,
      env,
      settings,
      timestamp: Date.now(),
    };
  }

  async waitFor(
    predicate: (state: Snapshot) => boolean | Promise<boolean>,
    options?: { timeout?: number; interval?: number }
  ): Promise<Snapshot> {
    const timeout = options?.timeout || 60000;
    const interval = options?.interval || 1000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const state = await this.snapshot();
      if (await predicate(state)) {
        return state;
      }
      await sleep(interval);
    }

    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  async cleanup(): Promise<void> {
    await this.stopApp();
    this.ws.close();
    
    // Cleanup any running processes
    await this.cli.camo(['stop', 'all']).catch(() => {});
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForRunStart(ctx: TestContext, timeout: number = 10000): Promise<string | null> {
  const start = Date.now();
  const before = (await ctx.snapshot()).tasks.map(t => t.runId);

  while (Date.now() - start < timeout) {
    const after = await ctx.snapshot();
    const newTask = after.tasks.find(t => !before.includes(t.runId));
    if (newTask) return newTask.runId;
    await sleep(500);
  }

  return null;
}

export async function waitForTaskComplete(ctx: TestContext, runId: string, timeout: number = 60000): Promise<Task | null> {
  const state = await ctx.waitFor(
    (s) => {
      const task = s.tasks.find(t => t.runId === runId);
      return task?.status === 'completed' || task?.status === 'failed';
    },
    { timeout }
  );

  return state.tasks.find(t => t.runId === runId) || null;
}

// Singleton for shared test context
let sharedContext: TestContext | null = null;

export function getTestContext(): TestContext {
  if (!sharedContext) {
    sharedContext = new TestContext();
  }
  return sharedContext;
}

export async function setupTestContext(): Promise<TestContext> {
  const ctx = getTestContext();
  // Ensure services are running
  const healthy = await ctx.api.health();
  if (!healthy) {
    // Desktop startup triggers startCoreDaemon() and brings up Unified API.
    const boot = await ctx.cli.webauto(['ui', 'cli', 'start', '--build']);
    if (!boot.ok) {
      throw new Error(`failed to bootstrap desktop via ui cli: ${boot.stderr || boot.stdout || 'unknown error'}`);
    }

    const deadline = Date.now() + 30_000;
    let ok = false;
    while (Date.now() < deadline) {
      ok = await ctx.api.health();
      if (ok) break;
      await sleep(1000);
    }
    if (!ok) {
      throw new Error('Unified API still unhealthy after ui cli bootstrap');
    }
  }
  return ctx;
}

export async function teardownTestContext(): Promise<void> {
  if (sharedContext) {
    try {
      await sharedContext.ui.stop();
    } catch {
      // ignore best-effort stop
    }
    await sharedContext.cleanup();
    sharedContext = null;
  }
}
