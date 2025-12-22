#!/usr/bin/env node
// 一键启动浏览器 v2 - 支持有头浏览器 + 有头浮窗
// 启动顺序：workflow api → browser-service → controller → floating-panel
// 包含硬端口验证（包括 8790）

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const FLOATING_APP_DIR = path.join(ROOT_DIR, 'apps', 'floating-panel');
const WORKFLOW_ENTRY = path.join(ROOT_DIR, 'dist', 'sharedmodule', 'engines', 'api-gateway', 'server.js');
const WORKFLOW_REQUIRED_FILES = [
  WORKFLOW_ENTRY,
  path.join(ROOT_DIR, 'dist', 'libs', 'browser', 'cookie-manager.js'),
  path.join(ROOT_DIR, 'dist', 'services', 'browser-service', 'index.js'),
];

// 端口配置
const PORTS = {
  WORKFLOW_API: 7701,
  BROWSER_SERVICE: 7704,
  BUS_BRIDGE: 8790,
  CONTROLLER: 8970,
  WS: 8765
};

const DEFAULT_WS_HOST = '127.0.0.1';
const DEFAULT_WS_PORT = PORTS.WS;

// 从配置加载
function loadConfig() {
  try {
    const configPath = path.join(ROOT_DIR, 'config', 'browser-service.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[v2] 无法加载配置:', err.message);
  }
  return {};
}

function parseArgs(argv) {
  const cfg = loadConfig();
  const healthConfig = cfg.healthCheck || {};
  
  const args = {
    port: Number(cfg.port || PORTS.BROWSER_SERVICE),
    host: String(cfg.host || '127.0.0.1'),
    headless: false, // 默认有头模式
    profile: 'default',
    url: '',
    restart: false,
    devConsole: true,
    devMode: false,
    consoleHeadless: false, // 默认有头浮窗
    consoleDetached: true,
    skipHealthCheck: !healthConfig.autoCheck,
    strictCheck: healthConfig.strictMode || false,
    healthTimeout: healthConfig.timeout || 30000,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') { args.port = Number(argv[++i]); continue; }
    if (a === '--host') { args.host = String(argv[++i] || "127.0.0.1"); continue; }
    if (a === '--profile') { args.profile = argv[++i] || "default"; continue; }
    if (a === '--headless') { args.headless = true; continue; }
    if (a === '--url') { args.url = argv[++i] || ''; continue; }
    if (a === '--restart') { args.restart = true; continue; }
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
    args.consoleHeadless = true;
  }

  return args;
}

// 端口验证函数
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

function waitForSocket(host, port, timeoutMs = 8000) {
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

function waitForWebSocket(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = () => {
      const ws = new WebSocket(`ws://${host}:${port}`);
      let settled = false;
      
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          resolve(false);
        }
      }, 500);

      ws.on('open', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        }
      });

      ws.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          if (Date.now() - start >= timeoutMs) {
            resolve(false);
          } else {
            setTimeout(attempt, 300);
          }
        }
      });

      ws.on('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    };
    attempt();
  });
}

function waitHealth(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) {
          resolve(true);
          return;
        }
      } catch {}
      
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(attempt, 300);
      }
    };
    attempt();
  });
}

// 端口验证和清理
async function validateAndCleanPorts() {
  console.log('[v2] 🔍 验证端口状态...');
  
  const portsToCheck = [
    { port: PORTS.WORKFLOW_API, name: 'Workflow API' },
    { port: PORTS.BROWSER_SERVICE, name: 'Browser Service' },
    { port: PORTS.BUS_BRIDGE, name: 'Bus Bridge (浮窗)' },
    { port: PORTS.CONTROLLER, name: 'Controller' },
    { port: PORTS.WS, name: 'WebSocket' }
  ];

  const results = [];
  for (const check of portsToCheck) {
    const inUse = await isPortInUse(check.port);
    results.push({ ...check, inUse });
    if (inUse) {
      console.log(`[v2] ⚠️  端口 ${check.port} (${check.name}) 已被占用`);
    } else {
      console.log(`[v2] ✅ 端口 ${check.port} (${check.name}) 空闲`);
    }
  }

  const occupied = results.filter(r => r.inUse);
  if (occupied.length > 0) {
    console.log('\n[v2] 发现占用端口，尝试清理...');
    for (const port of occupied.map(r => r.port)) {
      killPort(port);
    }
    await wait(1000);
    
    // 重新验证
    const stillOccupied = [];
    for (const port of occupied.map(r => r.port)) {
      if (await isPortInUse(port)) {
        stillOccupied.push(port);
      }
    }
    
    if (stillOccupied.length > 0) {
      console.log(`[v2] ❌ 无法释放端口: ${stillOccupied.join(', ')}`);
      console.log('[v2] 请手动关闭占用进程或重启系统');
      process.exit(1);
    }
  }

  console.log('[v2] ✅ 所有端口验证通过');
}

