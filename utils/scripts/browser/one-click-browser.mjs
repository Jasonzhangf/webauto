#!/usr/bin/env node
// 一键启动浏览器（后台服务 + 会话 + 可选导航，基于配置文件）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { loadBrowserServiceConfig } from '../../../libs/browser/browser-service-config.js';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const FLOATING_APP_DIR = path.join(ROOT_DIR, 'apps', 'floating-panel');
const WS_SERVER_SCRIPT = path.join(ROOT_DIR, 'scripts', 'start_websocket_server.py');
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
const WORKFLOW_BASE = (() => {
  const cfg = loadBrowserServiceConfig();
  const base = cfg.backend?.baseUrl || 'http://127.0.0.1:7701';
  return base.replace(/\/$/, '');
})();
const WORKFLOW_URL = new URL(WORKFLOW_BASE);
const IS_LOCAL_WORKFLOW = ['localhost', '127.0.0.1', '::1'].includes(WORKFLOW_URL.hostname);
const COOKIE_ROOT = path.join(os.homedir(), '.webauto', 'cookies');
const COOKIE_SEEDS = [
  {
    matcher: /weibo\.com/i,
    seedFile: path.join(ROOT_DIR, 'cookies', 'session_weibo-fresh.json'),
    targetFilename: 'weibo.com.json',
    defaultProfile: 'weibo-fresh',
    label: 'weibo-cookie-seed',
  },
];

function parseArgs(argv){
  const cfg = loadBrowserServiceConfig();
  const args = {
    port: Number(cfg.port || 7704),
    host: String(cfg.host || '0.0.0.0'),
    headless: false,
    profile: 'default',
    url: '',
    restart: false,
    devConsole: false,
  };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a === '--port') { args.port = Number(argv[++i]); continue; }
    if (a === '--host') { args.host = String(argv[++i] || "0.0.0.0"); continue; }
    if (a === '--profile') { args.profile = argv[++i] || "default"; continue; }
    if (a === '--headless') { args.headless = true; continue; }
    if (a === '--url') { args.url = argv[++i] || ''; continue; }
    if (a === '--restart' || a === '--force-restart') { args.restart = true; continue; }
    if (a === '--dev') { args.devConsole = true; continue; }
  }
  return args;
}

function matchCookieSeed(url) {
  if (!url) return null;
  return COOKIE_SEEDS.find((seed) => seed.matcher.test(url)) || null;
}

function applyCookieDefaults(args, seed) {
  if (!seed) return;
  if (args.profile === 'default' && seed.defaultProfile) {
    args.profile = seed.defaultProfile;
    console.log(`[one-click] URL 匹配 ${seed.label || seed.targetFilename}，自动使用 profile=${args.profile}`);
  }
}

function runNode(file, args=[]) {
  return new Promise((resolve)=>{
    const p = spawn(process.execPath, [file, ...args], { stdio: 'inherit' });
    p.on('exit', code => resolve(code||0));
  });
}

async function waitHealth(url, timeoutMs=15000){
  const t0 = Date.now();
  while (Date.now()-t0 < timeoutMs){
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await wait(300);
  }
  return false;
}

async function post(url, body){
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
}

