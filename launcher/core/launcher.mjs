import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = {
  ports: {
    unified: 7701,
    browser: 7704
  },
  timeout: 10_000
};

const APP_PIDS = new Set();

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg) {
  console.log(`[launcher] ${msg}`);
}

function registerPid(pid) {
  APP_PIDS.add(pid);
}

function cleanupPids() {
  for (const pid of APP_PIDS) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  APP_PIDS.clear();
}

async function startProcess(cmd, args = [], opts = {}) {
  const startAt = Date.now();
  log(`启动子进程: ${cmd} ${args.join(' ')}`);
  const p = spawn(cmd, args, { stdio: opts.stdio || 'inherit', env: opts.env || process.env });
  registerPid(p.pid);
  log(`子进程已启动: pid=${p.pid}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`子进程启动超时: ${cmd} ${args.join(' ')}`));
    }, CONFIG.timeout);

    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    p.on('exit', (code, signal) => {
      clearTimeout(timer);
      const cost = Date.now() - startAt;
      reject(new Error(`子进程异常退出: ${cmd} ${args.join(' ')} code=${code} signal=${signal} cost=${cost}ms`));
    });

    // 子进程存活即可继续，健康检查负责确认就绪
    setTimeout(() => {
      clearTimeout(timer);
      resolve(p);
    }, 500);
  });
}

async function ensurePortFree(port, name) {
  log(`检查 ${name} 端口 ${port} ...`);
  // 1. 先尝试“软”关闭：向本仓库已知服务发 /shutdown 或 SIGTERM
  try {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST', timeout: 2000 });
    log(`已向 ${name} 发送关闭请求，等待 1s ...`);
    await sleep(1000);
  } catch {}
  // 2. 如仍被占用，仅杀掉该端口的进程（精确匹配）
  try {
    const list = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (list.length) {
      log(`${name} 端口 ${port} 被占用，准备清理以下进程:`);
      for (const pid of list) {
        try {
          execSync(`kill -TERM ${pid}`);
          log(`已发送 SIGTERM 给 PID ${pid}`);
        } catch {}
      }
      await sleep(1500);
      const remain = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const pid of remain) {
        try {
          execSync(`kill -KILL ${pid}`);
          log(`已强制杀掉 PID ${pid}`);
        } catch {}
      }
      await sleep(500);
    }
  } catch {}
  try {
    execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
    throw new Error(`${name} 端口 ${port} 仍被占用，且未识别为本仓库进程。`);
  } catch {}
}

async function waitForHealth(port, name) {
  log(`等待健康检查: ${name} 端口 ${port}`);
  const t0 = Date.now();
  while (Date.now() - t0 < CONFIG.timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      log(`[${name}] fetch /health: ${res.status} (${res.statusText})`);
      if (res.ok) {
        const body = await res.text();
        log(`✅ ${name} 健康检查通过 (${Date.now() - t0}ms) body="${body}"`);
        return;
      }
    } catch (err) {
      log(`[${name}] /health 请求失败: ${err.message}`);
    }
    await sleep(500);
  }
  throw new Error(`${name} 健康检查超时 (${CONFIG.timeout}ms)`);
}

async function sendBrowserCommand(payload) {
  const res = await fetch(`http://127.0.0.1:${CONFIG.ports.browser}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function isLoggedIn(profile) {
  const script = "(() => { const loginAnchor = document.querySelector('.woo-badge-box'); return !!loginAnchor; })()";
  const res = await sendBrowserCommand({
    action: 'evaluate',
    args: { profileId: profile, script }
  });
  const result = res?.result ?? res?.body?.result ?? res?.data?.result;
  return result === true;
}

async function verifyContainerMatch(profile, url) {
  log('\n[容器匹配验证]');
  const ws = new WebSocket(`ws://127.0.0.1:${CONFIG.ports.unified}/ws`);
  await new Promise((r, j) => {
    ws.on('open', r);
    ws.on('error', j);
    setTimeout(() => j(new Error('WebSocket 连接超时')), 5000);
  });
  const result = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('容器匹配超时')), 15000);
    const onMessage = (data) => {
      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch (err) {
        clearTimeout(t);
        ws.off('message', onMessage);
        reject(new Error('容器匹配返回非 JSON'));
        return;
      }
      if (payload?.type === 'response') {
        clearTimeout(t);
        ws.off('message', onMessage);
        resolve(payload.data);
      } else if (payload?.type === 'error') {
        clearTimeout(t);
        ws.off('message', onMessage);
        reject(new Error(payload.error || '容器匹配返回错误'));
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({
      type: 'action',
      action: 'containers:match',
      payload: { profile, url, maxDepth: 2, maxChildren: 5 }
    }));
  });
  ws.close();
  if (!result?.success) {
    throw new Error(`容器匹配失败: ${result?.error || 'unknown error'}`);
  }
  if (!result?.data?.container_tree || !result?.data?.dom_tree) {
    throw new Error('容器匹配失败: 缺少 container_tree 或 dom_tree');
  }
  const rootId = result?.data?.metadata?.root_container_id;
  if (!rootId || !String(rootId).startsWith('weibo_')) {
    throw new Error(`容器匹配失败: root_container_id=${rootId || 'unknown'}`);
  }
  log('✅ 容器匹配成功');
}