// 启动顺序管理
async function launchWorkflowAPI() {
  const healthUrl = `http://127.0.0.1:${PORTS.WORKFLOW_API}/health`;
  
  // 检查是否已运行
  if (await waitHealth(healthUrl, 1000)) {
    console.log('[v2] ✅ Workflow API 已在运行');
    return true;
  }

  // 检查构建产物
  if (!WORKFLOW_REQUIRED_FILES.every(file => fs.existsSync(file))) {
    console.log('[v2] ⚠️  Workflow API 构建缺失，执行构建...');
    await runNpmCommand(['run', 'build:services']);
    copyBrowserLibs();
    
    if (!WORKFLOW_REQUIRED_FILES.every(file => fs.existsSync(file))) {
      throw new Error('Workflow API 构建失败');
    }
  } else {
    copyBrowserLibs();
  }

  console.log(`[v2] 🚀 启动 Workflow API (端口 ${PORTS.WORKFLOW_API})...`);
  const server = spawn(process.execPath, [WORKFLOW_ENTRY], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  });
  server.unref();

  const ready = await waitHealth(healthUrl, 20000);
  if (!ready) {
    throw new Error(`Workflow API 未在 ${healthUrl} 就绪`);
  }
  
  console.log('[v2] ✅ Workflow API 启动成功');
  return true;
}

async function launchBrowserService(port, host) {
  const healthUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/health`;
  
  // 检查是否已运行
  if (await waitHealth(healthUrl, 1000)) {
    console.log('[v2] ✅ Browser Service 已在运行');
    return true;
  }

  console.log(`[v2] 🚀 启动 Browser Service (端口 ${port})...`);
  
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
    console.warn('[v2] Browser Service 启动失败:', err.message);
  });
  
  child.unref();

  const ready = await waitHealth(healthUrl, 15000);
  if (!ready) {
    throw new Error(`Browser Service 未在 ${healthUrl} 就绪`);
  }

  console.log('[v2] ✅ Browser Service 启动成功');
  return true;
}

async function launchController() {
  const controllerWsUrl = `ws://127.0.0.1:${PORTS.CONTROLLER}`;
  
  // 检查是否已运行
  const wsReady = await waitForWebSocket('127.0.0.1', PORTS.CONTROLLER, 2000);
  if (wsReady) {
    console.log('[v2] ✅ Controller 已在运行');
    return true;
  }

  console.log(`[v2] 🚀 启动 Controller (端口 ${PORTS.CONTROLLER})...`);
  
  const USER_CONTAINER_ROOT = path.join(os.homedir(), '.webauto', 'container-lib');
  const CONTAINER_INDEX_PATH = path.join(ROOT_DIR, 'container-library.index.json');
  
  const controllerScript = path.join(ROOT_DIR, 'runtime', 'infra', 'controller', 'controller.mjs');
  if (!fs.existsSync(controllerScript)) {
    console.warn('[v2] ⚠️  Controller 脚本不存在，跳过 Controller 启动');
    return true;
  }

  const child = spawn(process.execPath, [
    controllerScript,
    `--host=127.0.0.1`,
    `--port=${PORTS.CONTROLLER}`
  ], {
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      WEBAUTO_USER_CONTAINER_ROOT: USER_CONTAINER_ROOT,
      WEBAUTO_CONTAINER_INDEX: CONTAINER_INDEX_PATH,
      WEBAUTO_BROWSER_HTTP_HOST: '127.0.0.1',
      WEBAUTO_BROWSER_HTTP_PORT: String(PORTS.BROWSER_SERVICE),
      WEBAUTO_BROWSER_HTTP_PROTO: 'http',
      WEBAUTO_WS_HOST: DEFAULT_WS_HOST,
      WEBAUTO_WS_PORT: String(DEFAULT_WS_PORT),
    }
  });
  
  child.unref();

  const ready = await waitForWebSocket('127.0.0.1', PORTS.CONTROLLER, 15000);
  if (!ready) {
    throw new Error(`Controller 未在 ws://127.0.0.1:${PORTS.CONTROLLER} 就绪`);
  }

  console.log('[v2] ✅ Controller 启动成功');
  return true;
}

