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
import { ensureBrowserServiceBuild as ensureBrowserServiceBuildArtifacts } from '../../../libs/browser/service-build-utils.js';

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
  const healthConfig = cfg.healthCheck || {};
  const args = {
    port: Number(cfg.port || 7704),
    host: String(cfg.host || '0.0.0.0'),
    headless: true,
    profile: 'default',
    url: '',
    restart: false,
    devConsole: true,
    devMode: false,
    consoleHeadless: true,
    consoleDetached: true,
    skipHealthCheck: !healthConfig.autoCheck, // 从配置读取
    strictCheck: healthConfig.strictMode || false,
    healthTimeout: healthConfig.timeout || 30000,
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
    if (a === '--console-ui') { args.consoleHeadless = false; continue; }
    if (a === '--console-headless') { args.consoleHeadless = true; continue; }
    if (a === '--console-detach') { args.consoleDetached = true; continue; }
    if (a === '--console-attach') { args.consoleDetached = false; continue; }
    if (a === '--skip-health') { args.skipHealthCheck = true; continue; }
    if (a === '--health-only') { args.healthOnly = true; continue; }
  }
  // 显式 --headless=false 支持
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--headless=false') {
      args.headless = false;
      break;
    }
  }
  if (args.devMode) {
    args.headless = true;
    // devMode 下仍然启动浮窗，但强制为无头模式
    args.consoleHeadless = true;
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

function spawnNpmDev(extraEnv = {}, options = {}) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    WEBAUTO_FLOATING_DISABLE_DEVTOOLS: process.env.WEBAUTO_FLOATING_DISABLE_DEVTOOLS || '1',
    WEBAUTO_FLOATING_BUS_URL:
      extraEnv.WEBAUTO_FLOATING_BUS_URL || process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:7701/bus',
    ...extraEnv,
  };
  const detached = Boolean(options.detached);
  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: FLOATING_APP_DIR,
    stdio: detached ? 'ignore' : 'inherit',
    detached,
    env,
  });
  if (detached) {
    child.unref();
  }
  return child;
}

async function launchFloatingConsole(targetUrl = '', options = {}) {
  const { headless = true, detached = true, devMode = false } = options;
  if (!fs.existsSync(path.join(FLOATING_APP_DIR, 'package.json'))) {
    console.warn('[one-click] floating console 未安装，跳过 --dev 浮窗启动');
    return;
  }

  killFloatingPanelProcesses();
  console.log(detached
    ? '[one-click] --dev 模式：后台启动浮窗控制台'
    : '[one-click] --dev 模式：启动浮窗控制台，使用 Node WebSocket 服务');
  const ready = await waitForSocket(DEFAULT_WS_HOST, DEFAULT_WS_PORT, 8000);
  if (!ready) {
    console.warn(`[one-click] ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT} 未就绪，浮窗会自行重试连接`);
  }

  const wsUrl = `ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT}`;
  const env = {
    WEBAUTO_FLOATING_WS_URL: wsUrl,
    WEBAUTO_FLOATING_BUS_URL: process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:7701/bus',
  };
  if (targetUrl) {
    env.WEBAUTO_FLOATING_TARGET_URL = targetUrl;
  }
  
  // 测试阶段（devMode）强制无头模式
  const finalHeadless = devMode ? true : headless;
  if (!('WEBAUTO_FLOATING_HEADLESS' in env)) {
    env.WEBAUTO_FLOATING_HEADLESS = finalHeadless ? '1' : '0';
  }
  
  const uiProc = spawnNpmDev(env, { detached });
  const cleanup = () => {
    if (uiProc && !uiProc.killed) {
      uiProc.kill();
    }
  };
  if (detached) {
    console.log(`[one-click] 浮窗控制台后台运行 (pid=${uiProc.pid})`);
    return;
  }
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

// 健康检查函数 - 调用统一的health-check.mjs
async function runHealthCheck() {
  try {
    console.log('[one-click] 🔍 运行完整健康检查...');
    
    // 使用spawn运行health-check.mjs，实时显示输出
    const healthCheckScript = path.join(ROOT_DIR, 'scripts', 'health-check.mjs');
    if (!fs.existsSync(healthCheckScript)) {
      console.log('[one-click] ⚠️  健康检查脚本不存在，跳过检查');
      return true;
    }

    return new Promise((resolve) => {
      const child = spawn(process.execPath, [healthCheckScript, '--quick'], {
        stdio: 'inherit',
        cwd: ROOT_DIR
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          console.log('[one-click] ✅ 健康检查通过');
          resolve(true);
        } else {
          console.log('[one-click] ❌ 健康检查发现问题');
          resolve(false);
        }
      });
      
      child.on('error', (err) => {
        console.log(`[one-click] ❌ 健康检查执行失败: ${err.message}`);
        resolve(false);
      });
    });
  } catch (err) {
    console.log(`[one-click] ❌ 健康检查错误: ${err.message}`);
    return false;
  }
}