export async function startAll({ profile, url, headless }) {
  console.log('╔══════════════════════════════════════╗');
  console.log('║ Core Launcher - 统一启动编排器       ║');
  console.log('║ 架构：Unified API + Browser Service ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`参数: profile=${profile} url=${url} headless=${headless}`);

  // 在真正启动前，先清理可能残留的“本仓库”子进程
  cleanupPids();

  await ensurePortFree(CONFIG.ports.unified, 'Unified API');
  await ensurePortFree(CONFIG.ports.browser, 'Browser Service');

  log('=== 启动 Unified API ===');
  const unified = await startProcess('node', ['services/unified-api/server.mjs']);
  log('=== Unified API 进程启动，等待健康检查 ===');
  await waitForHealth(CONFIG.ports.unified, 'Unified API');
  try {
    await fetch(`http://127.0.0.1:${CONFIG.ports.unified}/v1/internal/events/browser-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless })
    }).catch(() => {});
  } catch {}

  log('=== 启动 Browser Service ===');
  const browser = await startProcess('node', ['libs/browser/remote-service.js',
    '--host', '127.0.0.1', '--port', CONFIG.ports.browser,
    '--no-ws'
  ], {
    env: { ...process.env, WEBAUTO_SKIP_HEALTH_CHECK: '1' }
  });
  log('=== Browser Service 进程启动，等待健康检查 ===');
  await waitForHealth(CONFIG.ports.browser, 'Browser Service');

  console.log('\n[创建浏览器会话]');
  const startResult = await sendBrowserCommand({
    action: 'start',
    args: { profileId: profile, url, headless }
  });
  if (!startResult?.ok) {
    throw new Error(`创建会话失败: ${startResult?.error || 'unknown error'}`);
  }

  console.log('\n[刷新页面应用 Cookie]');
  await sendBrowserCommand({ action: 'goto', args: { url, waitUntil: 'networkidle', profileId: profile } });

  console.log('\n[检查登录状态]');
  let loggedIn = await isLoggedIn(profile);
  console.log(`[launcher] 登录状态: ${loggedIn ? '已登录' : '未登录'}`);

  if (!loggedIn) {
    console.log('\n[等待用户登录...]');
    console.log('请在浏览器中完成登录，每15秒检查一次登录状态');
    
    while (!loggedIn) {
      await sleep(15000);
      const currentLoggedIn = await isLoggedIn(profile);
      if (currentLoggedIn) {
        console.log('\n✅ 检测到登录成功！');
        loggedIn = true;
        break;
      }
      console.log(`[${new Date().toLocaleTimeString()}] 等待登录中...`);
    }
  }

  console.log('\n[启动浮窗 UI]');
  const floating = spawn('npm', ['run', 'start'], {
    cwd: path.resolve('apps/floating-panel'),
    stdio: 'inherit',
    env: {
      ...process.env,
      WEBAUTO_FLOATING_WS_URL: `ws://127.0.0.1:${CONFIG.ports.unified}/ws`,
      WEBAUTO_FLOATING_BUS_URL: `ws://127.0.0.1:${CONFIG.ports.unified}/bus`,
      WEBAUTO_FLOATING_BUS_PORT: `${CONFIG.ports.unified}`,
      WEBAUTO_CONTROLLER_WS_URL: `ws://127.0.0.1:${CONFIG.ports.unified}/ws`,
      WEBAUTO_FLOATING_HEADLESS: headless ? '1' : '0',
      WEBAUTO_FLOATING_DEVTOOLS: '1'
    }
  });
  registerPid(floating.pid);

  await sleep(3000);

  // Cookie 由 profile 自身管理，无需手动注入/保存

  try {
    await fetch(`http://127.0.0.1:${CONFIG.ports.unified}/v1/internal/events/browser-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless })
    }).catch(() => {});
  } catch {}

  await verifyContainerMatch(profile, url);

  console.log('\n🎉 启动完成！');
  console.log('💡 浏览器窗口已打开');
  console.log('💡 浮窗UI已连接');
  console.log('💡 容器匹配功能正常');
  console.log('💡 按 Ctrl+C 退出');

  // 统一生命周期：父进程退出时，所有子进程自杀
  const cleanup = () => {
    console.log('\n[launcher] 收到退出信号，清理子进程...');
    cleanupPids();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

const [,, profile = 'weibo_fresh', url = 'https://weibo.com'] = process.argv;
const headless = process.env.WEBAUTO_HEADLESS === '1';

startAll({ profile, url, headless }).catch(err => {
  console.error(`启动失败: ${err.message}`);
  cleanupPids();
  process.exit(1);
});