async function launchFloatingPanel(targetUrl, options) {
  const { headless, detached, devMode } = options;
  
  if (!fs.existsSync(path.join(FLOATING_APP_DIR, 'package.json'))) {
    console.warn('[v2] ⚠️  Floating Panel 未安装，跳过启动');
    return true;
  }

  // 检查 Bus Bridge 端口
  const busBridgeReady = await waitForSocket('127.0.0.1', PORTS.BUS_BRIDGE, 2000);
  if (!busBridgeReady) {
    console.log(`[v2] ⚠️  Bus Bridge 端口 ${PORTS.BUS_BRIDGE} 未就绪，浮窗可能无法连接`);
  } else {
    console.log(`[v2] ✅ Bus Bridge 端口 ${PORTS.BUS_BRIDGE} 可用`);
  }

  // 检查 WS 端口
  const wsReady = await waitForWebSocket(DEFAULT_WS_HOST, DEFAULT_WS_PORT, 2000);
  if (!wsReady) {
    console.log(`[v2] ⚠️  WS 端口 ${DEFAULT_WS_PORT} 未就绪，浮窗会自行重试`);
  } else {
    console.log(`[v2] ✅ WS 端口 ${DEFAULT_WS_PORT} 可用`);
  }

  console.log(`[v2] 🚀 启动 Floating Panel (有头模式: ${!headless})...`);
  
  // 清理旧进程
  killFloatingPanelProcesses();
  await wait(500);

  const wsUrl = `ws://${DEFAULT_WS_HOST}:${DEFAULT_WS_PORT}`;
  const env = {
    ...process.env,
    WEBAUTO_FLOATING_WS_URL: wsUrl,
    WEBAUTO_FLOATING_BUS_PORT: String(PORTS.BUS_BRIDGE),
    WEBAUTO_FLOATING_HEADLESS: headless ? '1' : '0',
    WEBAUTO_DEV_MODE: devMode ? '1' : '0',
  };
  
  if (targetUrl) {
    env.WEBAUTO_FLOATING_TARGET_URL = targetUrl;
  }

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: FLOATING_APP_DIR,
    stdio: detached ? 'ignore' : 'inherit',
    detached,
    env,
  });

  if (detached) {
    child.unref();
    console.log(`[v2] ✅ Floating Panel 后台运行 (PID: ${child.pid})`);
    return true;
  }

  // 非 detached 模式，等待进程
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      console.log(`[v2] Floating Panel 已退出 (code=${code ?? 0})`);
      resolve(true);
    });
    child.on('error', (err) => {
      console.error('[v2] Floating Panel 启动失败:', err.message);
      reject(err);
    });
  });
}