// 检查端口是否被占用
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

async function main(){
  const args = parseArgs(process.argv);
  const { port, host, headless, profile, url, restart, devConsole, devMode, healthOnly, skipHealthCheck, strictCheck, healthTimeout } = args;
  
  // 健康检查模式
  if (healthOnly) {
    const ok = await runHealthCheck();
    process.exit(ok ? 0 : 1);
  }
  
  // 自动健康检查模块
  if (!skipHealthCheck) {
    console.log('[one-click] 🔍 运行启动前健康检查...');
    const healthCheckOk = await runHealthCheck();
    if (!healthCheckOk) {
      console.log('[one-click] ⚠️  健康检查发现问题');
      
      // 严格模式：直接退出
      if (strictCheck || process.env.WEBAUTO_STRICT_CHECK === '1') {
        console.log('[one-click] ❌ 严格模式：启动已取消');
        process.exit(1);
      }
      
      // 交互模式：询问用户
      console.log('[one-click] 输入 y 继续，其他键退出 (默认: 退出，5秒超时): ');
      
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        const answer = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve('n'), 5000);
          process.stdin.once('data', (data) => {
            clearTimeout(timeout);
            resolve(data.toString().trim().toLowerCase());
          });
        });
        
        if (answer !== 'y') {
          console.log('[one-click] 启动已取消');
          process.exit(1);
        }
      } else {
        // 非交互环境，默认取消
        console.log('[one-click] 非交互环境，启动已取消');
        process.exit(1);
      }
    }
  }
  
  if (devMode) {
    process.env.WEBAUTO_DEV_MODE = '1';
    process.env.WEBAUTO_FLOATING_HEADLESS = '1';
    console.log('[one-click] 开启 dev 模式：浏览器与浮窗均为 headless，不会弹出 UI');
  }
  
  // 测试阶段（devMode）强制浏览器无头模式
  const finalHeadless = devMode ? true : headless;
  
  const baseHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const base = `http://${baseHost}:${port}`;
  await ensureWorkflowApi();
  const rebuilt = ensureBrowserServiceBuildArtifacts('one-click');
  if (restart) {
    await runNode('runtime/infra/utils/scripts/service/restart-browser-service.mjs', []);
  }

  // 确保服务在后台运行
  let healthy = await waitHealth(`${base}/health`, 1000);
  let forceRestart = rebuilt;
  let serviceChild = null;
  const ensureBrowserService = async () => {
    if (healthy && !forceRestart) return;
    forceRestart = false;
    healthy = false;
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
        stdio: 'ignore',
        env: { ...process.env, BROWSER_SERVICE_AUTO_EXIT: '0' },
        detached: true,
      });
      child.on('error', (err) => {
        console.warn('[one-click] browser service spawn failed:', err?.message || String(err));
      });
      child.unref();
      serviceChild = child;
      console.log(`[one-click] browser service 启动 (pid=${child.pid})`);
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

  // 启动浏览器会话（使用最终的无头模式设置）
  const startRes = await post(`${base}/command`, { action:'start', args:{ headless: finalHeadless, profileId: profile, url } });
  if (!(startRes && startRes.ok)) throw new Error('start failed');
  console.log(`[one-click] browser started: profile=${profile}, headless=${headless}`);
  const sessionId = startRes.sessionId || startRes.profileId || profile;

  // 启用自动 Cookie 动态注入/保存
  try { await post(`${base}/command`, { action:'autoCookies:start', args:{ profileId: profile, intervalMs: 2500 } }); } catch {}

  // 可选导航
  let matchResult = null;
  if (url){
    const gotoRes = await post(`${base}/command`, { action:'goto', args:{ url, profileId: profile, waitTime: 2, keepOpen: !finalHeadless } }).catch(e=>{ console.warn('[one-click] goto failed:', e?.message||String(e)); return null; });
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
    const consoleHeadless = devMode ? true : (args.consoleHeadless ?? args.headless ?? true);
    await launchFloatingConsole(url, {
      headless: consoleHeadless,
      detached: args.consoleDetached !== false,
      devMode: devMode,
    });
    
    // 开发模式下检测浮窗连接和容器匹配
    if (devMode) {
      // 传递容器匹配结果给健康检查
      await verifyFloatingConsoleHealth(profile, sessionId, url, port, matchResult);
    }
  } else if (devMode) {
    // 即使不启动浮窗，开发模式下也运行健康检测
    console.log('[one-click] 开发模式：运行健康检测（不启动浮窗）');
    await verifyFloatingConsoleHealth(profile, sessionId, url, port, matchResult);
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

// 检测浮窗健康状态：真正的功能测试
// 此函数执行完整的端到端测试，验证浮窗是否真的能工作
async function verifyFloatingConsoleHealth(profileId, sessionId, url, port = 7704) {
  console.log('\n[one-click] 🔍 真实健康检测：验证浮窗端到端功能...');
  
  const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:7701/bus';
  const BUS_TARGET = new URL(BUS_URL);
  const BUS_BRIDGE_PORT = Number(BUS_TARGET.port || 7701);
  const BUS_BRIDGE_HOST = BUS_TARGET.hostname || '127.0.0.1';
  const BROWSER_HTTP_BASE = `http://127.0.0.1:${port}`;
  const WS_HOST = '127.0.0.1';
  const WS_PORT = 8765;
  const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;
  
  let allPassed = true;
  const checks = [];
  
  // 1. 测试 Browser Service HTTP 连接
  try {
    const browserHealth = await fetch(`${BROWSER_HTTP_BASE}/health`);
    if (browserHealth.ok) {
      checks.push({ name: 'Browser Service (HTTP)', status: '✅', detail: '健康检查通过' });
    } else {
      checks.push({ name: 'Browser Service (HTTP)', status: '❌', detail: `HTTP ${browserHealth.status}` });
      allPassed = false;
    }
  } catch (err) {
    checks.push({ name: 'Browser Service (HTTP)', status: '❌', detail: `连接失败: ${err.message}` });
    allPassed = false;
  }
  
  // 2. 测试 Browser Service WebSocket 连接（关键！）
  try {
    const wsConnected = await testWebSocketConnection(WS_URL, 5000);
    if (wsConnected) {
      checks.push({ name: 'Browser Service (WebSocket)', status: '✅', detail: `ws://${WS_PORT} 连接正常` });
    } else {
      checks.push({ name: 'Browser Service (WebSocket)', status: '❌', detail: `ws://${WS_PORT} 无法连接` });
      allPassed = false;
    }
  } catch (err) {
    checks.push({ name: 'Browser Service (WebSocket)', status: '❌', detail: `WebSocket 错误: ${err.message}` });
    allPassed = false;
  }
  
  // 3. 测试 Workflow API 连接
  try {
    const workflowHealth = await fetch(`${WORKFLOW_BASE}/health`);
    if (workflowHealth.ok) {
      checks.push({ name: 'Workflow API', status: '✅', detail: '健康检查通过' });
    } else {
      checks.push({ name: 'Workflow API', status: '❌', detail: `HTTP ${workflowHealth.status}` });
      allPassed = false;
    }
  } catch (err) {
    checks.push({ name: 'Workflow API', status: '❌', detail: `连接失败: ${err.message}` });
    allPassed = false;
  }
  
  // 4. 测试浮窗 Bus Bridge WebSocket（浮窗是否卡死的关键！）
  console.log('[one-click] 等待浮窗 Bus Bridge 启动...');
  await wait(2000);
  
  let busBridgePassed = false;
  let busBridgeError = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const busBridgeHealth = await fetch(`http://${BUS_BRIDGE_HOST}:${BUS_BRIDGE_PORT}/health`);
      if (busBridgeHealth.ok) {
        busBridgePassed = true;
        checks.push({ name: 'Bus Bridge (WebSocket)', status: '✅', detail: `端口 ${BUS_BRIDGE_PORT} 健康` });
        break;
      } else {
        busBridgeError = `HTTP ${busBridgeHealth.status}`;
      }
    } catch (err) {
      busBridgeError = err.message;
    }
    await wait(500);
  }
  
  if (!busBridgePassed) {
    checks.push({ name: 'Bus Bridge (WebSocket)', status: '❌', detail: `端口 ${BUS_BRIDGE_PORT} 未监听: ${busBridgeError}` });
    allPassed = false;
  }
  
  // 5. 测试容器匹配（真正的 WebSocket 调用，不是复用结果）
  if (url && url.includes('weibo.com')) {
    console.log('[one-click] 测试容器匹配 (WebSocket 调用)...');
    try {
      const matchResult = await testContainerMatching(WS_URL, profileId, url, 10000);
      if (matchResult.success) {
        const containerName = matchResult.containerName || 'unknown';
        const isValidWeiboContainer = containerName.includes('微博') || containerName.includes('weibo');
        if (isValidWeiboContainer) {
          checks.push({ name: 'Container Matching', status: '✅', detail: `Weibo 容器: ${containerName}` });
        } else {
          checks.push({ name: 'Container Matching', status: '⚠️', detail: `容器名不匹配 Weibo: ${containerName}` });
        }
      } else {
        checks.push({ name: 'Container Matching', status: '❌', detail: matchResult.error || '匹配失败' });
        allPassed = false;
      }
    } catch (err) {
      checks.push({ name: 'Container Matching', status: '❌', detail: `匹配异常: ${err.message}` });
      allPassed = false;
    }
  } else {
    checks.push({ name: 'Container Matching', status: '⚠️', detail: '非 Weibo URL，跳过' });
  }
  
  // 6. 测试浮窗能否通过 Bus Bridge 与 Controller 通信（端到端测试）
  console.log('[one-click] 测试浮窗与 Controller 通信...');
  try {
    const controllerResult = await testControllerCommunication(8970, profileId, url, 8000);
    if (controllerResult.success) {
      checks.push({ name: 'Controller Communication', status: '✅', detail: '浮窗 ↔ Controller 通信正常' });
    } else {
      checks.push({ name: 'Controller Communication', status: '❌', detail: controllerResult.error || '通信失败' });
      allPassed = false;
    }
  } catch (err) {
    checks.push({ name: 'Controller Communication', status: '❌', detail: `通信异常: ${err.message}` });
    allPassed = false;
  }
  
  // 7. 检查进程状态
  try {
    const psResult = execSync('ps aux | grep -E "(electron|floating-panel)" | grep -v grep | wc -l', { encoding: 'utf-8' }).trim();
    const processCount = parseInt(psResult, 10);
    if (processCount > 0) {
      checks.push({ name: 'Electron Processes', status: '✅', detail: `${processCount} 个进程` });
    } else {
      checks.push({ name: 'Electron Processes', status: '❌', detail: '无进程' });
      allPassed = false;
    }
  } catch (err) {
    checks.push({ name: 'Electron Processes', status: '⚠️', detail: '检查失败' });
  }
  
  // 输出检测结果
  console.log('\n' + '='.repeat(70));
  console.log('健康检测结果');
  console.log('='.repeat(70));
  checks.forEach(check => {
    console.log(`${check.status} ${check.name.padEnd(28)} ${check.detail}`);
  });
  console.log('='.repeat(70));
  
  if (allPassed) {
    console.log('\n🎉 所有健康检查通过！浮窗功能完整正常。');
    return true;
  } else {
    console.log('\n❌ 健康检测失败！发现问题：');
    const failures = checks.filter(c => c.status === '❌');
    failures.forEach(f => console.log(`   - ${f.name}: ${f.detail}`));
    console.log('\n💡 建议：');
    console.log('   1. 检查浮窗日志：查看 apps/floating-panel 产出');
    console.log('   2. 检查端口占用：lsof -i :7701 :8765 :7704');
    console.log('   3. 重新启动：先清理所有进程再重试');
    return false;
  }
}

