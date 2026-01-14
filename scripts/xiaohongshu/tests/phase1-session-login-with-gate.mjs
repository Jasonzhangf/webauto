#!/usr/bin/env node
/**
 * Phase 1（增强版）：启动 session + 登录 + 自动拉起 SearchGate
 * 
 * 功能：
 * 1. 检查并启动 xiaohongshu_fresh 会话
 * 2. 检查登录状态（基于容器）
 * 3. 登录成功后自动启动 SearchGate 服务
 * 
 * 改进：
 * - 在登录成功后自动启动 SearchGate（如果尚未运行）
 * - 统一入口，Phase2/3/4 脚本无需额外启动 Gate
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

const SEARCH_GATE_PORT = 7790;
const SEARCH_GATE_HEALTH = `http://127.0.0.1:${SEARCH_GATE_PORT}/health`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const startScript = path.join(repoRoot, 'scripts', 'start-headful.mjs');
const gateScript = path.join(repoRoot, 'scripts', 'search-gate-server.mjs');

let launchPromise = null;
let gateProcess = null;

function log(step, message) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${message}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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

async function listBrowserServiceSessions() {
  try {
    const status = await browserCommand('getStatus', {}, 5_000);
    return extractSessions(status);
  } catch (err) {
    log('WARN', `BrowserService 会话列表获取失败：${err.message}`);
    return [];
  }
}

async function findExistingSession() {
  // 1) 优先通过 Unified API 的 session:list 检查（标准路径）
  const managerSessions = await listSessions().catch(() => []);
  const fromManager = managerSessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
  if (fromManager) {
    log('SESSION', `已存在 ${PROFILE}（via session:list）｜ URL: ${fromManager.currentUrl || '未知'}`);
    return fromManager;
  }

  // 2) 退化路径：直接从 Browser Service 读取会话状态，避免“浏览器已起但未同步到 SessionManager”的假空状态
  const browserSessions = await listBrowserServiceSessions();
  const fromBrowser = browserSessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
  if (fromBrowser) {
    log(
      'SESSION',
      `检测到 ${PROFILE}（via browser-service:getStatus）｜ URL: ${fromBrowser.currentUrl || '未知'}`,
    );
    return fromBrowser;
  }

  return null;
}

async function ensureSession() {
  const existing = await findExistingSession();
  if (existing) {
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
    const existing = await findExistingSession();
    if (existing) {
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
  // 登录流程本身会自动跳转到首页/详情页，这里只在“完全不在小红书域名”时做一次导航
  if (current && current.includes('xiaohongshu.com')) return;
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      if (!location.href.includes('xiaohongshu.com')) {
        return { ok: false, reason: 'not_on_xiaohongshu' };
      }
      return { ok: true };
    })();`,
  });
  await delay(4000);
}

async function navigateToLogin() {
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      if (!location.href.includes('/login')) {
        return { ok: false, reason: 'not_on_login_page' };
      }
      return { ok: true };
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

    const loginAnchor = findContainer(tree, /\.login_anchor$/);
    if (loginAnchor) {
      return {
        status: 'logged_in',
        container: loginAnchor.id || loginAnchor.defId,
        method: 'container_match',
      };
    }

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

// ===========================
// SearchGate 服务管理
// ===========================

async function isSearchGateRunning() {
  try {
    const res = await fetch(SEARCH_GATE_HEALTH, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function startSearchGate() {
  if (gateProcess) {
    log('GATE', 'SearchGate 进程已在管理中，跳过启动');
    return;
  }

  if (await isSearchGateRunning()) {
    log('GATE', 'SearchGate 已在运行（外部启动），无需重复启动');
    return;
  }

  log('GATE', '启动 SearchGate 服务...');
  gateProcess = spawn('node', [gateScript], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: repoRoot,
  });

  gateProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[GATE-OUT] ${chunk.toString()}`);
  });

  gateProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[GATE-ERR] ${chunk.toString()}`);
  });

  gateProcess.unref();

  // 等待几秒确认启动成功
  await delay(3000);

  if (await isSearchGateRunning()) {
    log('GATE', `✅ SearchGate 已启动（PID: ${gateProcess.pid}）`);
  } else {
    log('GATE', '⚠️ SearchGate 启动可能失败，请检查日志');
  }
}

// ===========================
// 主流程
// ===========================

async function main() {
  log('PHASE1', '启动阶段：Session + 登录检测 + SearchGate');
  await ensureSession();
  await ensureStartUrl();
  await reportCookieCount();

  const loginState = await checkLoginStateByContainer();
  if (loginState.status === 'logged_in') {
    log('LOGIN', `容器检测：已登录（${loginState.container || 'login_anchor'}）`);
  } else if (loginState.status === 'not_logged_in') {
    log(
      'LOGIN',
      `容器检测：未登录（${loginState.container || 'login_guard'}），跳转登录页等待人工操作`,
    );
    await navigateToLogin();
    await waitForLogin();
    await reportCookieCount('COOKIE-FINAL');
  } else {
    log(
      'LOGIN',
      `容器检测：状态不确定（${
        loginState.reason || loginState.error || loginState.status
      }），暂不触发登录流程`,
    );
  }

  // 登录成功后，自动启动 SearchGate
  await startSearchGate();

  log('PHASE1', '✅ 完成，下一阶段可执行搜索调试脚本（SearchGate 已启动）');
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exitCode = 1;
});
