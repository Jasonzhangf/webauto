#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase 1：启动/复用 xiaohongshu_fresh 会话，并确保登录成功。
 * - 如果会话不存在，提示先手动启动 start-headful.mjs。
 * - 登录状态完全基于容器匹配：*.login_anchor / xiaohongshu_login.login_guard。
 * - 循环高亮登录相关容器，等待人工登录完成。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIFIED_API = 'http://127.0.0.1:7701';
const BROWSER_SERVICE = 'http://127.0.0.1:7704';
const PROFILE = 'xiaohongshu_fresh';
const DEFAULT_KEYWORD = '手机膜';
const START_URL = 'https://www.xiaohongshu.com';
const DISCOVER_URL = 'https://www.xiaohongshu.com/explore';
const LOGIN_URL = 'https://www.xiaohongshu.com/login';
const SESSION_WAIT_TIMEOUT = 90_000;
const LOGIN_WAIT_TIMEOUT = 180_000;

async function checkDaemonHealth() {
  try {
    const res = await fetch(`${UNIFIED_API}/health`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Unified API unhealthy (${res.status})`);
    }
  } catch (err) {
    log('DAEMON', `❌ Unified API 不可用：${err.message}`);
    log('DAEMON', '请先启动 core-daemon：node scripts/core-daemon.mjs start');
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const startScript = path.join(repoRoot, 'scripts', 'start-headful.mjs');

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
    signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
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

async function controllerActionWithRetry(action, payload = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await controllerAction(action, payload);
    } catch (err) {
      if (err.message.includes('aborted') || err.message.includes('timeout')) {
        log('WARN', `请求超时 (${i + 1}/${maxRetries})，重试中...`);
        if (i < maxRetries - 1) {
          await delay(2000);
          continue;
        }
      }
      throw err;
    }
  }
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

async function getBrowserServiceSession() {
  try {
    const status = await browserCommand('getStatus', {}, 5000);
    const sessions = Array.isArray(status?.sessions) ? status.sessions : [];
    const found = sessions
      .map(normalizeSession)
      .find((s) => s?.profileId === PROFILE);
    return found || null;
  } catch {
    return null;
  }
}

async function getSystemSessionState() {
  try {
    const res = await fetch(
      `${UNIFIED_API}/v1/system/sessions?profileId=${encodeURIComponent(PROFILE)}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
      },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const list = Array.isArray(data?.data) ? data.data : [];
    if (!list.length) return null;
    return normalizeSession(list[0]);
  } catch {
    return null;
  }
}

async function ensureSession() {
  const registrySession = await getSystemSessionState();
  const browserSession = await getBrowserServiceSession();

  // 1. Browser Service 已有真实会话，直接复用
  if (browserSession) {
    log(
      'SESSION',
      `已存在 ${PROFILE}（browser-service）｜ URL: ${browserSession.currentUrl || '未知'}`,
    );
    return browserSession;
  }

  // 2. StateRegistry 有记录但 Browser Service 没有，会话已丢失，视为脏数据，仅做提示
  if (registrySession && !browserSession) {
    log(
      'SESSION',
      `StateRegistry 记录了 ${PROFILE}，但 Browser Service 无会话，按无会话处理（可能是历史残留）`,
    );
  } else {
    log('SESSION', `未检测到 ${PROFILE} 会话，准备通过 Browser Service 启动浏览器...`);
  }

  // 3. 通过 Browser Service 真正拉起会话（不依赖 session-manager CLI）
  try {
    await browserCommand(
      'start',
      {
        profileId: PROFILE,
        headless: false,
        url: START_URL,
      },
      30_000,
    );
  } catch (err) {
    log('SESSION', `Browser Service 启动会话失败：${err.message}`);
    throw err;
  }

  return waitForSessionReady();
}

async function waitForSessionReady() {
  const start = Date.now();
  while (Date.now() - start < SESSION_WAIT_TIMEOUT) {
    await delay(3000);

    // 同时检查 StateRegistry 与 Browser Service 任意一方
    const [registrySession, browserSession] = await Promise.all([
      getSystemSessionState(),
      getBrowserServiceSession(),
    ]);
    const session = browserSession || registrySession;

    if (session) {
      log('SESSION', `检测到 ${PROFILE} ｜ URL: ${session.currentUrl || '未知'}`);
      return session;
    }
  }
  throw new Error(`等待 ${PROFILE} 会话超时 (${SESSION_WAIT_TIMEOUT / 1000}s)`);
}