// 测试 WebSocket 连接
async function testWebSocketConnection(wsUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.terminate();
        resolve(false);
      }
    }, timeoutMs);
    
    socket.on('open', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        socket.close();
        resolve(true);
      }
    });
    
    socket.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(false);
      }
    });
    
    socket.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });
}

// 测试容器匹配（真正的 WebSocket 调用）
async function testContainerMatching(wsUrl, profileId, url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    const requestId = Date.now();
    
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.terminate();
        resolve({ success: false, error: '超时（10秒）' });
      }
    }, timeoutMs);
    
    socket.on('open', () => {
      const payload = {
        type: 'command',
        session_id: profileId,
        data: {
          command_type: 'container_operation',
          action: 'match_root',
          page_context: { url },
        },
      };
      socket.send(JSON.stringify(payload));
    });
    
    socket.on('message', (data) => {
      if (settled) return;
      try {
        const msg = JSON.parse(data.toString('utf-8'));
        if (msg.type === 'response' || msg.data?.success) {
          settled = true;
          clearTimeout(timeout);
          const snapshot = msg.data?.data || msg.data;
          const container = snapshot?.matched_container || snapshot?.container || snapshot?.container_tree;
          const containerName = container?.name || container?.id || 'unknown';
          socket.close();
          resolve({ success: true, containerName });
        }
      } catch (err) {
        // 忽略解析错误
      }
    });
    
    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      }
    });
    
    socket.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, error: '连接关闭' });
      }
    });
  });
}

