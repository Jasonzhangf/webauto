#!/usr/bin/env node
/**
 * Core Launcher - 统一启动编排器
 * 职责：服务启动 + 健康检查 + 浮窗启动
 * 不含业务逻辑，仅编排
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const CONFIG = {
  ports: { unified: 7701, browser: 7704 }
};

async function ensurePortFree(port, name) {
  const { execSync } = await import('node:child_process');
  let raw = '';
  try {
    raw = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  } catch (err) {
    const code = err?.status;
    if (code !== 1) {
      throw err;
    }
    raw = '';
  }
  if (!raw) return;

  const pids = raw.split('\n').filter(Boolean);
  let details = '';
  try {
    details = execSync(`ps -p ${pids.join(',')} -o pid=,command=`, { encoding: 'utf8' }).trim();
  } catch {}

  const repoMark = repoRoot;
  const rows = details.split('\n').map((line) => line.trim()).filter(Boolean);
  const ours = rows.filter((line) => line.includes(repoMark));
  const knownTokens = [
    'libs/browser/remote-service.js',
    'services/unified-api/index.ts',
    'apps/floating-panel',
    'launcher/core/launcher.mjs',
    'scripts/start-headful.mjs'
  ];
  const knownOurs = rows.filter((line) => knownTokens.some((token) => line.includes(token)));

  if (ours.length === 0 && knownOurs.length === 0) {
    const msg = details ? `${raw}\n${details}` : raw;
    throw new Error(`${name} 端口 ${port} 被占用，且未识别为本仓库进程。\n${msg}`);
  }

  const candidates = ours.length ? ours : knownOurs;

  console.log(`[launcher] ${name} 端口 ${port} 被占用，准备清理以下进程:`);
  console.log(candidates.join('\n'));

  for (const line of candidates) {
    const pid = line.split(' ')[0];
    try { process.kill(Number(pid), 'SIGTERM'); } catch {}
  }

  await sleep(2000);

  let stillRaw = '';
  try {
    stillRaw = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  } catch (err) {
    const code = err?.status;
    if (code !== 1) {
      throw err;
    }
    stillRaw = '';
  }
  if (!stillRaw) return;

  const stillPids = stillRaw.split('\n').filter(Boolean);
  let stillDetails = '';
  try {
    stillDetails = execSync(`ps -p ${stillPids.join(',')} -o pid=,command=`, { encoding: 'utf8' }).trim();
  } catch {}

  const stillRows = stillDetails.split('\n').map((line) => line.trim()).filter(Boolean);
  const stillOurs = stillRows.filter((line) => line.includes(repoMark));
  const stillKnown = stillRows.filter((line) => knownTokens.some((token) => line.includes(token)));

  if (stillOurs.length === 0 && stillKnown.length === 0) {
    return;
  }

  const stillCandidates = stillOurs.length ? stillOurs : stillKnown;

  console.log(`[launcher] ${name} 端口 ${port} 仍被占用，强制清理以下进程:`);
  console.log(stillCandidates.join('\n'));

  for (const line of stillCandidates) {
    const pid = line.split(' ')[0];
    try { process.kill(Number(pid), 'SIGKILL'); } catch {}
  }

  await sleep(500);

  let finalRaw = '';
  try {
    finalRaw = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  } catch (err) {
    const code = err?.status;
    if (code !== 1) {
      throw err;
    }
    finalRaw = '';
  }
  if (finalRaw) {
    throw new Error(`${name} 端口 ${port} 仍被占用，清理失败。`);
  }
}

async function waitForHealth(port, name) {
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
          res.statusCode === 200 ? resolve() : reject(new Error('health check failed'));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => reject(new Error('timeout')));
      });
      console.log(`✅ ${name} 健康检查通过`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`${name} 启动超时`);
}

async function startProcess(command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: 'pipe',
    shell: true,
    cwd: repoRoot,
    ...options
  });

  proc.stdout.on('data', (data) => console.log(`[${command}] ${data.toString().trim()}`));
  proc.stderr.on('data', (data) => console.error(`[${command} Error] ${data.toString().trim()}`));

  return proc;
}

async function sendBrowserCommand(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: CONFIG.ports.browser,
      path: '/command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, error: data });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function resolveCookiePath(profile) {
  const cookieDir = path.join(os.homedir(), '.webauto', 'cookies');
  const normalized = [profile, profile.replace(/-/g, '_'), profile.replace(/_/g, '-')]
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
  const candidates = [];
  for (const base of normalized) {
    candidates.push(path.join(cookieDir, `${base}.json`));
    candidates.push(path.join(cookieDir, `${base}_cookies.json`));
    candidates.push(path.join(cookieDir, `${base}-cookies.json`));
  }
  candidates.push(path.join(cookieDir, 'weibo.com-latest.json'));
  candidates.push(path.join(cookieDir, 'default-latest.json'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

async function verifyContainerMatch(profile, url) {
  const ws = new WebSocket(`ws://127.0.0.1:${CONFIG.ports.unified}/ws`);

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket 超时未返回容器匹配结果'));
    }, 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'action',
        action: 'containers:match',
        requestId: 1,
        payload: { profile, url, maxDepth: 2, maxChildren: 5 }
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== 'response' || msg.requestId !== 1) return;
      clearTimeout(timeout);

      if (!msg.success) {
        ws.close();
        reject(new Error(`容器匹配失败: ${msg.error || 'unknown error'}`));
        return;
      }

      const snapshot = msg.data?.snapshot || msg.data?.containerSnapshot || null;
      const containerTree = snapshot?.container_tree || null;
      const domTree = snapshot?.dom_tree || null;

      if (!containerTree || !domTree) {
        ws.close();
        reject(new Error('容器匹配成功但未返回 container_tree/dom_tree'));
        return;
      }

      console.log('✅ 容器匹配成功');
      ws.close();
      resolve();
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      ws.close();
      reject(new Error(`WebSocket 错误: ${err?.message || err}`));
    });
  });
}

export async function startAll({ profile, url, headless }) {
  console.log('╔══════════════════════════════════════╗');
  console.log('║ Core Launcher - 统一启动编排器       ║');
  console.log('║ 架构：Unified API + Browser Service ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`参数: profile=${profile} url=${url} headless=${headless}`);

  await ensurePortFree(CONFIG.ports.unified, 'Unified API');
  await ensurePortFree(CONFIG.ports.browser, 'Browser Service');

  const unified = await startProcess('npx', ['tsx', 'services/unified-api/index.ts']);
  await waitForHealth(CONFIG.ports.unified, 'Unified API');
  try {
    await fetch(`http://127.0.0.1:${CONFIG.ports.unified}/v1/internal/events/browser-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless })
    }).catch(() => {});
  } catch {}

  const browser = await startProcess('node', ['libs/browser/remote-service.js',
    '--host', '127.0.0.1', '--port', CONFIG.ports.browser,
    '--no-ws'
  ]);
  await waitForHealth(CONFIG.ports.browser, 'Browser Service');

  console.log('\n[创建浏览器会话]');
  const startResult = await sendBrowserCommand({
    action: 'start',
    args: { profileId: profile, url, headless }
  });
  if (!startResult?.ok) {
    throw new Error(`创建会话失败: ${startResult?.error || 'unknown error'}`);
  }

  console.log('\n[注入 Cookie]');
  const cookiePath = resolveCookiePath(profile);
  if (!fs.existsSync(cookiePath)) {
    throw new Error(`Cookie 文件不存在: ${cookiePath}`);
  }
  const cookieResult = await sendBrowserCommand({
    action: 'loadCookies',
    args: { profileId: profile, path: cookiePath }
  });
  if (!cookieResult?.ok) {
    throw new Error(`Cookie 注入失败: ${cookieResult?.error || 'unknown error'}`);
  }
  if (!cookieResult?.count) {
    throw new Error('Cookie 注入结果为空');
  }

  console.log('\n[刷新页面应用 Cookie]');
  await sendBrowserCommand({
    action: 'goto',
    args: { profileId: profile, url }
  });

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

  await sleep(3000);
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

  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务...');
    unified.kill();
    browser.kill();
    floating.kill();
    process.exit(0);
  });

  await new Promise(() => {});
}
