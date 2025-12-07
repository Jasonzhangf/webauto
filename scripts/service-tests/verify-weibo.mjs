#!/usr/bin/env node
import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

const profileId = process.env.WEBAUTO_VERIFY_PROFILE || 'weibo-fresh';
const targetUrl = process.env.WEBAUTO_VERIFY_URL || 'https://weibo.com';
const httpPort = Number(process.env.WEBAUTO_VERIFY_HTTP_PORT || 7800 + Math.floor(Math.random() * 200));
const wsPort = Number(process.env.WEBAUTO_VERIFY_WS_PORT || httpPort + 100);
const host = '127.0.0.1';
const httpBase = `http://${host}:${httpPort}`;
const wsUrl = `ws://${host}:${wsPort}`;
const profileDir = path.join(os.homedir(), '.webauto', 'profiles', profileId);
const cookieCandidates = [path.join(profileDir, 'Cookies'), path.join(profileDir, 'Default', 'Cookies')];
let cookiesDbPath = cookieCandidates[0];

if (process.env.WEBAUTO_SKIP_VERIFY === '1') {
  console.log('[verify-weibo] skipped via WEBAUTO_SKIP_VERIFY=1');
  process.exit(0);
}

async function ensureProfileExists() {
  for (const candidate of cookieCandidates) {
    try {
      await fs.access(candidate);
      cookiesDbPath = candidate;
      return;
    } catch {}
  }
  throw new Error(
    `预期的 profile(${profileId}) 缺失，先手动登录微博生成 ~/.webauto/profiles/${profileId} (未找到 Cookies 文件)`,
  );
}

async function waitHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {}
    await wait(500);
  }
  return false;
}

async function postCommand(action, args = {}) {
  const res = await fetch(`${httpBase}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(`[command:${action}] ${data?.error || res.status}`);
  }
  return data;
}

async function waitForCookie(matchFn, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await postCommand('getCookies', { profileId }).catch(() => null);
    const cookies = data?.cookies || [];
    if (cookies.some(matchFn)) {
      return cookies;
    }
    await wait(2000);
  }
  throw new Error('等待微博 Cookie 超时');
}

async function callWsCommand(command, sessionId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const payload = {
      type: 'command',
      session_id: sessionId,
      data: command,
      timestamp: Date.now(),
    };
    const cleanup = () => {
      socket.removeAllListeners();
      try {
        socket.terminate();
      } catch {}
    };
    socket.once('open', () => {
      socket.send(JSON.stringify(payload));
    });
    socket.once('error', (err) => {
      cleanup();
      reject(err);
    });
    socket.once('message', (data) => {
      cleanup();
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function verifyContainerMatch() {
  const response = await callWsCommand(
    {
      command_type: 'container_operation',
      action: 'match_root',
      page_context: { url: targetUrl },
    },
    profileId,
  );
  const data = response?.data;
  if (!data?.success) {
    throw new Error(`容器匹配失败: ${data?.error || 'unknown error'}`);
  }
  const match = data.data || {};
  const containerId = match.container?.id;
  if (!containerId || containerId !== 'weibo_main_page') {
    throw new Error(`意外的根容器: ${containerId}`);
  }
  const matchCount = Number(match.match_details?.match_count || 0);
  if (matchCount !== 1) {
    throw new Error(`根容器匹配数量异常: ${matchCount}`);
  }
  return match;
}

async function ensureSessionVisible() {
  const status = await postCommand('getStatus');
  const sessions = status.sessions || [];
  const target = sessions.find((s) => (s.profileId || s.session_id) === profileId);
  if (!target) {
    throw new Error('会话列表中未找到 weibo 会话');
  }
  if (!target.url && !target.current_url) {
    throw new Error('weibo 会话尚未载入任何页面');
  }
  if (!(target.url || target.current_url || '').includes('weibo')) {
    throw new Error(`weibo 会话 URL 异常: ${target.url || target.current_url}`);
  }
  return target;
}

async function ensureCookiesFileUpdated(startTime, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stat = await fs.stat(cookiesDbPath).catch(() => null);
    if (stat && stat.mtimeMs >= startTime) {
      return;
    }
    await wait(500);
  }
  throw new Error('Cookie 数据库未更新，疑似未正确保存 profile');
}

async function main() {
  await ensureProfileExists();
  const launchTime = Date.now();
  const service = spawn(process.execPath, [
    'libs/browser/remote-service.js',
    '--host', host,
    '--port', String(httpPort),
    '--ws-host', host,
    '--ws-port', String(wsPort),
  ], {
    env: { ...process.env, BROWSER_SERVICE_AUTO_EXIT: '0' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    const healthy = await waitHealth(`${httpBase}/health`, 30000);
    if (!healthy) {
      throw new Error('浏览器服务健康检查失败');
    }

    await postCommand('start', { profileId, url: targetUrl, headless: false });
    await wait(6000);

    const cookies = await waitForCookie((cookie) => (cookie.domain || '').includes('weibo.com') && Boolean(cookie.value));
    if (!cookies.length) {
      throw new Error('未能读取到微博 Cookie');
    }

    await ensureSessionVisible();
    await wait(3000);
    await verifyContainerMatch();
    await postCommand('stop', { profileId });
    await wait(1500);
    await ensureCookiesFileUpdated(launchTime);
    console.log('[verify-weibo] ✅ 已完成：会话、Cookie 与容器匹配全部通过');
  } finally {
    service.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('[verify-weibo] ❌', err?.message || err);
  process.exit(1);
});
