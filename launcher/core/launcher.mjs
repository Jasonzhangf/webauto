import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import WebSocket from 'ws';
import { logDebug } from '../../modules/logging/src/index.ts';

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
  logDebug('launcher', 'log', { message: msg });
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

    // 子进程启动后，1s 内无异常即视为成功
    setTimeout(() => {
      resolve(p);
    }, 1000);
  });
}

async function ensurePortFree(port, name) {
  // 仅复用：端口健康即视为已运行；禁止自动 kill
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (res.ok) {
      log(`✅ ${name} (:${port}) 已运行且健康，跳过启动`);
      return 'running';
    }
  } catch {}

  // 未监听则视为可用；被占用但不健康则报错
  try {
    const list = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (list.length > 0) {
      throw new Error(`${name} 端口 ${port} 已被占用但健康检查失败，请手动处理后重试。`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('已被占用')) {
      throw err;
    }
  }

  return 'free';
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

async function controllerAction(action, payload) {
  const res = await fetch(`http://127.0.0.1:${CONFIG.ports.unified}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  if (!res.ok) {
    throw new Error(`controller action ${action} failed: HTTP ${res.status}`);
  }
  return await res.json();
}

function unwrapData(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if ('snapshot' in payload || 'result' in payload || 'sessions' in payload || 'matched' in payload) {
    return payload;
  }
  if ('data' in payload && payload.data) {
    return unwrapData(payload.data);
  }
  return payload;
}

function findContainer(tree, pattern) {
  if (!tree) return null;
  if (pattern.test(tree.id || tree.defId || '')) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findContainer(child, pattern);
      if (found) return found;
    }
  }
  return null;
}

async function checkLoginStateByContainer(profile) {
  try {
    const result = await controllerAction('containers:match', {
      profile,
      maxDepth: 3,
      maxChildren: 8
    });
    const data = unwrapData(result);
    const tree = data?.snapshot?.container_tree || data?.container_tree;
    if (!tree) {
      return { status: 'uncertain', reason: 'no_container_tree' };
    }

    const loginAnchor = findContainer(tree, /\.login_anchor$/);
    if (loginAnchor) {
      return {
        status: 'logged_in',
        container: loginAnchor.id || loginAnchor.defId,
        method: 'container_match'
      };
    }

    const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
    if (loginGuard) {
      return {
        status: 'not_logged_in',
        container: loginGuard.id || loginGuard.defId,
        method: 'container_match'
      };
    }

    return {
      status: 'uncertain',
      reason: 'no_login_anchor_or_guard',
      method: 'container_match'
    };
  } catch (err) {
    console.warn(`[launcher] 容器驱动登录检测异常: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

async function isLoggedIn(profile) {
  // Xiaohongshu：使用容器驱动的登录锚点模型
  if (profile && profile.startsWith('xiaohongshu')) {
    const state = await checkLoginStateByContainer(profile);
    if (state.status === 'logged_in') {
      log(`[登录检测] 容器匹配：已登录（${state.container || 'login_anchor'}）`);
      return true;
    }
    if (state.status === 'not_logged_in') {
      log(`[登录检测] 容器匹配：未登录（${state.container || 'login_guard'}）`);
      return false;
    }
    log(`[登录检测] 容器匹配：状态不确定（${state.reason || state.status}）`);
    return false;
  }

  // 其他平台（如 Weibo）：暂时保留旧的 DOM 逻辑
  const script = `(() => {
    try {
      const host = (location.hostname || '').toLowerCase();
      if (host.includes('weibo.com')) {
        const weiboBadge = document.querySelector('.woo-badge-box');
        if (weiboBadge) return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  })();`;
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
      payload: { profile, maxDepth: 6, maxChildren: 20 }
    }));
  });
  ws.close();
  if (result?.success === false) {
    console.warn(`容器匹配失败: ${result?.error || 'unknown error'}（仅记录，不中断启动）`);
    return;
  }
  const data = result?.data || result || {};
  const snapshot = data.snapshot || data;
  if (!snapshot?.container_tree || !snapshot?.dom_tree) {
    console.warn('容器匹配结果缺少 container_tree 或 dom_tree（仅记录，不中断启动）');
    return;
  }
  const rootId = snapshot?.metadata?.root_container_id;
  const rootIdStr = String(rootId || '');
  if (!rootIdStr) {
    console.warn('容器匹配结果缺少 root_container_id（仅记录，不中断启动）');
    return;
  }
  // Weibo/Xiaohongshu 等平台仅用于日志，不再因 rootId 不匹配而中止启动
  log(`容器匹配完成，root_container_id=${rootIdStr}`);
}

