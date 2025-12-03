#!/usr/bin/env node
// 浏览器状态查看脚本（Camoufox / BrowserService）
// 用于快速了解当前 BrowserService 与各个会话的状态：
// - 服务是否运行
// - 当前会话列表（session_id / profile_id / status）
// - 每个会话当前页面 URL / 标题
// - storage_state 中的 Cookie / origins 数量，以及是否存在 1688 相关 Cookie

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../../..');

const HOST = process.env.BROWSER_SERVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.BROWSER_SERVICE_PORT || '8888');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchServiceStatus() {
  const url = `http://${HOST}:${PORT}/api/v1/service/status`;
  try {
    const j = await getJson(url);
    return j?.data || {};
  } catch (e) {
    return { status: 'unreachable', error: String(e) };
  }
}

async function fetchSessions() {
  const url = `http://${HOST}:${PORT}/api/v1/sessions`;
  try {
    const j = await getJson(url);
    const data = j?.data || {};
    const sessions = data.sessions || [];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

async function fetchSessionStatus(sessionId) {
  const url = `http://${HOST}:${PORT}/api/v1/sessions/${encodeURIComponent(sessionId)}/status`;
  try {
    const j = await getJson(url);
    return j?.data || {};
  } catch {
    return { exists: false, error: 'unreachable' };
  }
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  console.log(`WebAuto BrowserService 状态 @ http://${HOST}:${PORT}`);

  const serviceStatus = await fetchServiceStatus();
  printHeader('Service');
  console.log(`状态          : ${serviceStatus.status || 'unknown'}`);
  if (serviceStatus.status === 'running') {
    console.log(`活动会话数    : ${serviceStatus.active_sessions ?? 0}`);
    console.log(`总创建会话数  : ${serviceStatus.total_sessions_created ?? 0}`);
  } else if (serviceStatus.error) {
    console.log(`错误信息      : ${serviceStatus.error}`);
  }

  const sessions = await fetchSessions();
  printHeader('Sessions');
  if (!sessions.length) {
    console.log('当前没有活动会话');
    return;
  }

  for (const s of sessions) {
    const sid = s.session_id || s.id;
    const profileId = s.profile_id || (s.profile && s.profile.profile_id) || 'default';
    const status = s.status || 'unknown';
    console.log(`\n[session] ${sid}`);
    console.log(`  profile_id : ${profileId}`);
    console.log(`  status     : ${status}`);

    const st = await fetchSessionStatus(sid);
    if (!st.exists) {
      console.log(`  (状态不可用: ${st.error || 'unknown'})`);
      continue;
    }

    const page = st.page_info || {};
    const storage = st.storage || {};
    console.log(`  url        : ${page.url || '(空)'}`);
    console.log(`  title      : ${page.title || '(无)'}`);
    console.log(`  cookies    : ${storage.cookies_count ?? 0}`);
    console.log(`  origins    : ${storage.origins_count ?? 0}`);
    if (typeof storage.has_1688_cookie === 'boolean') {
      console.log(`  1688 Cookie: ${storage.has_1688_cookie ? '是' : '否'}`);
    }
  }
}

main().catch((e) => {
  console.error('获取浏览器状态失败:', e?.message || String(e));
  process.exit(1);
});

