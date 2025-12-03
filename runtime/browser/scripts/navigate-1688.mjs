#!/usr/bin/env node
// 导航当前 Camoufox 会话到 1688 首页
// 用法：
//   npm run browser:camoufox:navigate1688
//   或手动：node runtime/browser/scripts/navigate-1688.mjs --session <session_id>

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../../..');

const HOST = process.env.BROWSER_SERVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.BROWSER_SERVICE_PORT || '8888');

function resolveSessionIdFromArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--session');
  if (idx !== -1 && args[idx + 1]) {
    return String(args[idx + 1]);
  }
  return null;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function listSessions() {
  const url = `http://${HOST}:${PORT}/api/v1/sessions`;
  try {
    const j = await getJson(url);
    const data = j?.data || {};
    const sessions = data.sessions || [];
    return Array.isArray(sessions) ? sessions : [];
  } catch (e) {
    console.error('获取会话列表失败:', e?.message || String(e));
    return [];
  }
}

async function pickSessionId(preferredProfile = '1688-main-v1') {
  const argSid = resolveSessionIdFromArgs();
  if (argSid) return argSid;

  const sessions = await listSessions();
  if (!sessions.length) return null;

  // 优先选择 profile_id 为 1688-main-v1 的会话
  const preferred = sessions.filter((s) => {
    const pid = s.profile_id || s.profile?.profile_id;
    return pid === preferredProfile;
  });
  if (preferred.length) {
    return preferred[preferred.length - 1].session_id || preferred[preferred.length - 1].id;
  }

  // 退而求其次：选最后一个活动会话
  const last = sessions[sessions.length - 1];
  return last.session_id || last.id;
}

async function fetchSessionStatus(sessionId) {
  const url = `http://${HOST}:${PORT}/api/v1/sessions/${encodeURIComponent(sessionId)}/status`;
  try {
    const j = await getJson(url);
    return j?.data || {};
  } catch {
    return {};
  }
}

async function shouldNavigate(sessionId) {
  const st = await fetchSessionStatus(sessionId);
  const pageInfo = st.page_info || {};
  const url = pageInfo.url || '';
  if (!url) return true;
  // 如果当前已经在 1688 相关页面上，则不再重复导航，避免“多刷一次”的体验
  return !/^https?:\/\/([^/]*\.)?1688\.com[\/]?/i.test(url);
}

async function navigate1688(sessionId) {
  const url = `http://${HOST}:${PORT}/api/v1/sessions/${encodeURIComponent(sessionId)}/navigate`;
  const body = { url: 'https://www.1688.com' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`导航失败: HTTP ${res.status} ${text}`);
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = null;
  }
  if (!j?.success) {
    throw new Error(`导航响应失败: ${j?.error || text}`);
  }
  const data = j.data || {};
  console.log('✅ 已导航到 1688:');
  console.log('   url   :', data.url || '(未知)');
  console.log('   title :', data.title || '(未知)');
}

async function main() {
  console.log(`📡 导航到 1688 (BrowserService: http://${HOST}:${PORT})`);

  const sid = await pickSessionId();
  if (!sid) {
    console.error('❌ 当前没有可用会话，请先运行 npm run browser:camoufox:oneclick');
    process.exit(1);
  }

  console.log(`🎯 目标会话: ${sid}`);

  const needNav = await shouldNavigate(sid);
  if (!needNav) {
    console.log('ℹ️ 当前会话已在 1688 页面上，跳过重复导航。');
    return;
  }

  await navigate1688(sid);
}

main().catch((e) => {
  console.error('❌ 导航 1688 失败:', e?.message || String(e));
  process.exit(1);
});