// 健康检查
async function runHealthCheck(profileId, url) {
  console.log('\n[v2] 🔍 运行完整健康检查...');
  
  const checks = [];
  let allPassed = true;

  // 1. Workflow API
  const workflowOk = await waitHealth(`http://127.0.0.1:${PORTS.WORKFLOW_API}/health`, 2000);
  checks.push({ name: 'Workflow API', ok: workflowOk, detail: workflowOk ? '健康' : '不可用' });
  allPassed = allPassed && workflowOk;

  // 2. Browser Service
  const browserOk = await waitHealth(`http://127.0.0.1:${PORTS.BROWSER_SERVICE}/health`, 2000);
  checks.push({ name: 'Browser Service', ok: browserOk, detail: browserOk ? '健康' : '不可用' });
  allPassed = allPassed && browserOk;

  // 3. WebSocket
  const wsOk = await waitForWebSocket(DEFAULT_WS_HOST, DEFAULT_WS_PORT, 2000);
  checks.push({ name: 'WebSocket', ok: wsOk, detail: wsOk ? '连接正常' : '无法连接' });
  allPassed = allPassed && wsOk;

  // 4. Bus Bridge
  const busOk = await waitForSocket('127.0.0.1', PORTS.BUS_BRIDGE, 2000);
  checks.push({ name: 'Bus Bridge', ok: busOk, detail: busOk ? '监听正常' : '未监听' });
  allPassed = allPassed && busOk;

  // 5. Controller
  const controllerOk = await waitForWebSocket('127.0.0.1', PORTS.CONTROLLER, 2000);
  checks.push({ name: 'Controller', ok: controllerOk, detail: controllerOk ? '连接正常' : '不可用' });
  allPassed = allPassed && controllerOk;

  // 6. 容器匹配 (如果提供了 URL)
  if (url && url.includes('weibo.com')) {
    const matchResult = await testContainerMatching(DEFAULT_WS_HOST, DEFAULT_WS_PORT, profileId, url);
    checks.push({ name: 'Container Match', ok: matchResult.success, detail: matchResult.message || '匹配结果' });
    allPassed = allPassed && matchResult.success;
  }

  // 输出结果
  console.log('\n' + '='.repeat(70));
  console.log('健康检查结果');
  console.log('='.repeat(70));
  checks.forEach(check => {
    const status = check.ok ? '✅' : '❌';
    console.log(`${status} ${check.name.padEnd(20)} ${check.detail}`);
  });
  console.log('='.repeat(70));

  if (allPassed) {
    console.log('\n🎉 所有健康检查通过！');
    return true;
  } else {
    console.log('\n❌ 健康检查发现问题');
    return false;
  }
}

// 测试容器匹配
async function testContainerMatching(host, port, profileId, url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        resolve({ success: false, message: '超时' });
      }
    }, 5000);

    ws.on('open', () => {
      const payload = {
        type: 'command',
        session_id: profileId,
        data: {
          command_type: 'container_operation',
          action: 'match_root',
          page_context: { url },
        },
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
      if (settled) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'response' || msg.data?.success) {
          settled = true;
          clearTimeout(timeout);
          const result = msg.data?.data || msg.data;
          const container = result?.matched_container || result?.container;
          const name = container?.name || container?.id || 'unknown';
          ws.close();
          resolve({ success: true, message: `匹配成功: ${name}` });
        }
      } catch {}
    });

    ws.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, message: 'WebSocket 错误' });
      }
    });

    ws.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, message: '连接关闭' });
      }
    });
  });
}

// 辅助函数
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

