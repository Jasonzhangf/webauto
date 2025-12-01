#!/usr/bin/env node
// 一键启动浏览器（后台服务 + 会话 + 可选导航，基于配置文件）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { loadBrowserServiceConfig } from '../../../libs/browser/browser-service-config.js';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const FLOATING_APP_DIR = path.join(ROOT_DIR, 'apps', 'floating-panel');
const WS_SERVER_SCRIPT = path.join(ROOT_DIR, 'scripts', 'start_websocket_server.py');
const DEFAULT_WS_HOST = '127.0.0.1';
const DEFAULT_WS_PORT = 8765;

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

function spawnNpmDev() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawn(npmCmd, ['run', 'dev'], {
    cwd: FLOATING_APP_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
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

  const uiProc = spawnNpmDev();
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
  const { port, host, headless, profile, url, restart, devConsole } = parseArgs(process.argv);
  const baseHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const base = `http://${baseHost}:${port}`;

  if (restart) {
    await runNode('utils/scripts/service/restart-browser-service.mjs', []);
  }

  // 确保服务在后台运行
  let healthy = await waitHealth(`${base}/health`, 1000);
  if (!healthy){
    const child = spawn(process.execPath, ['libs/browser/remote-service.js', '--host', String(host), '--port', String(port)], {
      detached: true, stdio: 'ignore', env: { ...process.env }
    });
    child.unref();
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