// 测试 Controller 通信（浮窗 ↔ Controller）
async function testControllerCommunication(controllerPort, profileId, url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${controllerPort}`);
    let settled = false;
    const requestId = Date.now();
    
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.terminate();
        resolve({ success: false, error: 'Controller 超时' });
      }
    }, timeoutMs);
    
    socket.on('open', () => {
      // 发送容器检查请求
      const payload = {
        type: 'action',
        action: 'containers:inspect',
        requestId,
        payload: {
          profile: profileId,
          url: url,
          maxDepth: 1,
          maxChildren: 6,
        },
      };
      socket.send(JSON.stringify(payload));
    });
    
    socket.on('message', (data) => {
      if (settled) return;
      try {
        const msg = JSON.parse(data.toString('utf-8'));
        if (msg.type === 'ready') {
          // Controller 就绪，继续等待响应
          return;
        }
        if (msg.type === 'response' && msg.requestId === requestId) {
          settled = true;
          clearTimeout(timeout);
          if (msg.success) {
            socket.close();
            resolve({ success: true });
          } else {
            socket.close();
            resolve({ success: false, error: msg.error || 'Controller 返回失败' });
          }
        }
      } catch (err) {
        // 忽略
      }
    });
    
    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, error: `连接错误: ${err.message}` });
      }
    });
    
    socket.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, error: '连接关闭' });
      }
    });
  });
}