function copyBrowserLibs() {
  const LIB_BROWSER_SRC = path.join(ROOT_DIR, 'libs', 'browser');
  const LIB_BROWSER_DEST = path.join(ROOT_DIR, 'dist', 'libs', 'browser');
  try {
    if (!fs.existsSync(LIB_BROWSER_SRC)) return;
    fs.mkdirSync(path.dirname(LIB_BROWSER_DEST), { recursive: true });
    fs.cpSync(LIB_BROWSER_SRC, LIB_BROWSER_DEST, { recursive: true });
  } catch (err) {
    console.warn('[v2] 复制 browser 库失败:', err.message);
  }
}

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %p in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /F /PID %p`, { stdio: 'ignore' });
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {}
}

function killFloatingPanelProcesses() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM electron.exe /FI "WINDOWTITLE eq WebAuto Floating Console" 2>nul || true', { stdio: 'ignore' });
      execSync('taskkill /F /IM electronmon.exe 2>nul || true', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "apps/floating-panel/node_modules/electron/dist/Electron.app" 2>/dev/null || true', { stdio: 'ignore' });
      execSync('pkill -f "electronmon" 2>/dev/null || true', { stdio: 'ignore' });
    }
  } catch {}
}

// 主函数
async function main() {
  const args = parseArgs(process.argv);
  const { port, host, headless, profile, url, devConsole, devMode, healthOnly, skipHealthCheck } = args;

  // 健康检查模式
  if (healthOnly) {
    const ok = await runHealthCheck(profile, url);
    process.exit(ok ? 0 : 1);
  }

  console.log('[v2] 🚀 WebAuto 启动脚本 v2 - 有头浏览器 + 有头浮窗');
  console.log('[v2] 启动顺序: Workflow API → Browser Service → Controller → Floating Panel');
  console.log('');

  // 步骤 1: 端口验证和清理
  await validateAndCleanPorts();

  // 步骤 2: 启动 Workflow API
  try {
    await launchWorkflowAPI();
  } catch (err) {
    console.error('[v2] ❌ Workflow API 启动失败:', err.message);
    process.exit(1);
  }

  // 步骤 3: 启动 Browser Service
  try {
    await launchBrowserService(port, host);
  } catch (err) {
    console.error('[v2] ❌ Browser Service 启动失败:', err.message);
    process.exit(1);
  }

  // 步骤 4: 启动 Controller
  try {
    await launchController();
  } catch (err) {
    console.error('[v2] ❌ Controller 启动失败:', err.message);
    process.exit(1);
  }

  // 步骤 5: 启动浏览器会话
  console.log(`[v2] 🚀 启动浏览器会话 (profile=${profile}, headless=${headless})...`);
  try {
    const base = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
    const startRes = await fetch(`${base}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start', args: { headless, profileId: profile, url } })
    });
    const result = await startRes.json();
    if (!result?.ok) {
      throw new Error('浏览器启动失败');
    }
    const sessionId = result.sessionId || result.profileId || profile;
    console.log(`[v2] ✅ 浏览器已启动 (session=${sessionId})`);

    // 启用自动 Cookie 保存
    try {
      await fetch(`${base}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'autoCookies:start', args: { profileId: profile, intervalMs: 2500 } })
      });
    } catch {}
  } catch (err) {
    console.error('[v2] ❌ 浏览器会话启动失败:', err.message);
    process.exit(1);
  }

  // 步骤 6: 启动 Floating Panel
  if (devConsole) {
    const consoleHeadless = devMode ? true : args.consoleHeadless;
    try {
      await launchFloatingPanel(url, {
        headless: consoleHeadless,
        detached: args.consoleDetached !== false,
        devMode: devMode
      });
    } catch (err) {
      console.error('[v2] ❌ Floating Panel 启动失败:', err.message);
      // 不退出，因为主流程已完成
    }
  }

  // 步骤 7: 模块健康检查
  if (!skipHealthCheck) {
    await wait(3000); // 等待服务完全就绪
    
    console.log('\n' + '='.repeat(60));
    console.log('[v2] 【第 7 步】模块健康检查');
    console.log('='.repeat(60));
    
    const healthOk = await runHealthCheck(profile, url);
    
    // 步骤 8: 根容器匹配验证（仅对微博 URL）
    if (url && url.includes('weibo.com')) {
      console.log('\n' + '='.repeat(60));
      console.log('[v2] 【第 8 步】根容器匹配验证');
      console.log('='.repeat(60));
      
      try {
        const matchResult = await testContainerMatching(DEFAULT_WS_HOST, DEFAULT_WS_PORT, profile, url);
        if (matchResult.success) {
          console.log(`\n[v2] ✅ 根容器匹配成功: ${matchResult.containerName}`);
        } else {
          console.log(`\n[v2] ❌ 根容器匹配失败: ${matchResult.message}`);
        }
      } catch (err) {
        console.log(`\n[v2] ❌ 根容器匹配错误: ${err.message}`);
      }
    }
    
    if (!healthOk) {
      console.log('\n[v2] ⚠️  健康检查发现问题，但已启动所有服务');
      console.log('[v2] 💡 建议手动检查各服务状态');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('[v2] ✅ 启动流程完成');
  console.log('='.repeat(60));
  console.log(`[v2]   - Workflow API: http://127.0.0.1:${PORTS.WORKFLOW_API}`);
  console.log(`[v2]   - Browser Service: http://127.0.0.1:${PORTS.BROWSER_SERVICE}`);
  console.log(`[v2]   - WebSocket: ws://127.0.0.1:${PORTS.WS}`);
  console.log(`[v2]   - Bus Bridge: ws://127.0.0.1:${PORTS.BUS_BRIDGE}`);
  console.log(`[v2]   - Controller: ws://127.0.0.1:${PORTS.CONTROLLER}`);
  console.log('='.repeat(60));

main().catch(e => {
  console.error('[v2] ❌ 启动失败:', e.message);
  process.exit(1);
});
}
