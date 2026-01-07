#!/usr/bin/env node
/**
 * Phase 1：启动/复用 xiaohongshu_fresh 会话，并确保登录成功。
 * - 如果会话不存在，自动调用 start-headful.mjs（headful + unattached）。
 * - 登录状态完全基于容器匹配：*.login_anchor / xiaohongshu_login.login_guard。
 * - 循环高亮登录相关容器，等待人工登录完成。
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIFIED_API = 'http://127.0.0.1:7701';
const BROWSER_SERVICE = 'http://127.0.0.1:7704';
const PROFILE = 'xiaohongshu_fresh';
const DEFAULT_KEYWORD = '手机膜';
const START_URL = 'https://www.xiaohongshu.com';
const LOGIN_URL = 'https://www.xiaohongshu.com/login';
const SESSION_WAIT_TIMEOUT = 90_000;
const LOGIN_WAIT_TIMEOUT = 180_000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const startScript = path.join(repoRoot, 'scripts', 'start-headful.mjs');

let launchPromise = null;


function log(step, message) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${message}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    // 避免 controller action（特别是 containers:match）长时间挂起
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function unwrapData(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if ('snapshot' in payload || 'result' in payload || 'sessions' in payload || 'matched' in payload) {
    return payload;
  }
  if (payload.data) {
    return unwrapData(payload.data);
  }
  return payload;
}

async function controllerAction(action, payload = {}) {
  const result = await post('/v1/controller/action', { action, payload });
  if (result && result.success === false) {
    throw new Error(result.error || `controller action ${action} failed`);
  }
  return unwrapData(result);
}

async function browserCommand(action, args = {}, timeout = 15_000) {
  const res = await fetch(`${BROWSER_SERVICE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    throw new Error(`browser command ${action} failed: ${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  if (body && body.ok === false) {
    throw new Error(body.error || `browser command ${action} failed`);
  }
  return body.body || body;
}

function extractSessions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.sessions)) return payload.sessions;
  if (Array.isArray(payload.data?.sessions)) return payload.data.sessions;
  if (Array.isArray(payload.result?.sessions)) return payload.result.sessions;
  if (payload.data) return extractSessions(payload.data);
  return [];
}

function normalizeSession(session) {
  if (!session) return null;
  return {
    profileId: session.profileId || session.profile_id || null,
    sessionId: session.session_id || session.sessionId || null,
    currentUrl: session.current_url || session.currentUrl || null,
  };
}

async function listSessions() {
  const raw = await controllerAction('session:list', {});
  return extractSessions(raw);
}

async function ensureSession() {
  const sessions = await listSessions().catch(() => []);
  const existing = sessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
  if (existing) {
    log('SESSION', `已存在 ${PROFILE} ｜ URL: ${existing.currentUrl || '未知'}`);
    return existing;
  }
  await startSession();
  return waitForSessionReady();
}

async function startSession() {
  if (launchPromise) return launchPromise;
  log('SESSION', `未检测到 ${PROFILE}，触发 start-headful -> ${START_URL}`);
  launchPromise = new Promise((resolve) => {
    try {
      const child = spawn('node', [startScript, '--profile', PROFILE, '--url', START_URL], {
        cwd: repoRoot,
        env: process.env,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      log('SESSION', '已以 detached 模式拉起 start-headful（窗口会常驻，需人工关闭）');
    } catch (err) {
      log('ERROR', `启动脚本失败：${err.message}`);
    } finally {
      resolve();
    }
  }).finally(() => {
    launchPromise = null;
  });
  return launchPromise;
}

async function waitForSessionReady() {
  const start = Date.now();
  while (Date.now() - start < SESSION_WAIT_TIMEOUT) {
    await delay(3000);
    const sessions = await listSessions().catch(() => []);
    const existing = sessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
    if (existing) {
      log('SESSION', `检测到 ${PROFILE} ｜ URL: ${existing.currentUrl || '未知'}`);
      return existing;
    }
  }
  throw new Error(`等待 ${PROFILE} 会话超时 (${SESSION_WAIT_TIMEOUT / 1000}s)`);
}

async function getCurrentUrl() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'location.href',
  });
  return result?.result || result || '';
}

async function ensureStartUrl() {
  const current = await getCurrentUrl();
  if (current && current.includes('xiaohongshu.com')) return;
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const input = document.querySelector('#search-input, input[type="search"]');
      if (input) {
        input.focus();
        input.value = '${DEFAULT_KEYWORD}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return true;
      }
      const home = document.querySelector('a[href*="xiaohongshu.com"]');
      if (home) home.click();
      return false;
    })();`,
  });
  await delay(4000);
}

async function navigateToLogin() {
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      if (!location.href.includes('/login')) {
        window.location.href = '${LOGIN_URL}';
      }
    })();`,
  });
}

async function reportCookieCount(tag = 'COOKIE') {
  try {
    const data = await browserCommand('getCookies', { profileId: PROFILE });
    const cookies = Array.isArray(data?.cookies) ? data.cookies : [];
    log(tag, `存量 Cookie：${cookies.length} 个（示例：${cookies.slice(0, 3).map((c) => c.name).join(', ') || '无'}）`);
  } catch (err) {
    log(tag, `读取 Cookie 失败：${err.message}`);
  }
}

async function matchContainers(targetUrl = null) {
  const url = targetUrl || (await getCurrentUrl()) || START_URL;
  const snapshot = await controllerAction('containers:match', {
    profile: PROFILE,
    url,
    maxDepth: 3,
    maxChildren: 8,
  });
  return mapTree(snapshot?.snapshot?.container_tree);
}

function mapTree(node) {
  if (!node) return null;
  return {
    id: node.id,
    defId: node.defId || node.name || node.id,
    children: Array.isArray(node.children) ? node.children.map(mapTree).filter(Boolean) : [],
  };
}

function findNodeByDefId(node, defId) {
  if (!node) return null;
  if (node.defId === defId) return node;
  for (const child of node.children || []) {
    const match = findNodeByDefId(child, defId);
    if (match) return match;
  }
  return null;
}

function findNodeByPattern(node, pattern) {
  if (!node) return null;
  if (pattern.test(node.defId || node.id || '')) return node;
  for (const child of node.children || []) {
    const match = findNodeByPattern(child, pattern);
    if (match) return match;
  }
  return null;
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

async function checkLoginStateByContainer() {
  try {
    const url = await getCurrentUrl();
    const result = await controllerAction('containers:match', {
      profile: PROFILE,
      url,
      maxDepth: 3,
      maxChildren: 8,
    });

    const data = unwrapData(result);
    const tree = data?.snapshot?.container_tree || data?.container_tree;
    if (!tree) {
      return { status: 'uncertain', reason: 'no_container_tree' };
    }

    // 已登录：任意 *.login_anchor 命中即可
    const loginAnchor = findContainer(tree, /\.login_anchor$/);
    if (loginAnchor) {
      return {
        status: 'logged_in',
        container: loginAnchor.id || loginAnchor.defId,
        method: 'container_match',
      };
    }

    // 未登录：命中登录页守卫容器
    const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
    if (loginGuard) {
      return {
        status: 'not_logged_in',
        container: loginGuard.id || loginGuard.defId,
        method: 'container_match',
      };
    }

    return {
      status: 'uncertain',
      reason: 'no_login_anchor_or_guard',
      method: 'container_match',
    };
  } catch (err) {
    log('WARN', `容器驱动登录检测异常：${err.message}`);
    return { status: 'error', error: err.message };
  }
}

async function isLoggedIn() {
  const state = await checkLoginStateByContainer();
  if (state.status === 'logged_in') {
    log('LOGIN', `容器检测：已登录（${state.container || 'login_anchor'}）`);
    return true;
  }
  if (state.status === 'not_logged_in') {
    log('LOGIN', `容器检测：未登录（${state.container || 'login_guard'}）`);
    return false;
  }
  log('LOGIN', `容器检测：状态不确定（${state.reason || state.status}）`);
  return false;
}

async function highlightLoginAnchors() {
  try {
    const tree = await matchContainers();
    if (!tree) return;
    const nodes = [
      findNodeByDefId(tree, 'xiaohongshu_login.login_guard'),
      findNodeByDefId(tree, 'xiaohongshu_search.login_anchor'),
      findNodeByDefId(tree, 'xiaohongshu_detail.login_anchor'),
    ].filter(Boolean);
    for (const node of nodes) {
      if (!node.id) continue;
      await controllerAction('container:operation', {
        containerId: node.id,
        operationId: 'highlight',
        config: { style: '2px solid #ff7043', duration: 1200 },
        sessionId: PROFILE,
      });
    }
  } catch (err) {
    log('LOGIN', `高亮锚点失败：${err.message}`);
  }
}

async function waitForLogin() {
  const start = Date.now();
  while (Date.now() - start < LOGIN_WAIT_TIMEOUT) {
    await highlightLoginAnchors();
    await delay(4000);
    if (await isLoggedIn()) {
      log('LOGIN', '检测到登录成功');
      return;
    }
    log('LOGIN', '等待人工登录...');
  }
  throw new Error('等待登录超时，请在浏览器完成登录后重试');
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log('PHASE1', '启动阶段：Session + 登录检测');
  await ensureSession();
  await ensureStartUrl();
  await reportCookieCount();

  if (await isLoggedIn()) {
    log('LOGIN', '已检测到登录态，无需人工操作');
    return;
  }

  log('LOGIN', '未检测到登录，跳转登录页等待人工操作');
  await navigateToLogin();
  await waitForLogin();
  await reportCookieCount('COOKIE-FINAL');
  log('PHASE1', '完成，下一阶段可执行搜索调试脚本');
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exitCode = 1;
});