async function getCurrentUrl() {
  // 1. 优先从 StateRegistry 读取会话当前 URL，避免频繁调 session-manager CLI
  const registrySession = await getSystemSessionState();
  if (registrySession?.currentUrl) {
    return registrySession.currentUrl;
  }

  // 2. 回退到直接在浏览器内读取 location.href
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'location.href',
    });
    return result?.result || result || '';
  } catch {
    return '';
  }
}

async function ensureStartUrl() {
  const current = await getCurrentUrl();
  if (current && current.includes('xiaohongshu.com')) {
    log('SESSION', '已在小红书站点');
    return;
  }
  log('WARN', '不在小红书站点，导航到主页');
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `window.location.href = '${START_URL}'`,
  });
  await delay(3000);
}

async function returnToDiscover() {
  log('RECOVER', '返回发现页重置状态');
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_home.discover_button',
    operationId: 'click',
    sessionId: PROFILE,
  }).catch(async () => {
    // 降级只允许回到主页，由站点自动跳转到发现页，禁止构造 /explore URL
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.location.href = '${START_URL}'`,
    });
  });
  await delay(3000);
}

async function detectRiskControl() {
  try {
    const result = await controllerAction('containers:match', {
      profile: PROFILE,
      url: await getCurrentUrl(),
      maxDepth: 3,
      maxChildren: 8,
    });
    const tree = result?.snapshot?.container_tree || result?.container_tree;
    if (!tree) return false;
    const hasRisk = tree.children?.some((child) =>
      (child.id || '').includes('qrcode_guard') || (child.defId || '').includes('qrcode_guard')
    );
    if (hasRisk) {
      log('RISK', '🚨 检测到风控容器');
    }
    return hasRisk;
  } catch (err) {
    log('WARN', `风控检测失败：${err.message}`);
    return false;
  }
}

async function ensureSafeState() {
  const current = await getCurrentUrl();
  log('CHECK', `当前 URL: ${current}`);

  if (!current || !current.includes('xiaohongshu.com') || current.includes('zhaoshang')) {
    log('CHECK', '不在小红书主站，导航到主页');
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.location.href = '${START_URL}'`,
    });
    await delay(3000);
    return;
  }

  if (await detectRiskControl()) {
    log('CHECK', '检测到风控，尝试返回发现页');
    await returnToDiscover();
    await delay(2000);
    if (await detectRiskControl()) {
      log('ERROR', '❌ 风控未解除，请手动处理');
      process.exit(1);
    }
  }

  const finalUrl = await getCurrentUrl();
  if (!finalUrl.includes('/explore') && !finalUrl.includes('/search')) {
    log('CHECK', '不在发现页或搜索页，返回发现页');
    await returnToDiscover();
  }
}

async function navigateToLogin() {
  const current = await getCurrentUrl();
  if (current && current.includes('/login')) {
    log('LOGIN', '已在登录页');
    return;
  }

  // 如果不在发现页，先回到发现页（因为登录入口在侧边栏）
  if (!current.includes('/explore')) {
    log('LOGIN', '不在发现页，先返回发现页');
    await returnToDiscover();
    await delay(2000);
  }

  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      // 优先点击侧边栏登录按钮
      const loginBtn = document.querySelector('.side-bar .login-container');
      if (loginBtn) {
        loginBtn.click();
        return { method: 'click_sidebar_login' };
      }
      // 降级不再直接构造登录 URL，交给人工处理
      return { method: 'no_automatic_login_navigate' };
    })();`,
  });
  await delay(3000);
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
  await checkDaemonHealth();
  await ensureSession();
  await ensureStartUrl();
  await ensureSafeState();
  await reportCookieCount();

  // 先尝试判断登录态，避免不必要的跳转
  try {
    if (await isLoggedIn()) {
      log('LOGIN', '已检测到登录态，无需人工操作');
      return;
    }
  } catch (e) {
    // 忽略检测错误，继续流程
  }

  log('LOGIN', '未检测到登录，尝试跳转登录页');
  await navigateToLogin();
  
  // 跳转后等待人工登录
  await waitForLogin();
  await reportCookieCount('COOKIE-FINAL');
  log('PHASE1', '完成，下一阶段可执行搜索调试脚本');
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exitCode = 1;
});