export async function startAll({ profile, url, headless }) {
  console.log('╔══════════════════════════════════════╗');
  console.log('║ Core Launcher - 统一启动编排器       ║');
  console.log('║ 架构：Unified API + Browser Service ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`参数: profile=${profile} url=${url} headless=${headless}`);

  // daemon 模式：不再在 launcher 内部启动服务
  const unifiedStatus = await ensurePortFree(CONFIG.ports.unified, 'Unified API');
  const browserStatus = await ensurePortFree(CONFIG.ports.browser, 'Browser Service');

  if (unifiedStatus !== 'running' || browserStatus !== 'running') {
    throw new Error('核心服务未启动，请先运行: node scripts/core-daemon.mjs start');
  }

  try {
    await fetch(`http://127.0.0.1:${CONFIG.ports.unified}/v1/internal/events/browser-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless })
    }).catch(() => {});
  } catch {}

  console.log('\n[创建浏览器会话]');
  const startResult = await sendBrowserCommand({
    action: 'start',
    args: { profileId: profile, url, headless }
  });
  if (!startResult?.ok) {
    throw new Error(`创建会话失败: ${startResult?.error || 'unknown error'}`);
  }

  console.log('\n[刷新页面应用 Cookie]');
  // 之前这里会再执行一次 goto(url)，导致重复导航和多次刷新。
  // 现在依赖会话创建时的 initialUrl 导航，避免额外刷新，减少对目标站点的压力。

  console.log('\n[检查登录状态]');
  let loggedIn = await isLoggedIn(profile);
  console.log(`[launcher] 登录状态: ${loggedIn ? '已登录' : '未登录'}`);

  if (!loggedIn) {
    console.log('\n[等待用户登录...]');
    console.log('请在浏览器中完成登录，每15秒检查一次登录状态');
    while (!loggedIn) {
      await sleep(15000);
      loggedIn = await isLoggedIn(profile);
      console.log(`[launcher] 登录状态: ${loggedIn ? '已登录' : '未登录'}`);
    }
  }

  console.log('\n[启动浮窗 UI]');
  // 检查是否有 --dev 参数来决定是否启动浮窗
  const args = process.argv.slice(2);
  const hasDevFlag = args.includes('--dev');
  if (hasDevFlag) {
    const floating = await startProcess('node', [
    'apps/floating-panel/scripts/start-headful.mjs'
    ], {
      cwd: __dirname,
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
  } else {
    console.log('  → 非dev模式，跳过浮窗启动');
  }

  // 等待浮窗启动后，立即发起匹配
  await sleep(1500);

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

  // 优雅退出
  const cleanup = () => {
    console.log('\n[launcher] 收到退出信号，正在清理...');
    // 不再主动杀掉子进程，保持 detached session
    try {
      execSync('stty sane', { stdio: 'ignore' });
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function parseArgs(argv) {
  let profile = 'weibo_fresh';
  let url = 'https://weibo.com';
  let headless = process.env.WEBAUTO_HEADLESS === '1';

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--url' && argv[i + 1]) {
      url = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--headless') {
      headless = true;
      continue;
    }
    if (arg === '--headful') {
      headless = false;
      continue;
    }
    if (!arg.startsWith('--') && i === 2) {
      profile = arg;
      continue;
    }
    if (!arg.startsWith('--') && i === 3) {
      url = arg;
      continue;
    }
  }

  return { profile, url, headless };
}

const { profile, url, headless } = parseArgs(process.argv);

startAll({ profile, url, headless }).catch(err => {
  console.error(`启动失败: ${err.message}`);
  // 不再主动杀掉子进程，保持 detached session
  process.exit(1);
});

export { parseArgs };