function waitForSocket(host, port, timeoutMs=8000) {
  return new Promise((resolve) => {
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

const PYTHON_CANDIDATES = process.platform === 'win32'
  ? ['python', 'py', 'python3']
  : ['python3', 'python'];

function spawnPython(args) {
  return new Promise((resolve, reject) => {
    const queue = [...PYTHON_CANDIDATES];
    const tryNext = () => {
      const cmd = queue.shift();
      if (!cmd) {
        reject(new Error('未找到可用的 python 解释器，请安装 python3 或设置 PATH'));
        return;
      }
      const child = spawn(cmd, args, { cwd: ROOT_DIR, stdio: 'inherit' });
      let resolved = false;
      child.once('error', (err) => {
        if (!resolved && err && err.code === 'ENOENT') {
          tryNext();
        } else if (!resolved) {
          reject(err);
        }
      });
      child.once('spawn', () => {
        resolved = true;
        resolve(child);
      });
    };
    tryNext();
  });
}

function spawnNpmDev(extraEnv = {}) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = { ...process.env, NODE_ENV: 'development', ...extraEnv };
  return spawn(npmCmd, ['run', 'dev'], {
    cwd: FLOATING_APP_DIR,
    stdio: 'inherit',
    env,
  });
}

async function launchFloatingConsole() {
  if (!fs.existsSync(path.join(FLOATING_APP_DIR, 'package.json'))) {
    console.warn('[one-click] floating console 未安装，跳过 --dev 浮窗启动');
    return;
  }

  console.log('[one-click] --dev 模式：启动 WebSocket server 与浮窗控制台...');
  let serverProc;
  try {
    const serverArgs = [WS_SERVER_SCRIPT, '--host', DEFAULT_WS_HOST, '--port', String(DEFAULT_WS_PORT)];
    serverProc = await spawnPython(serverArgs);
  } catch (error) {
    console.warn('[one-click] 启动 WebSocket server 失败：', error?.message || String(error));
    return;
  }

  const ready = await waitForSocket(DEFAULT_WS_HOST, DEFAULT_WS_PORT, 8000);
  if (!ready) {
    console.warn(`[one-click] ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT} 未就绪，浮窗会自行重试连接`);
  }

  const wsUrl = `ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT}`;
  const uiProc = spawnNpmDev({ WEBAUTO_FLOATING_WS_URL: wsUrl });
  const cleanup = () => {
    if (uiProc && !uiProc.killed) {
      uiProc.kill();
    }
    if (serverProc && !serverProc.killed) {
      serverProc.kill();
    }
  };

  const signalHandler = () => {
    cleanup();
    process.exit();
  };
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  try {
    await new Promise((resolve, reject) => {
      uiProc.on('exit', (code) => {
        console.log(`[one-click] 浮窗控制台已退出 (code=${code ?? 0})`);
        resolve();
      });
      uiProc.on('error', (err) => {
        console.error('[one-click] 浮窗控制台启动失败:', err?.message || String(err));
        reject(err);
      });
    });
  } finally {
    cleanup();
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
  }
}

async function main(){
  const args = parseArgs(process.argv);
  const cookieSeed = matchCookieSeed(args.url);
  applyCookieDefaults(args, cookieSeed);
  const { port, host, headless, profile, url, restart, devConsole } = args;
  const baseHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const base = `http://${baseHost}:${port}`;
  await ensureWorkflowApi();
  if (cookieSeed) {
    provisionCookieSeed(cookieSeed);
  }

  if (restart) {
    await runNode('utils/scripts/service/restart-browser-service.mjs', []);
  }

  // 确保服务在后台运行
  let healthy = await waitHealth(`${base}/health`, 1000);
  let serviceChild = null;
  if (!healthy){
    serviceChild = spawn(process.execPath, ['libs/browser/remote-service.js', '--host', String(host), '--port', String(port)], {
      stdio: 'inherit',
      env: { ...process.env, BROWSER_SERVICE_AUTO_EXIT: '1' },
    });
    serviceChild.on('exit', (code) => {
      process.exit(code ?? 0);
    });
    healthy = await waitHealth(`${base}/health`, 8000);
  }
  if (!healthy){
    console.error(`[one-click] browser service not healthy on :${port}`);
    process.exit(1);
  }

  // 启动浏览器会话
  const startRes = await post(`${base}/command`, { action:'start', args:{ headless, profileId: profile, url } });
  if (!(startRes && startRes.ok)) throw new Error('start failed');
  console.log(`[one-click] browser started: profile=${profile}, headless=${headless}`);

  // 启用自动 Cookie 动态注入/保存
  try { await post(`${base}/command`, { action:'autoCookies:start', args:{ profileId: profile, intervalMs: 2500 } }); } catch {}

  // 可选导航
  if (url){
    const gotoRes = await post(`${base}/command`, { action:'goto', args:{ url, profileId: profile, waitTime: 2, keepOpen: !headless } }).catch(e=>{ console.warn('[one-click] goto failed:', e?.message||String(e)); return null; });
    if (gotoRes && gotoRes.ok) {
      console.log(`[one-click] navigated: ${url} (title=${gotoRes.info?.title||''})`);
      // 访问后尝试保存 Cookie（标准路径）
      const cookiePath = url.includes('weibo.com')
        ? '~/.webauto/cookies/weibo-domestic.json'
        : '~/.webauto/cookies/visited-default.json';
      try {
        const saved = await post(`${base}/command`, { action:'saveCookies', args:{ path: cookiePath, profileId: profile } });
        console.log(`[one-click] cookies saved -> ${cookiePath} (${saved.ok?'ok':'fail'})`);
      } catch (e) {
        console.warn('[one-click] saveCookies failed:', e?.message||String(e));
      }
    }
  }

  console.log(`[one-click] ready. Health: ${base}/health, Events: ${base}/events`);

  if (devConsole) {
    await launchFloatingConsole();
  }
}

main().catch(e=>{ console.error('[one-click] failed:', e?.message||String(e)); process.exit(1); });

function runNpmCommand(args = []) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, args, { cwd: ROOT_DIR, stdio: 'inherit' });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

function workflowDistReady() {
  return WORKFLOW_REQUIRED_FILES.every(file => fs.existsSync(file));
}

async function ensureWorkflowApi() {
  const healthUrl = `${WORKFLOW_BASE}/health`;
  const healthy = await waitHealth(healthUrl, 1000);
  if (healthy) return;

  if (!IS_LOCAL_WORKFLOW) {
    throw new Error(`Workflow API (${WORKFLOW_BASE}) 不可用，请确认远程服务可访问`);
  }

  if (!workflowDistReady()) {
    console.log('[one-click] Workflow API 构建缺失，自动执行 npm run build:services ...');
    await runNpmCommand(['run', 'build:services']);
    copyBrowserLibs();
    if (!workflowDistReady()) {
      throw new Error('Workflow API 构建仍缺失，请手动执行 npm run build:services 并检查 dist 输出');
    }
  } else {
    copyBrowserLibs();
  }

  console.log(`[one-click] 启动 Workflow API (${WORKFLOW_BASE}) ...`);
  const server = spawn(process.execPath, [WORKFLOW_ENTRY], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  });
  server.unref();

  const ready = await waitHealth(healthUrl, 20000);
  if (!ready) {
    throw new Error(`Workflow API 未在 ${WORKFLOW_BASE} 就绪，检查 dist 产物或端口占用`);
  }
}

function copyBrowserLibs() {
  try {
    if (!fs.existsSync(LIB_BROWSER_SRC)) return;
    fs.mkdirSync(path.dirname(LIB_BROWSER_DEST), { recursive: true });
    fs.cpSync(LIB_BROWSER_SRC, LIB_BROWSER_DEST, { recursive: true });
  } catch (err) {
    console.warn('[one-click] 复制 browser 库失败:', err?.message || String(err));
  }
}

function provisionCookieSeed(seed) {
  if (!seed) return;
  try {
    if (!fs.existsSync(seed.seedFile)) {
      console.warn('[one-click] 缺少 Cookie 种子文件:', seed.seedFile);
      return;
    }
    fs.mkdirSync(COOKIE_ROOT, { recursive: true });
    const target = path.join(COOKIE_ROOT, seed.targetFilename);
    fs.copyFileSync(seed.seedFile, target);
    console.log(`[one-click] 已加载 Cookie 种子 -> ${target}`);
  } catch (err) {
    console.warn('[one-click] Cookie 种子复制失败:', err?.message || String(err));
  }
}
