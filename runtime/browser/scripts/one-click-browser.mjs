#!/usr/bin/env node
// 一键启动浏览器（后台服务 + 会话 + 可选导航，基于配置文件）
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';
import { loadBrowserServiceConfig } from '../../../libs/browser/browser-service-config.js';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
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
const WORKFLOW_BASE = (() => {
  const cfg = loadBrowserServiceConfig();
  const base = cfg.backend?.baseUrl || 'http://127.0.0.1:7701';
  return base.replace(/\/$/, '');
})();
const WORKFLOW_URL = new URL(WORKFLOW_BASE);
const IS_LOCAL_WORKFLOW = ['localhost', '127.0.0.1', '::1'].includes(WORKFLOW_URL.hostname);

function parseArgs(argv){
  const cfg = loadBrowserServiceConfig();
  const args = {
    port: Number(cfg.port || 7704),
    host: String(cfg.host || '0.0.0.0'),
    headless: false,
    profile: 'default',
    url: '',
    restart: false,
    devConsole: true,
    devMode: false,
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
    if (a === '--no-dev') { args.devConsole = false; continue; }
    if (a === '--dev-mode') { args.devMode = true; continue; }
  }
  if (args.devMode) {
    args.headless = true;
    args.devConsole = false;
  }
  return args;
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

async function listActiveSessions(baseUrl) {
  try {
    const status = await post(`${baseUrl}/command`, { action: 'getStatus' });
    const sessions = status?.sessions || [];
    return Array.isArray(sessions) ? sessions : [];
  } catch (err) {
    console.warn('[one-click] 获取会话状态失败:', err?.message || String(err));
    return [];
  }
}

async function ensureExclusiveProfile(baseUrl, profileId) {
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
      console.log(`[one-click] 检测到 profile=${profileId} 的历史会话 ${duplicates.length} 个，准备清理...`);
    }

    const targets = Array.from(new Set(duplicates.map((session) => session.profileId || session.profile_id || profileId)));
    for (const target of targets) {
      try {
        await post(`${baseUrl}/command`, { action: 'stop', args: { profileId: target } });
        console.log(`[one-click] 已关闭旧会话 profile=${target}`);
      } catch (err) {
        const message = err?.message || '';
        if (message.includes('Unknown action: stop')) {
          console.warn('[one-click] 当前浏览器服务版本较旧，无法执行 stop，准备重启服务...');
          return false;
        }
        console.warn(`[one-click] 关闭旧会话 ${target} 失败:`, message || err);
      }
    }

    await wait(600);
  }
  throw new Error(`[one-click] 无法清理 profile=${profileId} 的旧实例，请手动检查`);
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

function spawnNpmDev(extraEnv = {}) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    WEBAUTO_FLOATING_DISABLE_DEVTOOLS: process.env.WEBAUTO_FLOATING_DISABLE_DEVTOOLS || '1',
    WEBAUTO_FLOATING_BUS_PORT:
      extraEnv.WEBAUTO_FLOATING_BUS_PORT || process.env.WEBAUTO_FLOATING_BUS_PORT || '8790',
    ...extraEnv,
  };
  return spawn(npmCmd, ['run', 'dev'], {
    cwd: FLOATING_APP_DIR,
    stdio: 'inherit',
    env,
  });
}

async function launchFloatingConsole(targetUrl = '') {
  if (!fs.existsSync(path.join(FLOATING_APP_DIR, 'package.json'))) {
    console.warn('[one-click] floating console 未安装，跳过 --dev 浮窗启动');
    return;
  }

  killFloatingPanelProcesses();
  console.log('[one-click] --dev 模式：启动浮窗控制台，使用 Node WebSocket 服务');
  const ready = await waitForSocket(DEFAULT_WS_HOST, DEFAULT_WS_PORT, 8000);
  if (!ready) {
    console.warn(`[one-click] ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT} 未就绪，浮窗会自行重试连接`);
  }

  const wsUrl = `ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT}`;
  const env = {
    WEBAUTO_FLOATING_WS_URL: wsUrl,
    WEBAUTO_FLOATING_BUS_PORT: process.env.WEBAUTO_FLOATING_BUS_PORT || '8790',
  };
  if (targetUrl) {
    env.WEBAUTO_FLOATING_TARGET_URL = targetUrl;
  }
  if (!('WEBAUTO_FLOATING_HEADLESS' in env)) {
    env.WEBAUTO_FLOATING_HEADLESS = process.env.WEBAUTO_FLOATING_HEADLESS ?? '0';
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
  const { port, host, headless, profile, url, restart, devConsole, devMode } = args;
  if (devMode) {
    process.env.WEBAUTO_DEV_MODE = '1';
    console.log('[one-click] 开启 dev 模式：浏览器与浮窗均为 headless，不会弹出 UI');
  }
  const baseHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const base = `http://${baseHost}:${port}`;
  await ensureWorkflowApi();

  if (restart) {
    await runNode('runtime/infra/utils/scripts/service/restart-browser-service.mjs', []);
  }

  // 确保服务在后台运行
  let healthy = await waitHealth(`${base}/health`, 1000);
  let serviceChild = null;
  const ensureBrowserService = async () => {
    if (healthy) return;
    for (let attempt = 0; attempt < 3 && !healthy; attempt++) {
      killBrowserServiceProcesses();
      killPort(port);
      killPort(DEFAULT_WS_PORT);
      await wait(800);
      const child = spawn(process.execPath, [
        'libs/browser/remote-service.js',
        '--host', String(host),
        '--port', String(port),
        '--ws-host', DEFAULT_WS_HOST,
        '--ws-port', String(DEFAULT_WS_PORT),
      ], {
        stdio: 'inherit',
        env: { ...process.env, BROWSER_SERVICE_AUTO_EXIT: '0' },
      });
      serviceChild = child;
      child.on('exit', (code) => {
        if (serviceChild !== child) return;
        if (code === 0) {
          process.exit(0);
        } else {
          console.warn(`[one-click] browser service exited with code ${code}`);
        }
      });
      child.on('error', (err) => {
        console.warn('[one-click] browser service spawn failed:', err?.message || String(err));
      });
      healthy = await waitHealth(`${base}/health`, 4000);
      if (healthy) return;
    }
    throw new Error(`[one-click] browser service not healthy on :${port}`);
  };
  await ensureBrowserService();
  const exclusivityReady = await ensureExclusiveProfile(base, profile);
  if (exclusivityReady === false) {
    killBrowserServiceProcesses();
    killPort(port);
    killPort(DEFAULT_WS_PORT);
    await wait(800);
    healthy = false;
    await ensureBrowserService();
    await ensureExclusiveProfile(base, profile);
  }

  // 启动浏览器会话
  const startRes = await post(`${base}/command`, { action:'start', args:{ headless, profileId: profile, url } });
  if (!(startRes && startRes.ok)) throw new Error('start failed');
  console.log(`[one-click] browser started: profile=${profile}, headless=${headless}`);
  const sessionId = startRes.sessionId || startRes.profileId || profile;

  // 启用自动 Cookie 动态注入/保存
  try { await post(`${base}/command`, { action:'autoCookies:start', args:{ profileId: profile, intervalMs: 2500 } }); } catch {}

  // 可选导航
  let matchResult = null;
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
      try {
        matchResult = await autoMatchRootContainer({
          sessionId,
          url,
          wsHost: DEFAULT_WS_HOST,
          wsPort: DEFAULT_WS_PORT,
        });
      } catch (err) {
        console.warn('[one-click] auto match root failed:', err?.message || String(err));
      }
    }
  }

  console.log(`[one-click] ready. Health: ${base}/health, Events: ${base}/events`);
  if (!matchResult?.data?.success) {
    console.error('[one-click] ERROR: root container matching failed. Inspect WS logs or container definitions.');
    process.exitCode = 2;
  }

  if (devConsole && !process.argv.includes('--no-dev')) {
    await launchFloatingConsole(url);
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

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %p in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /F /PID %p`, { stdio: 'ignore' });
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 || true`, { stdio: 'ignore' });
    }
  } catch {}
}

function killBrowserServiceProcesses() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM remote-service.exe || taskkill /F /IM node.exe /FI "WINDOWTITLE eq remote-service"', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "libs/browser/remote-service.js" || true', { stdio: 'ignore' });
      execSync('pkill -f "dist/services/browser-service/index.js" || true', { stdio: 'ignore' });
    }
  } catch {}
}

function killFloatingPanelProcesses() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM electron.exe /FI "WINDOWTITLE eq WebAuto Floating Console" || true', { stdio: 'ignore' });
      execSync('taskkill /F /IM electronmon.exe || true', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "apps/floating-panel/node_modules/electron/dist/Electron.app" || true', { stdio: 'ignore' });
      execSync('pkill -f "electronmon" || true', { stdio: 'ignore' });
    }
  } catch {}
}

async function autoMatchRootContainer({ sessionId, url, wsHost, wsPort }) {
  if (!sessionId || !url) return null;
  const wsUrl = `ws://${wsHost}:${wsPort}`;
  const payload = {
    type: 'command',
    session_id: sessionId,
    data: {
      command_type: 'container_operation',
      action: 'match_root',
      page_context: { url },
    },
  };
  console.log(`[one-click] matching root container via ${wsUrl} (${url})`);
  const response = await sendWsCommand(wsUrl, payload);
  if (response?.data?.success) {
    const match = response.data.data || {};
    const container = match.matched_container || match.container;
    console.log('[one-click] container match:', container?.name || container?.id || 'unknown');
    return response;
  } else {
    console.warn('[one-click] container match failed:', response?.data?.error || response?.error || 'unknown');
    throw new Error(response?.data?.error || response?.error || 'unknown container match result');
  }
}

function sendWsCommand(wsUrl, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
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
