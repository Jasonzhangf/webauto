#!/usr/bin/env node
/**
 * Phase 1-4 全流程采集脚本
 *
 * 功能：
 * - Phase1：确保浏览器会话存在并完成登录，拉起 SearchGate
 * - Phase2-4：基于当前搜索结果页，按目标数量循环执行 列表收集 + 打开详情 + 评论采集 + ESC 退出 + 落盘
 *
 * 约束：
 * - 不直接启动/停止 unified-api 或 browser-service，假设 core-daemon 已经在后台运行
 * - Phase2 只作为独立调试脚本使用；本脚本不再单独跑 phase2-search，而是直接在 phase2-4-loop 内用 target 完成全流程
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';

import { execute as goToSearch } from '../../../dist/modules/workflow/blocks/GoToSearchBlock.js';
import { execute as collectSearchList } from '../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as openDetail } from '../../../dist/modules/workflow/blocks/OpenDetailBlock.js';
import { execute as collectComments } from '../../../dist/modules/workflow/blocks/CollectCommentsBlock.js';
import { execute as extractDetail } from '../../../dist/modules/workflow/blocks/ExtractDetailBlock.js';
import { execute as errorRecovery } from '../../../dist/modules/workflow/blocks/ErrorRecoveryBlock.js';
import { execute as persistXhsNote } from '../../../dist/modules/workflow/blocks/PersistXhsNoteBlock.js';
import { execute as detectPageState } from '../../../dist/modules/workflow/blocks/DetectPageStateBlock.js';
import { CollectStateManager, STATE_FILE_NAME } from './state-manager.mjs';

const PROFILE = 'xiaohongshu_fresh';
const PLATFORM = 'xiaohongshu';
const UNIFIED_API = 'http://127.0.0.1:7701';
const BROWSER_SERVICE = process.env.WEBAUTO_BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';
const BROWSER_WS = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const startScript = path.join(repoRoot, 'scripts', 'start-headful.mjs');

// 默认关键字与目标数量
const DEFAULT_KEYWORD = '国际贸易';
const DEFAULT_TARGET = 200;
const DEFAULT_ENV = 'debug';

const DEFAULT_SEARCH_GATE_PORT = process.env.WEBAUTO_SEARCH_GATE_PORT || '7790';
const DEFAULT_SEARCH_GATE_BASE = `http://127.0.0.1:${DEFAULT_SEARCH_GATE_PORT}`;
const DEFAULT_SEARCH_GATE_URL = `${DEFAULT_SEARCH_GATE_BASE}/permit`;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_COUNT = 5;
let launchPromise = null;
let containerAnchorHelpersPromise = null;
let collectStateManager = null;
let collectState = null;

const argv = minimist(process.argv.slice(2));

const SERVICE_SPECS = [
  {
    key: 'unified-api',
    label: 'Unified API',
    healthUrl: 'http://127.0.0.1:7701/health',
    script: path.join(repoRoot, 'dist', 'services', 'unified-api', 'server.js'),
    env: { PORT: '7701', NODE_ENV: 'production' },
    startTimeoutMs: 30_000,
  },
  {
    key: 'browser-service',
    label: 'Browser Service',
    healthUrl: 'http://127.0.0.1:7704/health',
    script: path.join(repoRoot, 'dist', 'services', 'browser-service', 'index.js'),
    env: { PORT: '7704', WS_PORT: '8765', NODE_ENV: 'production' },
    startTimeoutMs: 30_000,
  },
];

function resolveKeyword() {
  const fromFlag = argv.keyword || argv.k;
  const fromPositional =
    Array.isArray(argv._) && argv._.length > 0 ? argv._[argv._.length - 1] : undefined;
  const candidate = fromFlag || fromPositional;
  if (candidate && typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return DEFAULT_KEYWORD;
}

function resolveTarget() {
  const raw = argv.target ?? argv.t;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_TARGET;
}

function resolveEnv() {
  const fromFlag = argv.env || argv.e;
  if (fromFlag && typeof fromFlag === 'string' && fromFlag.trim()) {
    return fromFlag.trim();
  }
  return DEFAULT_ENV;
}

function serviceLabel(spec) {
  return spec?.label || spec?.key || 'service';
}

async function checkServiceHealth(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServiceHealthy(spec) {
  const timeout = spec.startTimeoutMs || 30000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await checkServiceHealth(spec.healthUrl);
    if (ok) return true;
    await delay(1500);
  }
  return false;
}

async function startNodeService(spec) {
  const scriptPath = spec.script;
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `${serviceLabel(spec)} script not found: ${scriptPath}. 请先运行 npm run build:services`,
    );
  }

  try {
    const child = spawn('node', [scriptPath], {
      cwd: repoRoot,
      env: { ...process.env, ...spec.env },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log(
      `[FullCollect][Phase1] ${serviceLabel(spec)} 启动命令已下发 (pid=${child.pid}), 等待健康检查...`,
    );
  } catch (err) {
    throw new Error(`启动 ${serviceLabel(spec)} 失败: ${err.message || err}`);
  }

  const healthy = await waitForServiceHealthy(spec);
  if (!healthy) {
    throw new Error(`${serviceLabel(spec)} 启动后健康检查失败 (${spec.healthUrl})`);
  }
  console.log(`[FullCollect][Phase1] ${serviceLabel(spec)} ✅ 在线`);
}

async function ensureBaseServices() {
  console.log('0️⃣ Phase1: 确认基础服务（Unified API → Browser Service）按依赖顺序就绪...');
  for (const spec of SERVICE_SPECS) {
    const label = serviceLabel(spec);
    const healthy = await checkServiceHealth(spec.healthUrl);
    if (healthy) {
      console.log(`[FullCollect][Phase1] ${label} 已在线 (${spec.healthUrl})`);
      continue;
    }
    console.log(`[FullCollect][Phase1] ${label} 未检测到，准备启动...`);
    await startNodeService(spec);
  }
}

async function browserServiceCommand(action, args = {}, timeoutMs = 20000) {
  const url = `${BROWSER_SERVICE}/command`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    throw new Error(
      data?.error ||
        data?.body?.error ||
        `browser-service command "${action}" HTTP ${res.status}`,
    );
  }
  if (data && data.ok === false) {
    throw new Error(data.error || `browser-service command "${action}" failed`);
  }
  if (data && data.error) {
    throw new Error(data.error);
  }
  return data;
}

async function controllerAction(action, payload = {}, timeoutMs = 20000) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function browserServiceWsCommand(sessionId, data, timeoutMs = 15000) {
  const { default: WebSocket } = await import('ws');
  const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error(`browser-service ws timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    const ws = new WebSocket(BROWSER_WS);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    ws.on('open', () => {
      try {
        ws.send(
          JSON.stringify({
            type: 'command',
            request_id: requestId,
            session_id: sessionId,
            data,
          }),
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(String(buf || ''));
        if (msg?.type !== 'response') return;
        if (String(msg?.request_id || '') !== requestId) return;
        const payload = msg?.data || {};
        if (payload?.success === false) {
          cleanup();
          reject(new Error(payload?.error || 'browser-service ws command failed'));
          return;
        }
        cleanup();
        resolve(payload);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    ws.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

function normalizePlaywrightKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  // Playwright key combos use "Meta+BracketLeft" instead of "Meta+["
  if (k === 'Meta+[') return 'Meta+BracketLeft';
  if (k === 'Meta+]') return 'Meta+BracketRight';
  if (k === 'Ctrl+[') return 'Control+BracketLeft';
  if (k === 'Ctrl+]') return 'Control+BracketRight';
  if (k === 'Esc') return 'Escape';
  return k;
}

async function systemKeyPress(key) {
  if (!key) return;
  const normalized = normalizePlaywrightKey(key);
  await browserServiceCommand('keyboard:press', { profileId: PROFILE, key: normalized });
}

async function systemMouseWheel(deltaY, coordinates = null) {
  const dy = Number(deltaY) || 0;
  if (!dy) return;

  // 优先尝试 browser-service HTTP（若服务未重启可能不存在该 action），失败则回退到 WS user_action.scroll。
  try {
    if (coordinates) {
      await browserServiceCommand('mouse:move', {
        profileId: PROFILE,
        x: coordinates.x,
        y: coordinates.y,
        steps: 3,
      });
      await delay(80 + Math.random() * 120);
    }
    await browserServiceCommand('mouse:wheel', { profileId: PROFILE, deltaX: 0, deltaY: dy });
    return;
  } catch (err) {
    console.warn(
      '[FullCollect][SystemScroll] HTTP mouse:wheel 不可用，回退到 WS user_action.scroll:',
      err?.message || String(err),
    );
  }

  await browserServiceWsCommand(PROFILE, {
    command_type: 'user_action',
    action: 'operation',
    parameters: {
      operation_type: 'scroll',
      ...(coordinates ? { target: { coordinates } } : {}),
      deltaY: dy,
    },
  });
}

async function getWindowScrollY() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'window.scrollY || document.documentElement.scrollTop || 0',
    });
    return Number(result?.result ?? result?.scrollY ?? 0) || 0;
  } catch {
    return 0;
  }
}

async function getCurrentUrl() {
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

async function systemClickAt(coordinates) {
  if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number') {
    throw new Error('invalid_click_coordinates');
  }
  await browserServiceCommand('mouse:move', {
    profileId: PROFILE,
    x: coordinates.x,
    y: coordinates.y,
    steps: 3,
  });
  await delay(80 + Math.random() * 140);
  await browserServiceCommand('mouse:click', {
    profileId: PROFILE,
    x: coordinates.x,
    y: coordinates.y,
    clicks: 1,
    delay: 40 + Math.floor(Math.random() * 60),
  });
  await delay(180 + Math.random() * 260);
}

function clampNumber(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function normalizeClickablePoint(point, viewport, { safeTop = 140, safeBottom = 80 } = {}) {
  const w = Number(viewport?.w || 0) || 0;
  const h = Number(viewport?.h || 0) || 0;
  if (!w || !h) return point;
  const x = clampNumber(point.x, 40, w - 40);
  const y = clampNumber(point.y, safeTop, h - safeBottom);
  return { x, y };
}

async function waitForDetailReady(maxRetries = 12) {
  let safeUrl = '';
  let noteId = '';
  for (let i = 0; i < maxRetries; i += 1) {
    const currentUrl = await getCurrentUrl().catch(() => '');

    if (
      currentUrl &&
      /\/explore\/[0-9a-z]+/i.test(currentUrl) &&
      /[?&]xsec_token=/.test(currentUrl)
    ) {
      safeUrl = currentUrl;
      const m = currentUrl.match(/\/explore\/([0-9a-z]+)/i);
      noteId = m && m[1] ? m[1] : '';
      return { ready: true, safeUrl, noteId };
    }

    try {
      const domResult = await controllerAction('browser:execute', {
        profile: PROFILE,
        script: `(() => {
          const hasModal =
            document.querySelector('.note-detail-mask') ||
            document.querySelector('.note-detail-page') ||
            document.querySelector('.note-detail-dialog') ||
            document.querySelector('.note-detail') ||
            document.querySelector('.detail-container') ||
            document.querySelector('.media-container');
          const hasComments =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container');
          return { hasModal: !!hasModal, hasComments: !!hasComments };
        })()`,
      });
      const payload = domResult?.result || domResult?.data?.result || domResult;
      if (payload?.hasModal || payload?.hasComments) {
        const url = currentUrl || (await getCurrentUrl().catch(() => ''));
        if (typeof url === 'string') {
          safeUrl = url;
          const m = url.match(/\/explore\/([0-9a-z]+)/i);
          noteId = m && m[1] ? m[1] : '';
        }
        return { ready: true, safeUrl, noteId };
      }
    } catch {
      // ignore
    }

    await delay(900 + Math.random() * 500);
  }
  return { ready: false, safeUrl: '', noteId: '' };
}

function mapTree(node) {
  if (!node) return null;
  return {
    id: node.id,
    defId: node.defId || node.name || node.id,
    children: Array.isArray(node.children) ? node.children.map(mapTree).filter(Boolean) : [],
  };
}

function findContainer(node, pattern) {
  if (!node) return null;
  if (pattern.test(node.id || node.defId || '')) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findContainer(child, pattern);
      if (found) return found;
    }
  }
  return null;
}

async function getContainerAnchorHelpers() {
  if (!containerAnchorHelpersPromise) {
    containerAnchorHelpersPromise = import('../../../dist/modules/workflow/blocks/helpers/containerAnchors.js').catch(
      (err) => {
        console.error('[FullCollect][AnchorHelper] 加载 container anchors 失败:', err.message || err);
        throw err;
      },
    );
  }
  return containerAnchorHelpersPromise;
}

async function verifySearchListAnchor() {
  try {
    const { verifyAnchorByContainerId } = await getContainerAnchorHelpers();
    const anchor = await verifyAnchorByContainerId(
      'xiaohongshu_search.search_result_list',
      PROFILE,
      UNIFIED_API,
      '2px solid #fbbc05',
      1200,
    );
    return anchor;
  } catch (err) {
    console.warn('[FullCollect][AnchorCheck] 验证搜索列表锚点失败:', err.message || err);
    return { found: false, error: err.message || String(err) };
  }
}

async function getSearchScrollState() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `(() => {
        const winY = window.scrollY || document.documentElement.scrollTop || 0;
        const viewport = { w: window.innerWidth || 0, h: window.innerHeight || 0 };
        const viewportHeight = viewport.h || 0;
        const cards = Array.from(document.querySelectorAll('.note-item'));
        const visible = cards
          .map((el) => {
            const rect = el.getBoundingClientRect();
            if (!(rect.top >= 0 && rect.bottom <= viewportHeight)) return null;
            const linkEl = el.querySelector('a.cover') || el.querySelector('a[href*="/explore/"]') || el.querySelector('a[href*="/search_result/"]');
            const href = linkEl ? (linkEl.getAttribute('href') || '') : '';
            const m = href.match(/\\/(explore|search_result)\\/([^?]+)/);
            const noteId = m && m[2] ? m[2] : '';
            const titleEl = el.querySelector('.footer .title span') || el.querySelector('.footer .title') || el.querySelector('[class*="title"]');
            const title = titleEl ? (titleEl.textContent || '').trim() : '';
            return noteId || title || '';
          })
          .filter(Boolean);
        const visibleSig = visible.slice(0, 3).join('||');
        const root =
          document.querySelector('.feeds-container') ||
          document.querySelector('.note-item')?.parentElement ||
          null;

        const isScrollable = (el) => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY || '';
          if (!(overflowY.includes('auto') || overflowY.includes('scroll'))) return false;
          return (el.scrollHeight || 0) > (el.clientHeight || 0);
        };

        let scrollEl = root;
        while (scrollEl && scrollEl !== document.body && !isScrollable(scrollEl)) {
          scrollEl = scrollEl.parentElement;
        }
        if (!scrollEl) {
          scrollEl = document.scrollingElement || document.documentElement;
        }
        return {
          winY,
          viewport,
          visibleSig,
          list: scrollEl
            ? {
                scrollTop: scrollEl.scrollTop || 0,
                scrollHeight: scrollEl.scrollHeight || 0,
                clientHeight: scrollEl.clientHeight || 0,
              }
            : null,
        };
      })()`,
    });
    return result?.result || result?.data?.result || result;
  } catch {
    return { winY: 0, viewport: { w: 0, h: 0 }, visibleSig: '', list: null };
  }
}

async function waitForSessionReady(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const sessions = await listSessions().catch(() => []);
    const normalized = sessions.map(normalizeSession).filter(Boolean);
    if (normalized.find((s) => s.profileId === PROFILE)) {
      return true;
    }
    await delay(2000);
  }
  throw new Error('session_start_timeout');
}

async function startSession() {
  if (launchPromise) return launchPromise;
  console.log(`[FullCollect] 会话 ${PROFILE} 不存在，准备通过 start-headful 启动浏览器...`);
  launchPromise = new Promise((resolve) => {
    try {
      const child = spawn('node', [startScript, '--profile', PROFILE, '--url', 'https://www.xiaohongshu.com'], {
        cwd: repoRoot,
        env: process.env,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log(`[FullCollect] 已后台启动 start-headful（pid=${child.pid}），等待会话就绪...`);
    } catch (err) {
      console.error('[FullCollect] 启动浏览器失败:', err?.message || err);
    } finally {
      resolve();
    }
  }).finally(() => {
    launchPromise = null;
  });
  return launchPromise;
}

async function matchContainers(targetUrl = null) {
  const url = targetUrl || (await getCurrentUrl()) || 'https://www.xiaohongshu.com';
  const snapshot = await controllerAction('containers:match', {
    profile: PROFILE,
    url,
    maxDepth: 3,
    maxChildren: 8,
  });
  return mapTree(snapshot?.snapshot?.container_tree || snapshot?.container_tree);
}

async function checkLoginStateByContainer() {
  try {
    const url = await getCurrentUrl();
    const tree = await matchContainers(url);
    if (!tree) {
      // 当容器树不可用时，退回到 URL 级别的登录态启发式判断：
      // 1. 明确命中登录域名 /login* → not_logged_in
      // 2. 处于 explore/search 等业务页面，且 URL 带有 xsec_token → 认为已经登录
      const safeUrl = url || '';
      const loginUrlPattern = /xiaohongshu\.com\/login|passport\.xiaohongshu\.com/;
      if (loginUrlPattern.test(safeUrl)) {
        return { status: 'not_logged_in', reason: 'login_url' };
      }

      const detailOrSearchPattern =
        /xiaohongshu\.com\/(explore|search_result|search|home|discovery)/;
      const hasToken = /xsec_token=/.test(safeUrl);
      if (detailOrSearchPattern.test(safeUrl) || hasToken) {
        return {
          status: 'logged_in',
          container: null,
          reason: 'no_container_tree_but_url_looks_logged_in',
        };
      }

      return { status: 'unknown', reason: 'no_container_tree' };
    }

    const loginAnchor = findContainer(tree, /login_anchor$/);
    const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
    const riskGuard = findContainer(tree, /qrcode_guard/);

    if (riskGuard) {
      return {
        status: 'risk',
        container: riskGuard.id || riskGuard.defId,
      };
    }

    if (loginAnchor) {
      return {
        status: 'logged_in',
        container: loginAnchor.id || loginAnchor.defId,
      };
    }

    if (loginGuard) {
      return {
        status: 'not_logged_in',
        container: loginGuard.id || loginGuard.defId,
      };
    }

    return { status: 'unknown', reason: 'no_login_anchor_or_guard' };
  } catch (err) {
    return { status: 'error', error: err.message || String(err) };
  }
}

async function ensureSessionAndLogin() {
  console.log('[FullCollect] Phase1: 检查会话 + 登录状态（容器锚点）...');

  async function detectLoginStateWithRetry(maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const state = await checkLoginStateByContainer();
      if (state.status !== 'unknown' && state.status !== 'error') {
        return state;
      }
      if (attempt < maxAttempts) {
        console.warn(
          `[FullCollect] 登录状态检测失败（${state.reason || state.error || 'unknown'}），2秒后重试 (${attempt}/${maxAttempts})...`,
        );
        await delay(2000);
      } else {
        return state;
      }
    }
  }

async function ensureSessionPresence() {
    let sessions = [];
    try {
      sessions = await listSessions();
    } catch (err) {
      console.warn(
        '[FullCollect] session:list 调用失败，将继续尝试基于容器检测登录态:',
        err.message || err,
      );
    }
    const normalized = sessions.map(normalizeSession).filter(Boolean);
    const existing = normalized.find((s) => s.profileId === PROFILE);
    if (existing) {
      console.log(
        `[FullCollect] 检测到会话 ${PROFILE}，当前 URL: ${existing.currentUrl || '未知'}`,
      );
      return true;
    }
    console.warn(
      `[FullCollect] 未在 Unified API session:list 中找到会话 ${PROFILE}，将尝试自动启动浏览器...`,
    );
    await startSession();
    try {
      await waitForSessionReady();
      console.log('[FullCollect] 会话启动完成，等待页面稳定...');
      await delay(4000);
      return true;
    } catch (err) {
      console.warn(
        '[FullCollect] 等待 session:list 出现会话超时，将直接依赖容器检测页面状态:',
        err.message || err,
      );
      await delay(4000);
      return true;
    }
  }

  const sessionReady = await ensureSessionPresence();
  if (!sessionReady) {
    throw new Error('session_not_ready');
  }

  const loginState = await detectLoginStateWithRetry(3);
  if (loginState.status === 'logged_in') {
    console.log(
      `[FullCollect] 登录状态：已登录（${loginState.container || 'login_anchor'}）`,
    );
    return;
  }

  if (loginState.status === 'risk') {
    console.error(
      `[FullCollect] 登录状态：检测到风控页面（${loginState.container || 'qrcode_guard'}），请在浏览器内先解除风控后重试`,
    );
    throw new Error('risk_control_detected');
  }

  if (loginState.status === 'not_logged_in') {
    console.error(
      `[FullCollect] 登录状态：未登录（${loginState.container || 'login_guard'}），请在浏览器窗口完成登录后重新执行本脚本`,
    );
    throw new Error('not_logged_in');
  }

  console.error(
    `[FullCollect] 登录状态不确定（${loginState.reason || loginState.error || loginState.status}），请在浏览器中确认登录状态后重试`,
  );
  throw new Error('login_state_unknown');
}

async function ensureSearchGate() {
  const gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || DEFAULT_SEARCH_GATE_URL;
  const healthUrl = gateUrl.replace(/\/permit$/, '/health');

  async function checkHealth() {
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined,
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return !!data?.ok;
    } catch {
      return false;
    }
  }

  if (await checkHealth()) {
    console.log(`[FullCollect] SearchGate 已在线: ${healthUrl}`);
    return;
  }

  if (
    process.env.WEBAUTO_SEARCH_GATE_URL &&
    process.env.WEBAUTO_SEARCH_GATE_URL !== DEFAULT_SEARCH_GATE_URL
  ) {
    console.warn(
      `[FullCollect] 检测到自定义 WEBAUTO_SEARCH_GATE_URL，但健康检查失败: ${healthUrl}`,
    );
    console.warn('[FullCollect] 请手动启动或修复自定义 SearchGate 服务');
    throw new Error('search_gate_unhealthy_custom');
  }

  const scriptPath = path.join(repoRoot, 'scripts', 'search-gate-server.mjs');
  console.log(`[FullCollect] 未检测到 SearchGate 服务，准备启动: node ${scriptPath}`);

  try {
    const child = spawn('node', [scriptPath], {
      cwd: repoRoot,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    console.log(`[FullCollect] SearchGate 已后台启动，pid=${child.pid}`);
  } catch (err) {
    console.error('[FullCollect] SearchGate 启动失败:', err?.message || err);
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));
  if (await checkHealth()) {
    console.log(`[FullCollect] SearchGate 启动成功: ${healthUrl}`);
    return;
  }

  console.error(
    '[FullCollect] SearchGate 启动后健康检查仍然失败，请在另一个终端手动检查 node scripts/search-gate-server.mjs',
  );
  throw new Error('search_gate_unhealthy');
}

async function requestGatePermit(
  key = PROFILE,
  { windowMs = 60_000, maxCount = 5 } = {},
) {
  const gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || DEFAULT_SEARCH_GATE_URL;
  try {
    const res = await fetch(gateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, windowMs, maxCount }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) {
      return { ok: false, allowed: false, waitMs: windowMs };
    }
    const data = await res.json().catch(() => ({}));
    return {
      ok: Boolean(data?.ok),
      allowed: Boolean(data?.allowed),
      waitMs: Number(data?.waitMs || 0),
      raw: data,
    };
  } catch (err) {
    console.warn('[FullCollect][Gate] permit 调用失败:', err?.message || err);
    return { ok: false, allowed: true, waitMs: 0 };
  }
}

async function scrollSearchPage(direction = 'down', keywordForRecovery = null) {
  const sign = direction === 'up' ? -1 : 1;
  const before = await getSearchScrollState();

  // 通过列表锚点定位滚动落点（坐标），使用系统滚轮事件；禁止 JS scroll 兜底
  const anchorBefore = await verifySearchListAnchor();
  let coordinates = null;
  if (anchorBefore?.found && anchorBefore.rect) {
    const rect = anchorBefore.rect;
    const viewportH = Number(before?.viewport?.h) || 0;
    const viewportW = Number(before?.viewport?.w) || 0;
    const rawX = rect.x + rect.width / 2;
    const rawY = rect.y + rect.height / 2;
    const x = viewportW ? Math.min(Math.max(40, rawX), viewportW - 40) : rawX;
    const y = viewportH ? Math.min(Math.max(120, rawY), viewportH - 120) : rawY;
    coordinates = { x, y };
  }

  let after = before;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const deltaMagnitude = 320 + Math.floor(Math.random() * 380); // 320-700
    const deltaY = sign * deltaMagnitude;
    try {
      if (coordinates) {
        await browserServiceCommand('mouse:move', {
          profileId: PROFILE,
          x: coordinates.x,
          y: coordinates.y,
          steps: 3,
        });
        await delay(200 + Math.random() * 250);
      }

      await systemMouseWheel(deltaY, coordinates);

      await delay(800 + Math.random() * 700);
      after = await getSearchScrollState();
      const winDelta = Number(after?.winY || 0) - Number(before?.winY || 0);
      const listDelta =
        Number(after?.list?.scrollTop || 0) - Number(before?.list?.scrollTop || 0);
      const sigBefore = String(before?.visibleSig || '');
      const sigAfter = String(after?.visibleSig || '');
      if (winDelta !== 0 || listDelta !== 0) break;
      if (sigBefore && sigAfter && sigBefore !== sigAfter) break;
    } catch (err) {
      console.warn(
        `[FullCollect][ScrollSearchPage] 系统滚动失败 attempt=${attempt}:`,
        err.message || err,
      );
      await delay(700);
    }
  }

  const winDelta = Number(after?.winY || 0) - Number(before?.winY || 0);
  const listDelta =
    Number(after?.list?.scrollTop || 0) - Number(before?.list?.scrollTop || 0);
  const sigBefore = String(before?.visibleSig || '');
  const sigAfter = String(after?.visibleSig || '');
  const sigChanged = sigBefore && sigAfter && sigBefore !== sigAfter;
  if (winDelta === 0 && listDelta === 0 && !sigChanged) {
    console.warn(
      '[FullCollect][ScrollSearchPage] ⚠️ window/list scrollTop 均未变化，认为系统滚动未生效，停止以避免在同一屏死循环',
    );
    return false;
  }

  const anchor = await verifySearchListAnchor();
  if (!anchor?.found) {
    console.error(
      '[FullCollect][ScrollSearchPage] 滚动后未找到搜索列表锚点，可能已跳转到异常页面',
    );
    const isRisk = await detectRiskControl();
    if (isRisk) {
      console.error('[FullCollect][ScrollSearchPage] 🚨 检测到风控锚点（qrcode_guard）');
    }
    return false;
  }

  if (anchor.rect) {
    console.log(
      `[FullCollect][ScrollSearchPage] ${direction} scroll rect: y=${anchor.rect.y} height=${anchor.rect.height}`,
    );
  }

  return true;
}

async function detectRiskControl() {
  try {
    const match = await controllerAction('containers:match', { profile: PROFILE });
    const tree = mapTree(match?.snapshot?.container_tree || match?.container_tree);
    if (!tree) return false;
    const riskNode = findContainer(tree, /qrcode_guard/);
    if (riskNode) {
      console.log(
        '[FullCollect][Risk] 🚨 检测到风控容器:',
        riskNode.id || riskNode.defId || 'unknown',
      );
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[FullCollect][Risk] 风控检测失败:', err.message || err);
    return false;
  }
}

function extractSearchKeywordFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const kw = u.searchParams.get('keyword');
    if (!kw) return null;
    try {
      return decodeURIComponent(kw);
    } catch {
      return kw;
    }
  } catch {
    return null;
  }
}

function normalizeKeywordForCompare(kw) {
  return (kw || '').toString().trim();
}

async function tryRecoverSearchKeywordDrift(canonicalKw, { maxTries = 2 } = {}) {
  const target = normalizeKeywordForCompare(canonicalKw);
  if (!target) return { ok: true, reason: 'no_canonical' };
  for (let i = 1; i <= maxTries; i += 1) {
    const url = await getCurrentUrl().catch(() => '');
    const current = normalizeKeywordForCompare(extractSearchKeywordFromUrl(url) || '');
    if (current && current === target) return { ok: true, reason: 'already_match' };
    console.warn(
      `[Phase2] keyword 漂移 detected (current="${current || '空'}" canonical="${target}"), 尝试后退恢复 (${i}/${maxTries})...`,
    );
    try {
      await systemKeyPress('Meta+[');
    } catch {
      // ignore
    }
    await delay(1200 + Math.random() * 600);
  }
  const finalUrl = await getCurrentUrl().catch(() => '');
  const finalKw = normalizeKeywordForCompare(extractSearchKeywordFromUrl(finalUrl) || '');
  return { ok: finalKw && finalKw === target, reason: 'back_exhausted', finalKw, finalUrl };
}

async function appendSafeDetailIndexLine(indexPath, env, keyword, entry) {
  if (!entry || !entry.noteId) return;
  try {
    const firstSeenAtMs =
      typeof entry.firstSeenAtMs === 'number' && Number.isFinite(entry.firstSeenAtMs)
        ? entry.firstSeenAtMs
        : Date.now();
    const firstSeenAtIso =
      typeof entry.firstSeenAtIso === 'string' && entry.firstSeenAtIso
        ? entry.firstSeenAtIso
        : new Date(firstSeenAtMs).toISOString();
    const lastUpdatedAtMs =
      typeof entry.lastUpdatedAtMs === 'number' && Number.isFinite(entry.lastUpdatedAtMs)
        ? entry.lastUpdatedAtMs
        : firstSeenAtMs;
    const lastUpdatedAtIso =
      typeof entry.lastUpdatedAtIso === 'string' && entry.lastUpdatedAtIso
        ? entry.lastUpdatedAtIso
        : new Date(lastUpdatedAtMs).toISOString();

    const line = JSON.stringify({
      platform: PLATFORM,
      env,
      keyword,
      noteId: entry.noteId,
      title: entry.title,
      safeDetailUrl: entry.safeDetailUrl,
      hasToken: entry.hasToken,
      containerId: entry.containerId || null,
      domIndex:
        typeof entry.domIndex === 'number' && Number.isFinite(entry.domIndex) ? entry.domIndex : null,
      header: entry.header || null,
      author: entry.author || null,
      firstSeenAtMs,
      firstSeenAtIso,
      lastUpdatedAtMs,
      lastUpdatedAtIso,
    });

    await fs.promises.appendFile(indexPath, `${line}\n`, 'utf8');
  } catch {
    // best-effort append; full rewrite will still happen at end
  }
}

function detectStageFromUrl(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const u = url.toLowerCase();
  if (u.includes('passport.xiaohongshu.com') || u.includes('/login')) return 'login';
  if (u.includes('/explore/')) return 'detail';
  if (u.includes('/search_result')) return 'search';
  if (
    u.includes('/explore') ||
    u === 'https://www.xiaohongshu.com/' ||
    u.includes('/home') ||
    u.includes('/discovery')
  ) {
    return 'home';
  }
  return 'unknown';
}

async function ensureSearchStage(keyword, maxAttempts = 3) {
  let didGoToSearch = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let state = null;
    try {
      state = await detectPageState({
        sessionId: PROFILE,
        platform: 'xiaohongshu',
        serviceUrl: UNIFIED_API,
      });
    } catch (err) {
      console.warn(
        `[FullCollect][StageCheck] DetectPageState 调用失败（attempt=${attempt}）:`,
        err?.message || String(err),
      );
    }

    const stage = state?.stage || 'unknown';
    const url = state?.url || '未知';
    console.log(
      `[FullCollect][StageCheck] attempt=${attempt} stage=${stage} url=${url}`,
    );

    if (stage === 'search') {
      const currentKwRaw = extractSearchKeywordFromUrl(url) || '';
      const currentKw = currentKwRaw.trim();
      const targetKw = (keyword || '').trim();

      // 没有目标关键字时，只要在搜索结果页即可接受
      if (!targetKw) {
        console.log(
          `[FullCollect][StageCheck] 当前已在搜索结果页（keyword="${currentKw || '未知'}"），无显式目标关键字，直接继续`,
        );
        return true;
      }

      if (currentKw && currentKw === targetKw) {
        console.log(
          `[FullCollect][StageCheck] 当前已在搜索结果页，关键字已匹配（keyword="${currentKw}"）`,
        );
        return true;
      }

      if (!didGoToSearch) {
        console.log(
          `[FullCollect][StageCheck] 当前在搜索结果页，但关键字不匹配（current="${currentKw || '空'}" target="${targetKw}"），通过 GoToSearch 重新输入关键字...`,
        );

        const searchResult = await goToSearch({
          sessionId: PROFILE,
          keyword,
        });

        didGoToSearch = true;

        if (!searchResult.success) {
          console.error(
            `[FullCollect][StageCheck] GoToSearch 在 search 阶段更新关键字失败: ${searchResult.error}`,
          );
          break;
        }

        console.log(
          `[FullCollect][StageCheck] GoToSearch 在 search 阶段更新关键字成功，url=${searchResult.url}`,
        );
        // 关键字已重输，下一轮循环重新检测阶段与 URL
        continue;
      }

      // 已尝试 GoToSearch 纠正，仍不匹配：视为平台纠偏/同义词映射，避免死循环，接受当前关键字继续。
      console.warn(
        `[FullCollect][StageCheck] 当前在搜索结果页，但关键字仍不匹配（current="${currentKw || '空'}" target="${targetKw}"），已尝试 GoToSearch，接受当前关键字继续（避免死循环）`,
      );
      return true;
    }

    if (stage === 'login') {
      console.error(
        '[FullCollect][StageCheck] 当前在登录页，请在浏览器内完成登录后重新执行脚本',
      );
      return false;
    }

    if (stage === 'detail') {
      console.log(
        '[FullCollect][StageCheck] 当前在详情页，尝试通过 ESC 恢复到搜索结果页...',
      );
      const rec = await errorRecovery({
        sessionId: PROFILE,
        fromStage: 'detail',
        targetStage: 'search',
        recoveryMode: 'esc',
        maxRetries: 2,
      }).catch((e) => ({
        success: false,
        finalStage: 'detail',
        method: 'esc',
        currentUrl: url,
        error: e?.message || String(e),
      }));

      console.log(
        `[FullCollect][StageCheck] ErrorRecovery result success=${rec.success} finalStage=${rec.finalStage} method=${rec.method} url=${rec.currentUrl || url}`,
      );

      if (!rec.success) {
        console.warn(
          '[FullCollect][StageCheck] ESC 恢复失败，尝试直接通过 GoToSearch 纠正到搜索结果页...',
        );
        // 不再提前中止本轮循环，后续将按“未知阶段”路径走 GoToSearch 纠正；
        // 保持 stage===detail，使下面的分支把它当作异常阶段处理。
      }

      if (rec.success) {
        // 锚点验证由 ErrorRecoveryBlock 完成，这里直接进入下一轮状态检测
        continue;
      }
    }

    if (stage === 'home') {
      console.log(
        '[FullCollect][StageCheck] 当前在发现/首页，通过 GoToSearch 再次进入搜索结果页...',
      );
    } else {
      console.warn(
        `[FullCollect][StageCheck] 当前阶段=${stage}（未知/异常），尝试通过 GoToSearch 纠正到搜索结果页...`,
      );
    }

    const searchResult = await goToSearch({
      sessionId: PROFILE,
      keyword,
    });

    if (!searchResult.success) {
      console.error(
        `[FullCollect][StageCheck] GoToSearch 重试失败: ${searchResult.error}`,
      );
      break;
    }

    console.log(
      `[FullCollect][StageCheck] GoToSearch 重试成功，url=${searchResult.url}`,
    );
  }

  console.error(
    '[FullCollect][StageCheck] 多次尝试后仍未进入搜索结果页（search），为避免在错误页面爬取，当前任务停止',
  );
  return false;
}

/**
 * 阶段守卫：强制确保当前处于「搜索结果页」阶段。
 *
 * 语义：
 * - 调用 ensureSearchStage 做一次纠正（含必要的 GoToSearch / ESC 恢复）；
 * - 若仍无法确认处于 search 阶段，则抛出错误，阻止后续任何「滚动 / 点击卡片」动作，
 *   避免在详情页或异常页面继续误操作。
 */
async function ensureSearchStageGuarded(keyword, env, contextLabel = '') {
  const ok = await ensureSearchStage(keyword, 2);
  if (ok) return;
  console.error(
    `[FullCollect][StageGuard] ensureSearchStage 失败，context=${contextLabel || 'unknown'}，为避免在错误页面继续采集，将终止当前阶段`,
  );
  throw new Error('stage_guard_not_search');
}

/**
 * 阶段守卫（禁止重复搜索版）：
 * - 只允许在 detail 时做 ESC 恢复
 * - 只允许在 search_result 内继续
 * - 禁止触发 GoToSearch（避免 Phase2 循环里重复搜索）
 */
async function ensureSearchStageOnlyGuarded(env, contextLabel = '') {
  let state = null;
  try {
    state = await detectPageState({
      sessionId: PROFILE,
      platform: 'xiaohongshu',
      serviceUrl: UNIFIED_API,
    });
  } catch (err) {
    console.warn(
      `[FullCollect][StageGuardNoSearch] DetectPageState 失败 context=${contextLabel || 'unknown'}:`,
      err?.message || String(err),
    );
  }

  const url = state?.url || (await getCurrentUrl().catch(() => ''));
  const stage = state?.stage || detectStageFromUrl(url);

  if (stage === 'search') return;

  if (stage === 'detail') {
    const rec = await errorRecovery({
      sessionId: PROFILE,
      fromStage: 'detail',
      targetStage: 'search',
      serviceUrl: UNIFIED_API,
      maxRetries: 2,
      recoveryMode: 'esc',
    }).catch((e) => ({
      success: false,
      recovered: false,
      error: e.message || String(e),
    }));
    if (rec?.success && rec?.recovered) return;
  }

  // 尝试一次“后退”回到搜索页（不计为搜索）
  for (let i = 0; i < 2; i += 1) {
    try {
      await systemKeyPress('Meta+[');
    } catch {
      // ignore
    }
    await delay(900 + Math.random() * 500);
    const u = await getCurrentUrl().catch(() => '');
    if (detectStageFromUrl(u) === 'search') return;
  }

  console.error(
    `[FullCollect][StageGuardNoSearch] stage=${stage} context=${contextLabel || 'unknown'}，禁止触发 GoToSearch，终止以避免重复搜索/状态乱跑`,
  );
  throw new Error('stage_guard_not_search_no_search');
}

async function returnToDiscoverViaSidebar() {
  console.log('[FullCollect][Risk] 尝试通过侧边栏返回发现页...');
  try {
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_home.discover_button',
      operationId: 'click',
      sessionId: PROFILE,
    });
  } catch (err) {
    console.warn('[FullCollect][Risk] 点击 discover_button 失败:', err.message || err);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function handleRiskRecovery(keyword) {
  console.log('[FullCollect][Risk] 风控恢复流程: 回发现页 + 上下滚动 + 重新搜索');
  try {
    await returnToDiscoverViaSidebar();

    await scrollSearchPage('down', keyword);
    await scrollSearchPage('up', keyword);

    console.log('[FullCollect][Risk] 通过 GoToSearchBlock 重新执行搜索...');
    const searchRes = await goToSearch({
      sessionId: PROFILE,
      keyword,
    });

    if (!searchRes.success) {
      console.error('[FullCollect][Risk] GoToSearchBlock 失败:', searchRes.error);
      return false;
    }

    console.log(
      `[FullCollect][Risk] 搜索恢复成功，url=${searchRes.url || searchRes.data?.url || ''}`,
    );
    return true;
  } catch (err) {
    console.error('[FullCollect][Risk] 风控恢复流程异常:', err.message || err);
    return false;
  }
}

function getKeywordBaseDir(env, keyword) {
  const homeDir = process.env.HOME || os.homedir();
  return path.join(homeDir, '.webauto', 'download', PLATFORM, env, keyword);
}

function getSafeDetailIndexPath(env, keyword) {
  return path.join(getKeywordBaseDir(env, keyword), 'safe-detail-urls.jsonl');
}

function getMetaPath(env, keyword) {
  return path.join(getKeywordBaseDir(env, keyword), '.collect-meta.json');
}

async function captureDebugSnapshot(env, keyword, label, extra = {}) {
  try {
    const baseDir = getKeywordBaseDir(env, keyword);
    const debugDir = path.join(baseDir, 'debug');
    await fs.promises.mkdir(debugDir, { recursive: true });

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const safeLabel =
      (label || 'snapshot')
        .toString()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 80) || 'snapshot';

    const pngPath = path.join(debugDir, `${ts}-${safeLabel}.png`);
    const jsonPath = path.join(debugDir, `${ts}-${safeLabel}.json`);

    let stageInfo = null;
    try {
      stageInfo = await detectPageState({
        sessionId: PROFILE,
        platform: 'xiaohongshu',
        serviceUrl: UNIFIED_API,
      });
    } catch {
      // ignore
    }

    let screenshotPath = null;
    try {
      const shot = await controllerAction('browser:screenshot', {
        profile: PROFILE,
        fullPage: false,
      });
      const b64 = shot?.screenshot || shot?.data?.screenshot || shot?.result?.screenshot;
      if (typeof b64 === 'string' && b64.length > 0) {
        const buf = Buffer.from(b64, 'base64');
        await fs.promises.writeFile(pngPath, buf);
        screenshotPath = pngPath;
      }
    } catch {
      // ignore
    }

    let domSummary = null;
    try {
      const domRes = await controllerAction('browser:execute', {
        profile: PROFILE,
        script: `(() => {
          const noteItems = document.querySelectorAll('.note-item');
          const searchInput = document.querySelector('#search-input, input[type="search"]');
          return {
            title: document.title,
            url: location.href,
            noteItems: noteItems.length,
            hasSearchInput: !!searchInput
          };
        })()`,
      });
      domSummary = domRes?.result || domRes?.data?.result || domRes;
    } catch {
      // ignore
    }

    const payload = {
      label,
      createdAt: now.toISOString(),
      stageInfo: stageInfo || null,
      screenshotPath,
      domSummary,
      extra,
    };
    await fs.promises.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(
      `[DebugSnapshot] label=${label} png=${screenshotPath || 'none'} json=${jsonPath}`,
    );
  } catch (err) {
    console.warn(
      '[DebugSnapshot] 创建调试快照失败:',
      err?.message || String(err),
    );
  }
}

async function readMeta(env, keyword) {
  const metaPath = getMetaPath(env, keyword);
  try {
    const raw = await fs.promises.readFile(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn(
        '[FullCollect][Meta] 读取采集任务元信息失败:',
        err.message || String(err),
      );
    }
    return null;
  }
}

async function initCollectState(keyword, env, targetCount) {
  const baseDir = getKeywordBaseDir(env, keyword);
  await fs.promises.mkdir(baseDir, { recursive: true });
  const statePath = path.join(baseDir, STATE_FILE_NAME);
  collectStateManager = new CollectStateManager(statePath, {
    keyword,
    env,
    target: targetCount,
  });
  collectState = await collectStateManager.load();
  console.log(
    `[State] resumeToken=${collectState.resumeToken} target=${collectState.global?.target}`,
  );
  return collectState;
}

function isPhase2ListOnlyMode() {
  if (!argv || typeof argv !== 'object') return false;
  return Boolean(
    argv.phase2ListOnly ||
      argv['phase2-list-only'] ||
      argv.listOnly ||
      argv['list-only'],
  );
}

function isFreshMode() {
  if (!argv || typeof argv !== 'object') return false;
  return Boolean(argv.fresh || argv.reset || argv['fresh-run'] || argv['reset-run']);
}

function getCollectState() {
  if (collectStateManager) {
    const latest = collectStateManager.getState();
    if (latest) {
      collectState = latest;
    }
  }
  return collectState;
}

function getCurrentStepState() {
  const state = getCollectState();
  return state?.currentStep || null;
}

function getCommentStateMap() {
  const state = getCollectState();
  const history = state?.history || {};
  const map = history.commentStates || {};
  return map;
}

async function updateCollectState(updater, label = '') {
  if (!collectStateManager) return null;
  const nextState = await collectStateManager.save(updater);
  collectState = nextState;
  if (label) {
    console.log(
      `[State] ${label} updatedAt=${new Date(nextState.lastUpdatedAt).toISOString()}`,
    );
  }
  return nextState;
}

async function setCurrentStepState(step, label = 'currentStep') {
  return updateCollectState((draft) => {
    draft.currentStep = step ? { ...step } : null;
    return draft;
  }, `set:${label}`);
}

function createListStepState({
  keyword,
  env,
  target,
  searchUrl = '',
  processedCount = 0,
  scrollRound = 0,
  pendingItems = [],
  activeItem = null,
  lastViewportCount = 0,
} = {}) {
  return {
    phase: 'list',
    keyword,
    env,
    target,
    searchUrl,
    processedCount,
    scrollRound,
    pendingItems,
    activeItem,
    lastViewportCount,
  };
}

async function resolveResumeContext(keyword, env, targetCount) {
  const metaPath = getMetaPath(env, keyword);
  let meta = null;
  try {
    const raw = await fs.promises.readFile(metaPath, 'utf8');
    meta = JSON.parse(raw);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn(
        '[FullCollect][Meta] 读取历史元信息失败:',
        err.message || String(err),
      );
    }
    return { enabled: false, completed: 0, reason: '无历史记录', meta: null };
  }

  const lastStatus = meta?.lastStatus || 'unknown';
  const parsedLastTarget = Number(meta?.lastTarget);
  const lastTarget = Number.isFinite(parsedLastTarget) && parsedLastTarget > 0 ? parsedLastTarget : null;
  const lastCompleted = Number(meta?.lastCompleted) || 0;
  const targetMatches =
    lastTarget === null || lastTarget === undefined || lastTarget === targetCount;
  const resumeEnabled = lastStatus === 'incomplete' && targetMatches;

  let reason;
  if (resumeEnabled) {
    reason = `上一轮 ${lastCompleted}/${lastTarget || targetCount} 未完成`;
  } else if (lastStatus === 'incomplete' && !targetMatches) {
    reason = `上一轮未完成但 target 变更 (last=${lastTarget}, current=${targetCount})`;
  } else {
    reason = `上一轮状态=${lastStatus}，无需续传`;
  }

  return {
    enabled: resumeEnabled,
    completed: resumeEnabled ? Math.min(lastCompleted, targetCount) : 0,
    reason,
    meta,
  };
}

async function persistSafeDetailIndexJsonl(
  safeUrlIndex,
  indexPath,
  env,
  keyword,
  { quiet = false } = {},
) {
  try {
    const lines = [];
    for (const entry of safeUrlIndex.values()) {
      const firstSeenAtMs =
        typeof entry.firstSeenAtMs === 'number' && Number.isFinite(entry.firstSeenAtMs)
          ? entry.firstSeenAtMs
          : Date.now();
      const firstSeenAtIso =
        typeof entry.firstSeenAtIso === 'string' && entry.firstSeenAtIso
          ? entry.firstSeenAtIso
          : new Date(firstSeenAtMs).toISOString();
      const lastUpdatedAtMs =
        typeof entry.lastUpdatedAtMs === 'number' && Number.isFinite(entry.lastUpdatedAtMs)
          ? entry.lastUpdatedAtMs
          : firstSeenAtMs;
      const lastUpdatedAtIso =
        typeof entry.lastUpdatedAtIso === 'string' && entry.lastUpdatedAtIso
          ? entry.lastUpdatedAtIso
          : new Date(lastUpdatedAtMs).toISOString();

      lines.push(
        JSON.stringify({
          platform: PLATFORM,
          env,
          keyword,
          noteId: entry.noteId,
          title: entry.title,
          safeDetailUrl: entry.safeDetailUrl,
          hasToken: entry.hasToken,
          containerId: entry.containerId || null,
          domIndex:
            typeof entry.domIndex === 'number' && Number.isFinite(entry.domIndex)
              ? entry.domIndex
              : null,
          header: entry.header || null,
          author: entry.author || null,
          firstSeenAtMs,
          firstSeenAtIso,
          lastUpdatedAtMs,
          lastUpdatedAtIso,
        }),
      );
    }

    const tmpPath = `${indexPath}.tmp`;
    await fs.promises.writeFile(
      tmpPath,
      lines.join('\n') + (lines.length ? '\n' : ''),
      'utf8',
    );
    await fs.promises.rename(tmpPath, indexPath);

    if (!quiet) {
      console.log(
        `\n[Phase2(ListOnly)] ✅ 已写入 ${safeUrlIndex.size} 条带 xsec_token 的详情链接到: ${indexPath}`,
      );
    }
  } catch (err) {
    console.warn(
      '[Phase2(ListOnly)] ⚠️ 写入 safe-detail-urls.jsonl 失败:',
      err?.message || String(err),
    );
  }
}

async function runPhase2ListOnly(keyword, targetCount, env, searchUrl = '') {
  console.log(
    '\n2️⃣ Phase2(ListOnly): 搜索结果列表 + 逐条打开详情（获取 xsec_token + 主体内容/图片/作者）...',
  );

  const stageOk = await ensureSearchStage(keyword, 3);
  if (!stageOk) {
    console.error(
      '[Phase2(ListOnly)] 当前页面不在搜索结果页，已尝试恢复失败，为避免在错误页面采集，终止本次列表采集',
    );
    return { count: 0 };
  }

  const canonicalSearchUrl = await getCurrentUrl().catch(() => '');
  const canonicalKeyword = normalizeKeywordForCompare(
    extractSearchKeywordFromUrl(canonicalSearchUrl) || keyword,
  );
  console.log(
    `[Phase2(ListOnly)] canonical keyword="${canonicalKeyword || keyword}" url=${canonicalSearchUrl || 'unknown'}`,
  );

  const baseDir = getKeywordBaseDir(env, keyword);
  const indexPath = getSafeDetailIndexPath(env, keyword);
  const failedDetailPath = path.join(baseDir, 'phase2-detail-failures.jsonl');
  await fs.promises.mkdir(baseDir, { recursive: true });

  const safeUrlIndex = new Map();
  const allListNoteIds = new Set();
  const failedDetailIndex = new Map();

  // 预加载已有 safe-detail-urls，避免对已完成的 note 重复打开详情
  try {
    const content = await fs.promises.readFile(indexPath, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const noteId = obj.noteId || '';
        const safeDetailUrl = obj.safeDetailUrl || obj.detailUrl || '';
        const hasToken =
          Boolean(obj.hasToken) ||
          (typeof safeDetailUrl === 'string' && safeDetailUrl.includes('xsec_token='));
        if (!noteId || !safeDetailUrl || !hasToken) continue;
        if (safeUrlIndex.has(noteId)) continue;
        const entry = {
          noteId,
          title: obj.title || '',
          safeDetailUrl,
          hasToken: true,
          containerId: obj.containerId || null,
          domIndex:
            typeof obj.domIndex === 'number' && Number.isFinite(obj.domIndex)
              ? obj.domIndex
              : null,
          // 保留可能存在的详情补充信息（例如作者/发布时间），供后续使用
          header: obj.header || null,
          author: obj.author || null,
        };
        const firstSeenAtMs =
          typeof obj.firstSeenAtMs === 'number' && Number.isFinite(obj.firstSeenAtMs)
            ? obj.firstSeenAtMs
            : Date.now();
        const firstSeenAtIso =
          typeof obj.firstSeenAtIso === 'string' && obj.firstSeenAtIso
            ? obj.firstSeenAtIso
            : new Date(firstSeenAtMs).toISOString();
        const lastUpdatedAtMs =
          typeof obj.lastUpdatedAtMs === 'number' && Number.isFinite(obj.lastUpdatedAtMs)
            ? obj.lastUpdatedAtMs
            : firstSeenAtMs;
        const lastUpdatedAtIso =
          typeof obj.lastUpdatedAtIso === 'string' && obj.lastUpdatedAtIso
            ? obj.lastUpdatedAtIso
            : new Date(lastUpdatedAtMs).toISOString();
        entry.firstSeenAtMs = firstSeenAtMs;
        entry.firstSeenAtIso = firstSeenAtIso;
        entry.lastUpdatedAtMs = lastUpdatedAtMs;
        entry.lastUpdatedAtIso = lastUpdatedAtIso;
        safeUrlIndex.set(noteId, entry);
      } catch {
        // ignore bad line
      }
    }
    if (safeUrlIndex.size > 0) {
      console.log(
        `[Phase2(ListOnly)] 预加载已有 safe-detail-urls 条目: ${safeUrlIndex.size}（将基于此继续补充）`,
      );
    }
  } catch {
    // index 不存在时从空开始
  }

  const alreadyCount = safeUrlIndex.size;
  if (alreadyCount >= targetCount) {
    console.log(
      `[Phase2(ListOnly)] 已有 safe-detail-urls 数量 ${alreadyCount} ≥ target=${targetCount}，跳过本轮新的详情打开，仅刷新状态文件`,
    );
  } else {
    console.log(
      `[Phase2(ListOnly)] 当前 safe-detail-urls 数量=${alreadyCount}，准备执行 CollectSearchListBlock + 逐条打开详情...`,
    );
  }

  // 仅在 safe-detail-urls 不足目标数量时：
  // 使用“视口驱动”的方式循环：
  // 1）每一轮只收集当前视口内的卡片（CollectSearchListBlock, maxScrollRounds=1，不滚动页面）；
  // 2）只对这一视口内的卡片逐条打开详情 → 提取正文/图片/作者 → 记录带 token 的 safeDetailUrl；
  // 3）视口内没有新的可处理卡片后，再使用系统滚动向下加载下一屏内容。
  let loopRound = 0;
  let noNewSafeRounds = 0;
  // Phase2：只搜索一次（ensureSearchStage 已处理好当前 search_result）
  if (safeUrlIndex.size < targetCount) {
    console.log('[Phase2(ListOnly)] 搜索阶段就绪，开始滚动采集循环（禁止重复搜索）');
    const timingPath = path.join(baseDir, 'phase2-timing.jsonl');
    const phase2StartAtMs = Date.now();
    while (safeUrlIndex.size < targetCount) {
      loopRound += 1;
      console.log(`\n[Phase2(ListOnly)][Loop] Round ${loopRound}, collected=${safeUrlIndex.size}/${targetCount}`);

      // Phase2 循环内：只允许 ESC/后退恢复，禁止再次触发 GoToSearch
      const currentUrl = await getCurrentUrl().catch(() => '');
      const currentStage = detectStageFromUrl(currentUrl);
      if (currentStage !== 'search') {
        console.warn(
          `[Phase2(ListOnly)] 当前不在搜索页（stage=${currentStage}），尝试恢复（禁止重复搜索）...`,
        );
        try {
          await ensureSearchStageOnlyGuarded(env, `phase2-list-loop-${loopRound}-recover`);
        } catch (err) {
          await captureDebugSnapshot(env, keyword, 'phase2_stage_drift_not_search', {
            stage: currentStage,
            url: currentUrl || '',
            error: err?.message || String(err),
          });
          throw err;
        }
      }

      // keyword 漂移检测：只允许后退恢复，禁止重新搜索
      if (canonicalKeyword) {
        const currentKw = normalizeKeywordForCompare(extractSearchKeywordFromUrl(currentUrl) || '');
        if (currentKw && currentKw !== canonicalKeyword) {
          const recovered = await tryRecoverSearchKeywordDrift(canonicalKeyword, { maxTries: 6 });
          if (!recovered.ok) {
            await captureDebugSnapshot(env, keyword, 'phase2_keyword_drift', {
              canonicalKeyword,
              currentKeyword: currentKw,
              finalKeyword: recovered.finalKw || '',
              finalUrl: recovered.finalUrl || currentUrl || '',
            });
            throw new Error('phase2_keyword_drift');
          }
        }
      }

      const listResult = await collectSearchList({
        sessionId: PROFILE,
        // 当前视口内一般不超过 30 条，适当放大一点即可
        targetCount: 60,
        // 禁止 Block 内部滚动，只采集当前视口
        maxScrollRounds: 1,
      });

      if (!listResult.success || !Array.isArray(listResult.items)) {
        console.error(
          `[Phase2(ListOnly)] ❌ CollectSearchList 失败: success=${listResult.success}, error=${listResult.error}`,
        );
        break;
      }

      if (!listResult.items.length) {
        console.warn('[Phase2(ListOnly)] ⚠️ 当前视口无可见 note-item，停止本次 Phase2');
        break;
      }

      console.log(
        `   ✅ CollectSearchList 返回条目: ${listResult.items.length}（当前 safe-detail-urls=${safeUrlIndex.size}/${targetCount}）`,
      );

      const scrollState = await getSearchScrollState().catch(() => null);
      const viewport = scrollState?.viewport || { w: 0, h: 0 };
      const viewportH = Number(viewport?.h || 0) || 0;

      let newlyAdded = 0;

      for (const item of listResult.items) {
        const rawNoteId = item.noteId;
        const itemStartAtMs = Date.now();
        if (!rawNoteId) continue;

        allListNoteIds.add(rawNoteId);

        if (failedDetailIndex.has(rawNoteId)) {
          console.log(
            `\n📝 Note (跳过已标记失败): noteId=${rawNoteId} (${item.title || '无标题'})`,
          );
          continue;
        }

        if (safeUrlIndex.has(rawNoteId)) {
          console.log(
            `\n📝 Note (跳过重复): noteId=${rawNoteId} (${item.title || '无标题'})`,
          );
          continue;
        }
        if (safeUrlIndex.size >= targetCount) break;

        const domIndex =
          typeof item.raw?.index === 'number' && Number.isFinite(item.raw.index)
            ? item.raw.index
            : typeof item.domIndex === 'number' && Number.isFinite(item.domIndex)
              ? item.domIndex
              : null;

        console.log(
          `\n[Phase2(ListOnly)] NoteListItem #${safeUrlIndex.size + 1}/${targetCount}: ${
            item.title || '无标题'
          } (${rawNoteId})`,
        );

        // Phase2 仅负责“点开一次获取 safeDetailUrl + 主体内容”，不做评论滚动；
        // SearchGate 也只在 Phase3/4 对真正的「爬详情+评论」做限速，这里不节流。

        const rect = item.raw?.rect || null;
        if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number') {
          console.warn(
            `   ⚠️ 当前条目缺少 rect（非视口内卡片或采集异常），跳过 noteId=${rawNoteId}`,
          );
          continue;
        }

        const safeTop = 140;
        const safeBottom = 80;
        if (viewportH && rect.y < safeTop) {
          console.warn(
            `   ⚠️ 卡片过靠近顶部（rect.y=${Math.round(rect.y)} < ${safeTop}），为避免误点/风控，跳过 noteId=${rawNoteId}`,
          );
          continue;
        }
        if (viewportH && rect.y + rect.height > viewportH) {
          console.warn(
            `   ⚠️ 卡片底部超出视口（rect.bottom=${Math.round(rect.y + rect.height)} > ${viewportH}），跳过 noteId=${rawNoteId}`,
          );
          continue;
        }

        const rawClickPoint = {
          x: rect.x + rect.width / 2,
          y: rect.y + Math.min(rect.height * 0.35, Math.max(rect.height - 24, 24)),
        };
        const clickPoint = normalizeClickablePoint(rawClickPoint, viewport, { safeTop, safeBottom });

        let safeDetailUrl = '';
        let openedNoteId = '';

        try {
          await systemClickAt(clickPoint);
          await delay(1800 + Math.random() * 900);
          const ready = await waitForDetailReady(12);
          if (!ready.ready) {
            throw new Error('detail_not_ready_after_system_click');
          }
          safeDetailUrl = ready.safeUrl || '';
          openedNoteId = ready.noteId || '';
          console.log(
            '[Phase2(ListOnly)][Anchor:SystemClick]',
            JSON.stringify({ clickPoint, listItemRect: rect }),
          );
        } catch (e) {
          const errorMsg = e?.message || String(e);
          console.error(`   ❌ 系统点击后未进入详情: ${errorMsg}`);
          await captureDebugSnapshot(env, keyword, 'phase2_openDetail_failed', {
            noteId: rawNoteId,
            title: item.title || '无标题',
            error: errorMsg,
            clickPoint,
            rect,
          });

          const currentAfterClick = await getCurrentUrl().catch(() => '');
          const stillOnSearchPage =
            typeof currentAfterClick === 'string' &&
            currentAfterClick.includes('/search_result');

          failedDetailIndex.set(rawNoteId, {
            noteId: rawNoteId,
            title: item.title || '无标题',
            error: errorMsg,
            stageUrl: currentAfterClick || '',
            containerId: item.containerId || null,
            domIndex:
              typeof domIndex === 'number' && Number.isFinite(domIndex) ? domIndex : null,
          });

          if (stillOnSearchPage) {
            console.warn(
              '   ⚠️ 点击后仍停留在搜索结果页，视为“搜索跳转卡片/点击无效”，跳过该条 note',
            );
            try {
              await ensureSearchStageOnlyGuarded(env, `phase2-open-detail-skip-${loopRound}`);
            } catch (guardErr) {
              console.warn(
                '[Phase2(ListOnly)] ensureSearchStageOnlyGuarded 在点击失败后校验失败:',
                guardErr?.message || String(guardErr),
              );
            }

            if (canonicalKeyword) {
              const recovered = await tryRecoverSearchKeywordDrift(canonicalKeyword, { maxTries: 6 });
              if (!recovered.ok) {
                await captureDebugSnapshot(env, keyword, 'phase2_keyword_drift_after_click_fail', {
                  canonicalKeyword,
                  finalKeyword: recovered.finalKw || '',
                  finalUrl: recovered.finalUrl || currentAfterClick || '',
                  noteId: rawNoteId,
                });
                throw new Error('phase2_keyword_drift');
              }
            }

            continue;
          }

          throw new Error('phase2_open_detail_not_ready');
        }

        let currentAfterOpen = '';
        // 兜底：如果未拿到 safeDetailUrl，则从当前 URL 中抽取（此时应处于详情页）
        if (!safeDetailUrl) {
          const urlAfterOpen = await getCurrentUrl().catch(() => '');
          if (typeof urlAfterOpen === 'string') {
            currentAfterOpen = urlAfterOpen;
            safeDetailUrl = urlAfterOpen;
          }
        } else {
          currentAfterOpen = safeDetailUrl;
        }

        const hasToken =
          typeof safeDetailUrl === 'string' && safeDetailUrl.includes('xsec_token=');

        // 从详情页提取正文 + 图片 + 作者等信息（Phase2 需落盘基础信息，Phase3/4 再增量落盘评论）
        let detailData = null;
        const detailRes = await extractDetail({
          sessionId: PROFILE,
        }).catch((e) => ({
          success: false,
          detail: {},
          error: e.message || String(e),
          anchor: null,
        }));

        if (!detailRes.success) {
          console.warn(
            `   ⚠️ ExtractDetailBlock 失败（Phase2 仅记录 URL，不阻塞后续评论采集）: ${detailRes.error}`,
          );
        } else {
          detailData = detailRes.detail || {};
          console.log(
            `   ✅ 详情提取成功，包含字段: ${Object.keys(detailData).join(', ')}`,
          );
        }

        // 归一化 noteId：优先使用详情页识别出的 noteId（URL），其次为列表 noteId
        let finalNoteId = openedNoteId || rawNoteId;
        if (!finalNoteId && typeof safeDetailUrl === 'string') {
          const match = safeDetailUrl.match(/\/explore\/([^/?#]+)/);
          if (match && match[1]) finalNoteId = match[1];
        }
        if (!finalNoteId) finalNoteId = rawNoteId;

        // 调试阶段：如果当前详情 URL 中未检测到 xsec_token，则停在详情页，交给人工检查
        if (!hasToken) {
          console.error(
            `   ❌ 当前详情 URL 中未检测到 xsec_token，noteId=${finalNoteId}，url=${
              safeDetailUrl || currentAfterOpen || 'unknown'
            }`,
          );
          console.error(
            '   已停留在当前详情页，请在浏览器中检查 URL / DOM / 登录态后再重新运行脚本（Phase2 将不再继续后续条目）',
          );
          // 故意不做 ESC 恢复，保留当前详情页供手动排查
          throw new Error('detail_without_xsec_token');
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const existing = safeUrlIndex.get(finalNoteId);
        const firstSeenAtMs =
          existing && typeof existing.firstSeenAtMs === 'number' && Number.isFinite(existing.firstSeenAtMs)
            ? existing.firstSeenAtMs
            : nowMs;
        const firstSeenAtIso =
          existing && typeof existing.firstSeenAtIso === 'string' && existing.firstSeenAtIso
            ? existing.firstSeenAtIso
            : new Date(firstSeenAtMs).toISOString();
        const lastUpdatedAtMs = nowMs;
        const lastUpdatedAtIso = nowIso;
        safeUrlIndex.set(finalNoteId, {
          noteId: finalNoteId,
          title: item.title || detailData?.header?.title || '',
          safeDetailUrl: safeDetailUrl || '',
          hasToken,
          containerId: item.containerId || null,
          domIndex,
          header: detailData?.header || null,
          author: detailData?.header?.author || null,
          firstSeenAtMs,
          firstSeenAtIso,
          lastUpdatedAtMs,
          lastUpdatedAtIso,
        });
        newlyAdded += 1;
        await appendSafeDetailIndexLine(indexPath, env, keyword, safeUrlIndex.get(finalNoteId));

        // Phase2 落盘基础信息（正文/图片/作者等），不写评论；Phase3/4 再增量写 comments.md
        try {
          const persistRes = await persistXhsNote({
            sessionId: PROFILE,
            env,
            platform: PLATFORM,
            keyword,
            noteId: finalNoteId,
            detailUrl: safeDetailUrl,
            detail: detailData || {},
            commentsResult: null,
            persistMode: 'detail',
          });
          if (!persistRes.success) {
            console.warn(
              `   ⚠️ Phase2 PersistXhsNote(detail) 失败 noteId=${finalNoteId}: ${persistRes.error}`,
            );
          }
        } catch (err) {
          console.warn(
            `   ⚠️ Phase2 PersistXhsNote(detail) 异常 noteId=${finalNoteId}: ${err?.message || String(err)}`,
          );
        }

        // 每处理完一个详情，尝试通过 ESC 恢复到搜索列表，以便继续处理下一条
        const recovery = await errorRecovery({
          sessionId: PROFILE,
          fromStage: 'detail',
          targetStage: 'search',
          serviceUrl: UNIFIED_API,
          maxRetries: 2,
          recoveryMode: 'esc',
        }).catch((e) => ({
          success: false,
          recovered: false,
          error: e.message || String(e),
        }));

        if (!recovery.success || !recovery.recovered) {
          console.warn(
            `   ⚠️ 通过 ESC 从详情页恢复到搜索列表失败（Phase2 禁止重复搜索，将直接终止）: ${
              recovery.error || 'unknown'
            }`,
          );
          await captureDebugSnapshot(env, keyword, 'phase2_recovery_failed', {
            noteId: finalNoteId,
            error: recovery.error || 'unknown',
          });
          throw new Error('phase2_recovery_failed');
        } else {
          console.log(
            `   ✅ 通过 ESC 恢复到搜索列表: finalStage=${recovery.finalStage}, method=${
              recovery.method || 'esc'
            }`,
          );
          // 详情 → 搜索恢复后，再做一次阶段守卫（禁止 GoToSearch）
          try {
            await ensureSearchStageOnlyGuarded(
              env,
              `phase2-list-loop-${loopRound}-after-detail-recovery`,
            );
          } catch (err) {
            await captureDebugSnapshot(env, keyword, 'phase2_recovery_guard_failed', {
              noteId: finalNoteId,
              error: err?.message || String(err),
            });
            throw err;
          }
        }

        // timing（每条详情：从“准备点击”到“恢复回搜索页”）
        try {
          const durationMs = Date.now() - itemStartAtMs;
          const line = JSON.stringify({
            ts: new Date().toISOString(),
            keyword,
            env,
            loopRound,
            noteId: finalNoteId,
            durationMs,
            collected: safeUrlIndex.size,
            target: targetCount,
          });
          await fs.promises.appendFile(timingPath, `${line}\n`, 'utf8');
        } catch {
          // ignore
        }

        if (safeUrlIndex.size >= targetCount) break;
      }

      console.log(
        `   💾 本轮新增 safe-detail-urls 条目: ${newlyAdded}，累计=${safeUrlIndex.size}/${targetCount}`,
      );

      if (newlyAdded === 0) {
        noNewSafeRounds += 1;
        console.log(
          `   ⚠️ 本轮未新增任何 safe-detail-urls（连续无新增轮次=${noNewSafeRounds}）`,
        );
      } else {
        noNewSafeRounds = 0;
      }

      if (safeUrlIndex.size >= targetCount) {
        break;
      }

      // 每一轮列表采集结束后，增量持久化 safe-detail-urls 索引 + 当前列表步骤状态，支持中断续传
      try {
        await persistSafeDetailIndexJsonl(safeUrlIndex, indexPath, env, keyword, {
          quiet: true,
        });
      } catch {
        // 中途持久化失败不阻断流程，最终总结阶段还有一次总写入
      }

      try {
        await updateCollectState((draft) => {
          draft.currentStep = createListStepState({
            keyword,
            env,
            target: targetCount,
            searchUrl: canonicalSearchUrl || searchUrl || draft.currentStep?.searchUrl || '',
            processedCount: safeUrlIndex.size,
            scrollRound: loopRound,
            pendingItems: [],
            activeItem: null,
            lastViewportCount: Array.isArray(listResult.items)
              ? listResult.items.length
              : 0,
          });
          draft.history = draft.history || {};
          draft.history.safeDetailIndexSize = safeUrlIndex.size;
          return draft;
        }, `phase2-list-loop-${loopRound}`);
      } catch (err) {
        console.warn(
          '[Phase2(ListOnly)][State] ⚠️ 更新列表步骤状态失败:',
          err?.message || String(err),
        );
      }

      // 当前视口内没有任何新增（要么都已经采过，要么全部点击失败），再向下滚动一屏；
      // 如果已经连续多轮都没有新增，则认为当前搜索结果已耗尽，提前结束 Phase2(ListOnly)。
      if (newlyAdded === 0) {
        console.log(
          '   ⚠️ 当前视口内没有新增 safe-detail-urls，尝试向下滚动一屏加载新内容...',
        );

        if (noNewSafeRounds >= 5) {
          console.warn(
            `   ⚠️ 连续 ${noNewSafeRounds} 轮均未新增 safe-detail-urls，认为当前搜索结果已耗尽，提前结束 Phase2(ListOnly)`,
          );
          break;
        }
      }

      const scrolled = await scrollSearchPage('down', keyword);
      if (!scrolled) {
        console.warn(
          '   ⚠️ 系统滚动失败或已到底，停止 Phase2(ListOnly) further loops',
        );
        break;
      }
      // 滚动后等待内容稳定，避免重复抓取同一视口
      await delay(1100 + Math.random() * 800);
    }

    // timing summary
    try {
      const elapsedMs = Date.now() - phase2StartAtMs;
      const summary = JSON.stringify({
        ts: new Date().toISOString(),
        keyword,
        env,
        type: 'phase2_summary',
        elapsedMs,
        collected: safeUrlIndex.size,
        target: targetCount,
      });
      await fs.promises.appendFile(timingPath, `${summary}\n`, 'utf8');
    } catch {
      // ignore
    }
  }

  // 写入 safe-detail-urls.jsonl（覆盖式写入，保持 JSONL 结构）
  await persistSafeDetailIndexJsonl(safeUrlIndex, indexPath, env, keyword, {
    quiet: false,
  });

  // 写入本轮失败的详情打开记录，便于后续人工排查 / 调参
  try {
    if (failedDetailIndex.size > 0) {
      const lines = [];
      for (const entry of failedDetailIndex.values()) {
        lines.push(
          JSON.stringify({
            platform: PLATFORM,
            env,
            keyword,
            noteId: entry.noteId,
            title: entry.title,
            error: entry.error,
            stageUrl: entry.stageUrl || '',
            containerId: entry.containerId || null,
            domIndex:
              typeof entry.domIndex === 'number' && Number.isFinite(entry.domIndex)
                ? entry.domIndex
                : null,
          }),
        );
      }
      await fs.promises.writeFile(
        failedDetailPath,
        lines.join('\n') + (lines.length ? '\n' : ''),
        'utf8',
      );
      console.log(
        `[Phase2(ListOnly)] ⚠️ 本轮共有 ${failedDetailIndex.size} 条 note 打开详情失败，已写入: ${failedDetailPath}`,
      );
    } else {
      try {
        await fs.promises.rm(failedDetailPath, { force: true });
      } catch {
        // ignore
      }
      console.log('[Phase2(ListOnly)] 本轮未记录到任何详情打开失败的 note（已清理旧的 failures 文件）');
    }
  } catch (err) {
    console.warn(
      '[Phase2(ListOnly)] ⚠️ 写入 phase2-detail-failures.jsonl 失败:',
      err?.message || String(err),
    );
  }

  // 更新 meta 与 state，供后续续传/Phase3 使用
  try {
    const status = safeUrlIndex.size >= targetCount ? 'completed' : 'incomplete';
    const meta = {
      lastRunAt: Date.now(),
      lastTarget: targetCount,
      lastCompleted: safeUrlIndex.size,
      lastStatus: status,
    };
    await fs.promises.mkdir(baseDir, { recursive: true });
    const metaPath = getMetaPath(env, keyword);
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    console.log(
      `[Phase2(ListOnly)][Meta] 已更新采集任务元信息: lastStatus=${status}, lastTarget=${targetCount}, lastCompleted=${safeUrlIndex.size}`,
    );

    await updateCollectState((draft) => {
      draft.currentStep = createListStepState({
        keyword,
        env,
        target: targetCount,
        searchUrl: canonicalSearchUrl || searchUrl || draft.currentStep?.searchUrl || '',
        processedCount: safeUrlIndex.size,
        scrollRound: loopRound,
        pendingItems: [],
        activeItem: null,
        lastViewportCount: 0,
      });
      draft.history = draft.history || {};
      draft.history.safeDetailIndexSize = safeUrlIndex.size;
      return draft;
    }, 'phase2-list-only');
  } catch (err) {
    console.warn(
      '[Phase2(ListOnly)][Meta] ⚠️ 更新 state/meta 失败:',
      err?.message || String(err),
    );
  }

  console.log(
    `\n[Phase2(ListOnly)] 总结：safe-detail-urls=${safeUrlIndex.size} / target=${targetCount}（loopRound=${loopRound}）`,
  );

  if (safeUrlIndex.size < targetCount) {
    console.error(
      `[Phase2(ListOnly)] ❌ 目标 safe-detail-urls 数量未达成: target=${targetCount}, actual=${safeUrlIndex.size}`,
    );
    throw new Error('phase2_safe_detail_target_not_reached');
  }

  return {
    count: safeUrlIndex.size,
  };
}

async function loadSafeDetailEntries(keyword, env) {
  const indexPath = getSafeDetailIndexPath(env, keyword);
  const entries = [];
  const seen = new Set();
  try {
    const content = await fs.promises.readFile(indexPath, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const noteId = obj.noteId || '';
        const rawUrl = obj.safeDetailUrl || obj.detailUrl || '';
        if (!noteId) continue;
        if (seen.has(noteId)) continue;
        seen.add(noteId);

        const hasToken =
          Boolean(obj.hasToken) ||
          (typeof rawUrl === 'string' && rawUrl.includes('xsec_token='));

        entries.push({
          noteId,
          title: obj.title || '',
          // 对于尚未带 token 的链接，safeDetailUrl 先记录原始 href，后续通过点击进入详情再获取真正带 token 的 URL
          safeDetailUrl: rawUrl || '',
          hasToken,
          containerId: obj.containerId || null,
          domIndex:
            typeof obj.domIndex === 'number' && Number.isFinite(obj.domIndex)
              ? obj.domIndex
              : null,
        });
      } catch {
        // 忽略坏行
      }
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn(
        '[FullCollect][SafeDetailIndex] 读取 safe-detail-urls 失败:',
        err.message || String(err),
      );
    }
  }
  return entries;
}

async function gotoSafeDetailUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const payload = await browserServiceCommand('goto', {
      profileId: PROFILE,
      url,
    });
    if (payload && payload.ok === false) {
      console.warn('[FullCollect][Goto] browser-service 返回错误:', payload.error);
      return false;
    }
    console.log(`[FullCollect][Goto] 已通过 BrowserService.goto 打开详情页: ${url}`);
    // 给页面一点时间完成导航
    await delay(2500 + Math.random() * 1500);
    return true;
  } catch (err) {
    console.error(
      '[FullCollect][Goto] 调用 BrowserService.goto 失败:',
      err?.message || err,
    );
    return false;
  }
}

async function runPhase3And4FromIndex(keyword, targetCount, env) {
  console.log('\n3️⃣ Phase3-4: 基于 safe-detail-urls.jsonl 的详情 + 评论采集（4 帖接力，多轮增量）...');

  const baseDir = getKeywordBaseDir(env, keyword);
  const safeEntries = await loadSafeDetailEntries(keyword, env);
  if (!Array.isArray(safeEntries) || safeEntries.length === 0) {
    console.warn(
      `[FullCollect] 未找到 safe-detail-urls.jsonl 或其中没有有效条目，无法执行 Phase3-4（keyword=${keyword}）`,
    );
    return;
  }

  // 1. 磁盘级去重：已有目录的一律视为已完成 note，当前轮不再处理
  const seenNoteIds = new Set();
  try {
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const noteId = dirent.name;
      const contentPath = path.join(baseDir, noteId, 'content.md');
      const stat = await fs.promises.stat(contentPath).catch(() => null);
      if (stat && stat.isFile()) {
        seenNoteIds.add(noteId);
      }
    }
    if (seenNoteIds.size > 0) {
      console.log(
        `[FullCollect][Resume] 检测到已落盘的 note 数量: ${seenNoteIds.size}（将跳过这些 note 的详情/评论采集）`,
      );
    }
  } catch {
    // ignore
  }

  // 2. 构造候选 note 列表（仅未落盘的 note）
  const candidates = [];
  for (const entry of safeEntries) {
    const noteId = entry.noteId || '';
    if (!noteId) continue;
    if (seenNoteIds.has(noteId)) {
      console.log(
        `\n📝 NoteFromIndex (跳过已落盘): noteId=${noteId} (${entry.title || '无标题'})`,
      );
      continue;
    }
    candidates.push(entry);
  }

  if (candidates.length === 0) {
    console.log(
      '[FullCollect] Phase3-4 退出：safe-detail-urls 中的 note 已全部落盘，无需再次采集评论',
    );
    return;
  }

  const maxNotesToProcess = Math.min(targetCount, candidates.length);
  const commentStateMap = getCommentStateMap();

  // 每个 note 的增量采集状态
  const noteStates = new Map();

  for (let i = 0; i < candidates.length && i < maxNotesToProcess; i += 1) {
    const entry = candidates[i];
    const noteId = entry.noteId;
    const prevState = commentStateMap[noteId] || { totalSeen: 0, lastPair: null };
    noteStates.set(noteId, {
      entry,
      noteId,
      rounds: 0,
      done: false,
      headerTotal: null,
      totalSeen: Number(prevState.totalSeen) || 0,
      lastPair: prevState.lastPair || null,
      collectedComments: [],
      lastDetailUrl: '',
      detailFetched: false,
      detailData: null,
    });
  }

  const noteIds = Array.from(noteStates.keys());
  if (noteIds.length === 0) {
    console.log(
      '[FullCollect] Phase3-4 退出：候选 note 数量为 0（可能全部已落盘或 target 过小）',
    );
    return;
  }

  const MAX_GROUP_SIZE = 4;
  const MAX_NEW_COMMENTS_PER_ROUND = 100;
  const MAX_ROUNDS_PER_NOTE = 10;

  function buildCommentKey(c) {
    if (!c || typeof c !== 'object') return '';
    const userId = c.user_id || c.userId || '';
    const userName = c.user_name || c.userName || c.nickname || '';
    const text = (c.text || c.content || '').toString();
    const ts = c.timestamp || c.time || '';
    return `${userId}||${userName}||${text.substring(0, 64)}||${ts}`;
  }

  function computeNewCommentsForRound(allComments, prevLastPair, maxNew) {
    const arr = Array.isArray(allComments) ? allComments : [];
    if (arr.length === 0) {
      return { used: [], newPair: prevLastPair || null, totalNew: 0 };
    }

    let startIndex = 0;
    if (prevLastPair && (prevLastPair.key1 || prevLastPair.key2)) {
      const key1 = prevLastPair.key1 || '';
      const key2 = prevLastPair.key2 || '';
      for (let i = 0; i < arr.length; i += 1) {
        const k2 = buildCommentKey(arr[i]);
        if (!k2 || k2 !== key2) continue;
        if (key1) {
          const prev = i > 0 ? buildCommentKey(arr[i - 1]) : '';
          if (prev !== key1) continue;
        }
        startIndex = i + 1;
        break;
      }
    }

    const allNew = arr.slice(startIndex);
    if (allNew.length === 0) {
      return { used: [], newPair: prevLastPair || null, totalNew: 0 };
    }

    const limit = typeof maxNew === 'number' && maxNew > 0 ? maxNew : allNew.length;
    const used = allNew.slice(0, limit);

    let newPair = prevLastPair || null;
    if (used.length >= 2) {
      const c1 = used[used.length - 2];
      const c2 = used[used.length - 1];
      newPair = {
        key1: buildCommentKey(c1),
        key2: buildCommentKey(c2),
        preview1: ((c1 && (c1.text || c1.content || '')) || '')
          .toString()
          .substring(0, 80),
        preview2: ((c2 && (c2.text || c2.content || '')) || '')
          .toString()
          .substring(0, 80),
      };
    }

    return { used, newPair, totalNew: allNew.length };
  }

  let completedNotes = 0;
  let riskDetectionCount = 0;
  let roundIndex = 1;

  console.log(
    `[FullCollect] Phase3-4 计划处理 note 数量=${maxNotesToProcess}（候选=${candidates.length}, 已落盘=${seenNoteIds.size}）`,
  );

  while (completedNotes < maxNotesToProcess) {
    let roundNewComments = 0;
    let riskStop = false;

    console.log(
      `\n[FullCollect][Group] Round ${roundIndex} 开始，已完成 note=${completedNotes}/${maxNotesToProcess}`,
    );

    for (let gStart = 0; gStart < noteIds.length && !riskStop; gStart += MAX_GROUP_SIZE) {
      const group = noteIds.slice(gStart, gStart + MAX_GROUP_SIZE);
      if (!group.length) break;

      console.log(
        `[FullCollect][Group] Round ${roundIndex} Group ${
          Math.floor(gStart / MAX_GROUP_SIZE) + 1
        }，noteIds=${group.join(', ')}`,
      );

      for (const noteId of group) {
        const state = noteStates.get(noteId);
        if (!state || state.done) continue;
        if (completedNotes >= maxNotesToProcess) break;

        const displayIndex = completedNotes + 1;
        console.log(
          `\n📝 NoteFromIndex[Round${roundIndex}] #${displayIndex}/${maxNotesToProcess}: ${
            state.entry.title || '无标题'
          } (${noteId})`,
        );

        // 访问频率控制：通过 SearchGate 作为统一的节流入口
        const gateKey = `${PROFILE}:detail`;
        const permit = await requestGatePermit(gateKey, {
          windowMs: DEFAULT_WINDOW_MS,
          maxCount: DEFAULT_MAX_COUNT,
        }).catch(() => ({ ok: false, allowed: true, waitMs: 0 }));

        if (permit && permit.allowed === false) {
          const waitMs = Math.max(permit.waitMs || 0, 1000);
          console.log(
            `[FullCollect][Gate] 详情访问触发节流，等待 ${waitMs}ms 后继续（key=${gateKey}）`,
          );
          await delay(waitMs + Math.random() * 500);
        }

        let okGoto = false;

        if (state.entry.hasToken && state.entry.safeDetailUrl) {
          // 已有带 token 的安全链接，直接通过 BrowserService.goto 打开
          okGoto = await gotoSafeDetailUrl(state.entry.safeDetailUrl);
        } else {
          // 当前 search 结果中的 href 不带 token：通过搜索页点击卡片进入详情，再从 location.href 中获取带 token 的 URL
          console.log(
            '   ℹ️ 当前 safeDetailUrl 不带 token，将通过搜索结果卡片点击进入详情获取带 token URL...',
          );

          const stageOk = await ensureSearchStage(keyword, 3);
          if (!stageOk) {
            console.warn(
              '   ⚠️ ensureSearchStage 失败，无法安全回到搜索结果页，跳过本轮该 note',
            );
          } else if (!state.entry.containerId) {
            console.warn(
              '   ⚠️ 缺少 containerId，无法在搜索结果页定位该 note 卡片，跳过本轮该 note',
            );
          } else {
            const openResult = await openDetail({
              sessionId: PROFILE,
              containerId: state.entry.containerId,
              domIndex:
                typeof state.entry.domIndex === 'number' &&
                Number.isFinite(state.entry.domIndex)
                  ? state.entry.domIndex
                  : undefined,
            }).catch((e) => ({
              success: false,
              detailReady: false,
              error: e.message || String(e),
              anchor: null,
            }));

            if (!openResult.success || !openResult.detailReady) {
              console.error(
                `   ❌ 通过卡片点击打开详情失败: ${openResult.error || 'detail not ready'}`,
              );
              console.log(
                '[FullCollect][Anchor:OpenDetailFromIndex]',
                JSON.stringify(openResult.anchor || null),
              );
            } else {
              console.log(
                '[FullCollect][Anchor:OpenDetailFromIndex]',
                JSON.stringify(openResult.anchor || null),
              );
              okGoto = true;

              // 从当前 URL 中抽取真正带 token 的 safeDetailUrl，并写回 state.entry 供后续轮次复用
              const currentAfterOpen = await getCurrentUrl();
              if (typeof currentAfterOpen === 'string') {
                const hasTokenInUrl = currentAfterOpen.includes('xsec_token=');
                if (hasTokenInUrl) {
                  state.entry.safeDetailUrl = currentAfterOpen;
                  state.entry.hasToken = true;
                  console.log(
                    `   ✅ 已从详情页获取带 token 的 safeDetailUrl: ${currentAfterOpen}`,
                  );
                } else {
                  console.warn(
                    '   ⚠️ 通过点击进入详情后仍未在 URL 中发现 xsec_token，后续轮次将继续走卡片点击路径',
                  );
                }
              }
            }
          }
        }

        if (!okGoto) {
          console.warn('   ⚠️ 打开详情页失败，跳过本轮该 note');
          state.rounds += 1;
          if (state.rounds >= MAX_ROUNDS_PER_NOTE) {
            console.warn(
              `   ⚠️ noteId=${noteId} 多次打开失败，标记为完成以避免死循环`,
            );
            state.done = true;
            completedNotes += 1;
          }
          continue;
        }

        const currentUrl = await getCurrentUrl();
        state.lastDetailUrl = typeof currentUrl === 'string' ? currentUrl : '';

        // 3️⃣ Phase3: 首次访问时提取详情正文与图片
        if (!state.detailFetched) {
          console.log('3️⃣ Phase3: 提取详情正文与图片...');
          const detailRes = await extractDetail({
            sessionId: PROFILE,
          }).catch((e) => ({
            success: false,
            detail: {},
            error: e.message || String(e),
          }));

          if (!detailRes.success) {
            console.warn(
              `   ⚠️ ExtractDetailBlock 失败（不阻塞评论采集）: ${detailRes.error}`,
            );
          } else {
            state.detailData = detailRes.detail || {};
            console.log(
              `   ✅ 详情提取成功，包含字段: ${Object.keys(state.detailData).join(', ')}`,
            );
          }
          state.detailFetched = true;
        }

        const riskDetected = await detectRiskControl();
        if (riskDetected) {
          console.warn('   🚨 当前详情命中了风控页面，停止本轮采集以避免加重风控');
          riskDetectionCount += 1;
          riskStop = true;
          break;
        }

        console.log('4️⃣ Phase4: 预热并采集评论（增量模式）...');
        const commentsResult = await collectComments({
          sessionId: PROFILE,
          maxWarmupRounds: 12,
        }).catch((e) => ({
          success: false,
          comments: [],
          reachedEnd: false,
          emptyState: false,
          warmupCount: 0,
          totalFromHeader: null,
          error: e.message || String(e),
          anchor: null,
        }));

        if (!commentsResult.success) {
          console.error(`❌ 评论采集失败: ${commentsResult.error}`);
          console.log(
            '[FullCollect][Anchor:CollectComments]',
            JSON.stringify(commentsResult.anchor || null),
          );
          state.rounds += 1;
          if (state.rounds >= MAX_ROUNDS_PER_NOTE) {
            console.warn(
              `   ⚠️ noteId=${noteId} 多次评论采集失败，标记为完成以避免死循环`,
            );
            state.done = true;
            completedNotes += 1;
          }
          continue;
        }

        console.log(
          '[FullCollect][Anchor:CollectComments]',
          JSON.stringify(commentsResult.anchor || null),
        );
        console.log(
          `   ✅ 本轮评论总数（页面上）: ${
            Array.isArray(commentsResult.comments) ? commentsResult.comments.length : 0
          } reachedEnd=${commentsResult.reachedEnd} emptyState=${commentsResult.emptyState}`,
        );

        const allComments = Array.isArray(commentsResult.comments)
          ? commentsResult.comments
          : [];
        const diff = computeNewCommentsForRound(
          allComments,
          state.lastPair,
          MAX_NEW_COMMENTS_PER_ROUND,
        );

        const used = diff.used;
        state.rounds += 1;
        state.headerTotal =
          typeof commentsResult.totalFromHeader === 'number' &&
          commentsResult.totalFromHeader > 0
            ? commentsResult.totalFromHeader
            : state.headerTotal;

        if (used.length > 0) {
          state.collectedComments.push(...used);
          state.totalSeen += used.length;
          roundNewComments += used.length;
          console.log(
            `   [Note ${noteId}] 本轮新增评论=${used.length}，累计=${state.collectedComments.length}`,
          );
        } else {
          console.log(
            `   [Note ${noteId}] 本轮未发现新的评论（totalNew=${diff.totalNew}）`,
          );
        }

        state.lastPair = diff.newPair;

        // 更新全局 commentState（用于后续脚本续传）
        try {
          await updateCollectState((draft) => {
            draft.history = draft.history || {};
            draft.history.commentStates = draft.history.commentStates || {};
            draft.history.commentStates[noteId] = {
              noteId,
              totalSeen: state.totalSeen,
              lastPair: state.lastPair,
              updatedAt: Date.now(),
            };
            return draft;
          }, `comment-state:${noteId}`);
        } catch (err) {
          console.warn(
            `[FullCollect][CommentState] 更新评论状态失败 noteId=${noteId}:`,
            err?.message || String(err),
          );
        }

        const reachedEndByHeader =
          typeof state.headerTotal === 'number' &&
          state.headerTotal > 0 &&
          allComments.length >= state.headerTotal;
        const noMoreNew = diff.totalNew === 0;
        const exhaustedRounds = state.rounds >= MAX_ROUNDS_PER_NOTE;

        const noteDone = reachedEndByHeader || noMoreNew || exhaustedRounds;

        if (noteDone) {
          state.done = true;
          completedNotes += 1;

          const aggregatedResult = {
            success: true,
            comments: state.collectedComments,
            reachedEnd: reachedEndByHeader || commentsResult.reachedEnd || noMoreNew,
            emptyState: state.collectedComments.length === 0,
            warmupCount: commentsResult.warmupCount ?? 0,
            totalFromHeader: state.headerTotal ?? commentsResult.totalFromHeader ?? null,
          };

          const finalNoteId =
            (typeof state.lastDetailUrl === 'string'
              ? state.lastDetailUrl.match(/\/explore\/([^/?#]+)/)?.[1]
              : '') || noteId;

          if (!finalNoteId) {
            console.warn('   ⚠️ 无法确定 noteId，跳过本地持久化');
          } else if (seenNoteIds.has(finalNoteId)) {
            console.log(
              `   ⚠️ noteId=${finalNoteId} 已处理过，本轮仅复用评论结果，不再写盘`,
            );
          } else {
            seenNoteIds.add(finalNoteId);
            const persistRes = await persistXhsNote({
              sessionId: PROFILE,
              env,
              platform: PLATFORM,
              keyword,
              noteId: finalNoteId,
              detailUrl: state.lastDetailUrl,
              detail: state.detailData || {},
              commentsResult: aggregatedResult,
            });
            if (!persistRes.success) {
              console.warn(
                `   ⚠️ PersistXhsNote 失败 noteId=${finalNoteId}: ${persistRes.error}`,
              );
            } else {
              console.log(
                `   💾 已落盘 noteId=${finalNoteId} 到目录: ${
                  persistRes.outputDir || persistRes.contentPath || '未知路径'
                }`,
              );
            }
          }
        }
      }
    }

    if (riskStop) {
      console.warn(
        `\n[FullCollect] Phase3-4 因风控中断：已完成 note=${completedNotes}/${maxNotesToProcess}，风控命中次数=${riskDetectionCount}`,
      );
      break;
    }

    if (roundNewComments === 0) {
      console.log(
        '\n[FullCollect][Group] 当前轮未获取到任何新评论，提前结束多轮采集以避免死循环',
      );
      break;
    }

    roundIndex += 1;
  }

  console.log(
    `\n[FullCollect] Phase3-4 总结：本轮完成 note 数量=${completedNotes}（目标=${maxNotesToProcess}，风控命中次数=${riskDetectionCount}）`,
  );
}

async function runPhase2To4(
  keyword,
  targetCount,
  env,
  resumeContext = { enabled: false, completed: 0 },
  options = {},
) {
  console.log('\n3️⃣ Phase2-4: 列表 + 详情 + 评论 + 落盘（单次全流程）...');

  const { searchUrl: providedSearchUrl = '' } = options || {};
  const stateStep = getCurrentStepState();
  const resumeStateReady =
    stateStep &&
    stateStep.phase === 'list' &&
    stateStep.keyword === keyword &&
    stateStep.env === env &&
    Number(stateStep.target) === Number(targetCount);

  const seenNoteIds = new Set();
  const safeUrlIndex = new Map();
  const baseDir = getKeywordBaseDir(env, keyword);
  const indexPath = getSafeDetailIndexPath(env, keyword);

  const resumeEnabled = Boolean(resumeContext?.enabled || resumeStateReady);
  const resumeCompleted = resumeEnabled ? Math.max(0, resumeContext?.completed || 0) : 0;
  const stateProcessed = resumeStateReady ? Number(stateStep?.processedCount) || 0 : 0;
  let processedCount = Math.max(resumeCompleted, stateProcessed);

  const currentSearchUrl = providedSearchUrl || (resumeStateReady ? stateStep?.searchUrl || '' : '');
  let loopRound = resumeStateReady ? Number(stateStep?.scrollRound) || 0 : 0;
  let lastViewportCount = resumeStateReady ? Number(stateStep?.lastViewportCount) || 0 : 0;
  let noNewViewportRounds = 0;

  if (resumeEnabled) {
    console.log(
      `[FullCollect][Resume] 恢复模式开启：${
        resumeContext?.reason || (resumeStateReady ? '存在未完成列表任务' : '未知原因')
      }`,
    );
  } else if (resumeContext?.reason) {
    console.log(`[FullCollect][Resume] 恢复模式关闭：${resumeContext.reason}`);
  }

  try {
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const noteId = dirent.name;
      const contentPath = path.join(baseDir, noteId, 'content.md');
      const stat = await fs.promises.stat(contentPath).catch(() => null);
      if (stat && stat.isFile()) {
        seenNoteIds.add(noteId);
      }
    }
    if (seenNoteIds.size > 0) {
      console.log(
        `[FullCollect][Resume] 检测到已落盘的 note 数量: ${seenNoteIds.size}（将跳过这些 note 的详情/评论采集）`,
      );
    }
  } catch {
    // ignore
  }

  try {
    const content = await fs.promises.readFile(indexPath, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const noteId = obj.noteId || '';
        const safeDetailUrl = obj.safeDetailUrl || obj.detailUrl || '';
        const hasToken =
          Boolean(obj.hasToken) ||
          (typeof safeDetailUrl === 'string' && safeDetailUrl.includes('xsec_token='));
        if (!noteId || !safeDetailUrl || !hasToken) continue;
        if (safeUrlIndex.has(noteId)) continue;
        safeUrlIndex.set(noteId, {
          noteId,
          title: obj.title || '',
          safeDetailUrl,
          hasToken: true,
          containerId: obj.containerId || null,
          domIndex:
            typeof obj.domIndex === 'number' && Number.isFinite(obj.domIndex)
              ? obj.domIndex
              : null,
        });
      } catch {
        // ignore bad line
      }
    }
    if (safeUrlIndex.size > 0) {
      console.log(
        `[FullCollect][Resume] 预加载 safe-detail-urls 索引条目: ${safeUrlIndex.size}（来自历史 JSONL）`,
      );
    }
  } catch {
    // ignore missing index
  }

  function buildPendingKey(containerId, domIndex, noteId) {
    if (noteId) return `note:${noteId}`;
    const normalizedIndex =
      typeof domIndex === 'number' && Number.isFinite(domIndex) ? domIndex : 'na';
    return `${containerId || 'container'}#${normalizedIndex}`;
  }

  function revivePendingItem(raw) {
    if (!raw || !raw.containerId) return null;
    const normalizedDomIndex =
      typeof raw.domIndex === 'number' && Number.isFinite(raw.domIndex) ? raw.domIndex : null;
    const safeDetailUrl = raw.safeDetailUrl || '';
    return {
      pendingKey: raw.pendingKey || buildPendingKey(raw.containerId, normalizedDomIndex, raw.noteId),
      noteId: raw.noteId || null,
      title: raw.title || '',
      containerId: raw.containerId,
      domIndex: normalizedDomIndex,
      safeDetailUrl,
      hasToken: Boolean(raw.hasToken) || safeDetailUrl.includes('xsec_token='),
      anchorRect: raw.anchorRect || null,
      addedAt: raw.addedAt || Date.now(),
    };
  }

  function normalizeListItem(item) {
    if (!item || !item.containerId) return null;
    const domIndex =
      typeof item.raw?.index === 'number' && Number.isFinite(item.raw.index)
        ? item.raw.index
        : typeof item.domIndex === 'number' && Number.isFinite(item.domIndex)
          ? item.domIndex
          : null;
    const rawUrl = item.safeDetailUrl || item.detailUrl || '';
    return {
      pendingKey: buildPendingKey(item.containerId, domIndex, item.noteId),
      noteId: item.noteId || null,
      title: item.title || '',
      containerId: item.containerId,
      domIndex,
      safeDetailUrl: rawUrl,
      hasToken: Boolean(item.hasToken) || (typeof rawUrl === 'string' && rawUrl.includes('xsec_token=')),
      anchorRect: item.anchor?.rect || item.rect || null,
      addedAt: Date.now(),
    };
  }

  function serializePendingItem(item) {
    if (!item) return null;
    return {
      pendingKey: item.pendingKey,
      noteId: item.noteId || null,
      title: item.title || '',
      containerId: item.containerId || '',
      domIndex:
        typeof item.domIndex === 'number' && Number.isFinite(item.domIndex) ? item.domIndex : null,
      safeDetailUrl: item.safeDetailUrl || '',
      hasToken: Boolean(item.hasToken),
      anchorRect: item.anchorRect || null,
      addedAt: item.addedAt || Date.now(),
    };
  }

  function serializePendingItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => serializePendingItem(item)).filter(Boolean);
  }

  const pendingQueue = [];
  const pendingKeySet = new Set();
  if (resumeStateReady) {
    const restored = [];
    if (stateStep?.activeItem) {
      restored.push(stateStep.activeItem);
    }
    if (Array.isArray(stateStep?.pendingItems)) {
      restored.push(...stateStep.pendingItems);
    }
    for (const raw of restored) {
      const revived = revivePendingItem(raw);
      if (!revived || !revived.pendingKey || pendingKeySet.has(revived.pendingKey)) continue;
      pendingQueue.push(revived);
      pendingKeySet.add(revived.pendingKey);
      if (
        revived.noteId &&
        revived.safeDetailUrl &&
        revived.safeDetailUrl.includes('xsec_token=') &&
        !safeUrlIndex.has(revived.noteId)
      ) {
        safeUrlIndex.set(revived.noteId, {
          noteId: revived.noteId,
          title: revived.title || '',
          safeDetailUrl: revived.safeDetailUrl,
          hasToken: true,
        });
      }
    }
    if (pendingQueue.length > 0) {
      console.log(
        `[FullCollect][Resume] 恢复待处理队列 ${pendingQueue.length} 条（scrollRound=${loopRound}）`,
      );
    }
  }

  let activeItem = null;
  let riskDetectionCount = 0;
  const initialCompleted = processedCount;
  const maxLoopRounds = Math.max(targetCount * 3, 50);

  console.log(
    `[FullCollect] Phase2-4 启动：断点续传=${resumeEnabled}，当前已完成 ${initialCompleted}/${targetCount} 条目标 note`,
  );

  const beforeUrl = await getCurrentUrl();
  if (beforeUrl && beforeUrl.includes('/explore/')) {
    console.log('[FullCollect] 预检查：当前在详情页，先通过 ESC 恢复到搜索列表...');
    const recovery = await errorRecovery({
      sessionId: PROFILE,
      fromStage: 'detail',
      targetStage: 'search',
      recoveryMode: 'esc',
      maxRetries: 2,
    });

    if (!recovery.success) {
      console.error('[FullCollect] ❌ ESC 恢复失败，无法安全回到搜索列表');
      if (recovery.currentUrl) {
        console.error('   当前 URL:', recovery.currentUrl);
      }
      return;
    }

    console.log(
      `   ✅ 预恢复成功，finalStage=${recovery.finalStage}, method=${
        recovery.method || 'unknown'
      }`,
    );
  }

  async function persistListStateSnapshot(
    {
      pendingItems = pendingQueue,
      active = activeItem,
      processed = processedCount,
      scrollRoundValue = loopRound,
      viewportSize = lastViewportCount,
    } = {},
    historyEntry = null,
  ) {
    const serializedPending = serializePendingItems(pendingItems);
    const serializedActive = serializePendingItem(active);
    await updateCollectState((draft) => {
      draft.currentStep = createListStepState({
        keyword,
        env,
        target: targetCount,
        searchUrl: currentSearchUrl || draft.currentStep?.searchUrl || '',
        processedCount: processed,
        scrollRound: scrollRoundValue,
        pendingItems: serializedPending,
        activeItem: serializedActive,
        lastViewportCount: viewportSize,
      });
      draft.history = draft.history || {};
      draft.history.safeDetailIndexSize = safeUrlIndex.size;
      if (historyEntry) {
        const list = Array.isArray(draft.history.completed) ? draft.history.completed : [];
        list.push(historyEntry);
        draft.history.completed = list.slice(-200);
        draft.history.completedCount = (draft.history.completedCount || 0) + 1;
        draft.history.lastNoteId = historyEntry.noteId;
        draft.history.lastCompletedAt = historyEntry.completedAt;
      }
      return draft;
    });
  }

  async function processQueueItem(queueItem) {
    if (!queueItem || !queueItem.containerId) {
      console.warn('[FullCollect][Queue] 队列项缺少 containerId，自动跳过');
      return;
    }

    const listNoteId = queueItem.noteId;
    if (listNoteId && seenNoteIds.has(listNoteId)) {
      console.log(
        `\n📝 Note (跳过重复): noteId=${listNoteId} (${queueItem.title || '无标题'})`,
      );
      return;
    }

    const displayIndex = processedCount + 1;
    console.log(
      `\n📝 Note #${displayIndex}/${targetCount}: ${queueItem.title || '无标题'} (${
        queueItem.noteId || '无ID'
      })`,
    );

    console.log('3️⃣ Phase3: 打开详情页...');
    const openResult = await openDetail({
      sessionId: PROFILE,
      containerId: queueItem.containerId,
      domIndex: queueItem.domIndex,
    });

    if (!openResult.success || !openResult.detailReady) {
      console.error(`❌ 打开详情页失败: ${openResult.error || 'detail not ready'}`);
      console.log('[FullCollect][Anchor:OpenDetail]', JSON.stringify(openResult.anchor || null));
      await errorRecovery({
        sessionId: PROFILE,
        fromStage: 'detail',
        targetStage: 'search',
        recoveryMode: 'esc',
        maxRetries: 2,
      }).catch(() => ({}));
      if (listNoteId) {
        seenNoteIds.add(listNoteId);
      }
      return;
    }

    console.log('[FullCollect][Anchor:OpenDetail]', JSON.stringify(openResult.anchor || null));
    console.log('   ✅ 详情页已打开');

    const currentUrl = await getCurrentUrl();
    const noteIdFromUrl =
      typeof currentUrl === 'string'
        ? (currentUrl.match(/\/explore\/([^/?#]+)/)?.[1] || '')
        : '';

    const riskDetected = await detectRiskControl();
    if (riskDetected) {
      console.warn('   🚨 当前详情打开命中了风控页面，启动恢复流程');
      if (listNoteId) {
        seenNoteIds.add(listNoteId);
      }

      riskDetectionCount += 1;
      let canContinue = false;

      if (riskDetectionCount === 1) {
        canContinue = await handleRiskRecovery(keyword);
      } else {
        console.error('   ❌ 多次命中风控，停止本轮采集以避免加重风控');
        canContinue = false;
      }

      if (!canContinue) {
        processedCount = targetCount;
      }

      return;
    }

    console.log('4️⃣ Phase4: 预热并采集评论...');
    const commentsResult = await collectComments({
      sessionId: PROFILE,
      maxWarmupRounds: 12,
    }).catch((e) => ({
      success: false,
      comments: [],
      reachedEnd: false,
      emptyState: false,
      warmupCount: 0,
      totalFromHeader: null,
      error: e.message || String(e),
      anchor: null,
    }));

    if (!commentsResult.success) {
      console.error(`❌ 评论采集失败: ${commentsResult.error}`);
      console.log(
        '[FullCollect][Anchor:CollectComments]',
        JSON.stringify(commentsResult.anchor || null),
      );
    } else {
      console.log(
        '[FullCollect][Anchor:CollectComments]',
        JSON.stringify(commentsResult.anchor || null),
      );
      console.log(
        `   ✅ 评论数: ${commentsResult.comments.length} reachedEnd=${commentsResult.reachedEnd} emptyState=${commentsResult.emptyState}`,
      );
      if (commentsResult.comments.length > 0) {
        const preview = commentsResult.comments[0]?.text || '';
        console.log(`   ✅ 示例评论: ${preview.substring(0, 50)}`);
      }
    }

    const finalNoteId = noteIdFromUrl || queueItem.noteId || '';
    if (!finalNoteId) {
      console.warn('   ⚠️ 无法确定 noteId，跳过本地持久化');
    } else {
      if (seenNoteIds.has(finalNoteId)) {
        console.log(`   ⚠️ noteId=${finalNoteId} 已处理过，本轮仅复用评论结果，不再写盘`);
      } else {
        seenNoteIds.add(finalNoteId);
        const persistRes = await persistXhsNote({
          sessionId: PROFILE,
          env,
          platform: PLATFORM,
          keyword,
          noteId: finalNoteId,
          detailUrl: currentUrl,
          detail: {},
          commentsResult,
        });
        if (!persistRes.success) {
          console.warn(`   ⚠️ PersistXhsNote 失败 noteId=${finalNoteId}: ${persistRes.error}`);
        } else {
          console.log(
            `   💾 已落盘 noteId=${finalNoteId} 到目录: ${
              persistRes.outputDir || persistRes.contentPath || '未知路径'
            }`,
          );
        }
      }
    }

    if (commentsResult.success) {
      processedCount += 1;
      console.log(
        `   [Progress] 已完成 ${processedCount}/${targetCount} 条 note（keyword="${keyword}"）`,
      );

      // 更新评论进度状态（per-note commentState）
      try {
        const newComments = Array.isArray(commentsResult.comments)
          ? commentsResult.comments
          : [];
        const stateMap = getCommentStateMap();
        const prevState = stateMap[finalNoteId] || { totalSeen: 0, lastPair: null };

        const totalSeen = prevState.totalSeen + newComments.length;

        function buildCommentKey(c) {
          if (!c || typeof c !== 'object') return '';
          const userId = c.user_id || c.userId || '';
          const userName = c.user_name || c.userName || c.nickname || '';
          const text = (c.text || c.content || '').toString();
          const ts = c.timestamp || c.time || '';
          return `${userId}||${userName}||${text.substring(0, 64)}||${ts}`;
        }

        let lastPair = prevState.lastPair || null;
        if (newComments.length >= 2) {
          const c1 = newComments[Math.max(0, newComments.length - 2)];
          const c2 = newComments[Math.max(0, newComments.length - 1)];
          lastPair = {
            key1: buildCommentKey(c1),
            key2: buildCommentKey(c2),
            preview1: ((c1 && (c1.text || c1.content || '')) || '').toString().substring(0, 80),
            preview2: ((c2 && (c2.text || c2.content || '')) || '').toString().substring(0, 80),
          };
        }

        await updateCollectState((draft) => {
          draft.history = draft.history || {};
          draft.history.commentStates = draft.history.commentStates || {};
          draft.history.commentStates[finalNoteId] = {
            noteId: finalNoteId,
            totalSeen,
            lastPair,
            updatedAt: Date.now(),
          };
          return draft;
        }, `comment-state:${finalNoteId}`);
      } catch (err) {
        console.warn(
          `[FullCollect][CommentState] 更新评论状态失败 noteId=${finalNoteId}:`,
          err?.message || String(err),
        );
      }

      await persistListStateSnapshot(
        {},
        finalNoteId
          ? {
              noteId: finalNoteId,
              title: queueItem.title || '',
              completedAt: Date.now(),
            }
          : null,
      );
    }

    console.log('5️⃣ Phase4: ESC 退出详情页，返回搜索列表...');
    const recovery = await errorRecovery({
      sessionId: PROFILE,
      fromStage: 'detail',
      targetStage: 'search',
      recoveryMode: 'esc',
      maxRetries: 2,
    });

    if (!recovery.success) {
      console.error('❌ ESC 恢复失败，本轮循环中止');
      if (recovery.currentUrl) {
        console.error('   当前 URL:', recovery.currentUrl);
      }
      processedCount = targetCount;
      return;
    }

    console.log(
      `   ✅ ESC 恢复成功，finalStage=${recovery.finalStage}, method=${
        recovery.method || 'unknown'
      }, noteId=${noteIdFromUrl || queueItem.noteId || '未知'}`,
    );
  }

  try {
    while (processedCount < targetCount) {
      if (pendingQueue.length === 0) {
        if (loopRound >= maxLoopRounds) {
          console.warn('[FullCollect] 已达到最大列表刷新次数，停止继续拉取');
          break;
        }
        loopRound += 1;
        console.log(
          `\n[FullCollect][Loop] Round ${loopRound}, processed=${processedCount}/${targetCount}`,
        );
        const stageOk = await ensureSearchStage(keyword, 3);
        if (!stageOk) {
          console.error(
            '[FullCollect] 当前页面不在搜索结果页，已尝试恢复失败，为避免在错误页面采集，终止 Phase2-4 循环',
          );
          break;
        }
        console.log('1️⃣ Phase2: 收集当前视口搜索结果列表...');

        // 为了避免“只认第一个结果”的问题，这里不要直接把全局 targetCount
        // 传给 CollectSearchListBlock，而是按“剩余目标 × 系数”的方式多抓一些候选，
        // 同时设定上下限，保证每轮至少能看到一整屏的候选列表。
        const remaining = Math.max(1, targetCount - processedCount);
        const viewportTarget = Math.min(Math.max(remaining * 3, 20), 80);

        const listResult = await collectSearchList({
          sessionId: PROFILE,
          targetCount: viewportTarget,
          maxScrollRounds: 1,
        });

        if (!listResult.success || !Array.isArray(listResult.items)) {
          console.error(
            `❌ CollectSearchList 失败: success=${listResult.success}, error=${listResult.error}`,
          );
          break;
        }

        lastViewportCount = listResult.items.length;
        console.log(
          `   ✅ 当前视口命中条目: ${lastViewportCount}（累计处理 ${processedCount}/${targetCount}）`,
        );

        let newlyQueued = 0;
        for (const item of listResult.items) {
          const rawUrl = item.safeDetailUrl || item.detailUrl || '';
          const hasToken =
            Boolean(item.hasToken) || (typeof rawUrl === 'string' && rawUrl.includes('xsec_token='));
          if (item.noteId && rawUrl && hasToken && !safeUrlIndex.has(item.noteId)) {
            const domIndex =
              typeof item.raw?.index === 'number' && Number.isFinite(item.raw.index)
                ? item.raw.index
                : typeof item.domIndex === 'number' && Number.isFinite(item.domIndex)
                  ? item.domIndex
                  : null;
            safeUrlIndex.set(item.noteId, {
              noteId: item.noteId,
              title: item.title || '',
              safeDetailUrl: rawUrl,
              hasToken: true,
              containerId: item.containerId || null,
              domIndex,
            });
          }
          const normalized = normalizeListItem(item);
          if (!normalized || !normalized.pendingKey) continue;
          if (pendingKeySet.has(normalized.pendingKey)) continue;
          pendingQueue.push(normalized);
          pendingKeySet.add(normalized.pendingKey);
          newlyQueued += 1;
        }

        await persistListStateSnapshot({
          pendingItems: pendingQueue,
          active: null,
          processed: processedCount,
          scrollRoundValue: loopRound,
          viewportSize: lastViewportCount,
        });

        if (newlyQueued === 0) {
          noNewViewportRounds += 1;
          console.log(
            `   ⚠️ 当前视口没有可处理的新帖子（noNewViewportRounds=${noNewViewportRounds}）`,
          );

          // 满足任一条件就认为再滚也没有意义，直接收敛：
          // 1）safe-detail-urls 已达到或超过 target（说明目标数量的候选帖子其实都已经见过）；
          // 2）连续 3 轮都找不到新帖子（避免在同一屏结果上死循环滚动）。
          if (safeUrlIndex.size >= targetCount || noNewViewportRounds >= 3) {
            console.warn(
              `   ⚠️ safe-detail-urls=${safeUrlIndex.size}, target=${targetCount}, 连续无新帖子轮次=${noNewViewportRounds}，停止 Phase2 列表刷新以避免死循环`,
            );
            break;
          }

          console.log('   ⚠️ 尝试系统滚动加载更多搜索结果...');
          const scrolled = await scrollSearchPage('down', keyword);
          if (!scrolled) {
            console.warn('   ⚠️ 系统滚动失败或已到底，停止循环');
            break;
          }
          continue;
        } else {
          // 一旦有新帖子加入队列，重置“无新内容轮次”计数
          noNewViewportRounds = 0;
        }
      } else {
        console.log(
          `[FullCollect][Queue] 使用恢复队列，当前 pending=${pendingQueue.length}, processed=${processedCount}/${targetCount}`,
        );
      }

      while (pendingQueue.length > 0 && processedCount < targetCount) {
        activeItem = pendingQueue.shift();
        if (activeItem?.pendingKey) {
          pendingKeySet.delete(activeItem.pendingKey);
        }
        await persistListStateSnapshot({
          pendingItems: pendingQueue,
          active: activeItem,
          processed: processedCount,
          scrollRoundValue: loopRound,
          viewportSize: lastViewportCount,
        });
        await processQueueItem(activeItem);
        activeItem = null;
        await persistListStateSnapshot({
          pendingItems: pendingQueue,
          active: null,
          processed: processedCount,
          scrollRoundValue: loopRound,
          viewportSize: lastViewportCount,
        });
        if (processedCount >= targetCount) break;
      }

      if (processedCount >= targetCount) {
        break;
      }

      const scrolled = await scrollSearchPage('down', keyword);
      if (!scrolled) {
        console.warn('   ⚠️ 系统滚动失败或已到底，停止循环');
        break;
      }
    }

    const newCompleted = processedCount - initialCompleted;
    if (newCompleted > 0) {
      console.log(
        `\n[FullCollect] Phase2-4 总结：本轮新增完成 ${newCompleted} 条，累计完成 ${processedCount}/${targetCount}（风控命中次数=${riskDetectionCount}）`,
      );
    } else {
      console.log(
        `\n[FullCollect] Phase2-4 总结：本轮没有新增完成的 note（当前累计 ${processedCount}/${targetCount}）。`,
      );
      console.log(
        '  - 可能原因：目标数量已由历史采集满足，或当前搜索结果不足；如需强制重采，可调整 target 或清理对应 keyword 的下载目录后重试。',
      );
    }

    try {
      await fs.promises.mkdir(baseDir, { recursive: true });
      const lines = [];
      for (const entry of safeUrlIndex.values()) {
        lines.push(
          JSON.stringify({
            platform: PLATFORM,
            env,
            keyword,
            noteId: entry.noteId,
            title: entry.title,
            safeDetailUrl: entry.safeDetailUrl,
            hasToken: entry.hasToken,
            containerId: entry.containerId || null,
            domIndex:
              typeof entry.domIndex === 'number' && Number.isFinite(entry.domIndex)
                ? entry.domIndex
                : null,
          }),
        );
      }

      await fs.promises.writeFile(
        indexPath,
        lines.join('\n') + (lines.length ? '\n' : ''),
        'utf8',
      );
      console.log(
        `\n[FullCollect][SafeDetailIndex] 已写入 ${safeUrlIndex.size} 条带 xsec_token 的详情链接到: ${indexPath}`,
      );
    } catch (err) {
      console.warn(
        '[FullCollect][SafeDetailIndex] 写入 safe-detail-urls 失败:',
        err?.message || String(err),
      );
    }

    console.log('\n[FullCollect] ✅ Phase2-4 Loop 完成');
  } catch (error) {
    console.error('[FullCollect] ❌ Phase2-4 Loop 未捕获错误:', error.message || error);
  } finally {
    try {
      const status = processedCount >= targetCount ? 'completed' : 'incomplete';
      if (status === 'completed') {
        await setCurrentStepState(null, 'list-clear');
      } else {
        await persistListStateSnapshot();
      }

      const meta = {
        lastRunAt: Date.now(),
        lastTarget: targetCount,
        lastCompleted: processedCount,
        lastStatus: status,
      };
      await fs.promises.mkdir(baseDir, { recursive: true });
      const metaPath2 = getMetaPath(env, keyword);
      await fs.promises.writeFile(metaPath2, JSON.stringify(meta, null, 2), 'utf8');
      console.log(
        `[FullCollect][Meta] 已更新采集任务元信息: lastStatus=${status}, lastTarget=${targetCount}, lastCompleted=${processedCount}`,
      );
    } catch (err) {
      console.warn(
        '[FullCollect][Meta] 写入采集任务元信息失败:',
        err?.message || String(err),
      );
    }
  }
}

async function main() {
  const keyword = resolveKeyword();
  const target = resolveTarget();
  const env = resolveEnv();

  console.log('🚀 Phase1-4 全流程采集（小红书）\n');
  console.log(`配置: keyword="${keyword}" target=${target} env=${env}\n`);

  if (isFreshMode()) {
    const dir = getKeywordBaseDir(env, keyword);
    console.log(`[FullCollect] --fresh 开启：将删除历史目录后重新采集: ${dir}`);
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn('[FullCollect] 删除历史目录失败（继续执行）:', err?.message || String(err));
    }
  }

  await initCollectState(keyword, env, target);

  // 0. 确保核心服务已启动（Unified API + Browser Service）
  await ensureBaseServices();

  console.log('1️⃣ Phase1: 确保会话 + 登录态...');
  await ensureSessionAndLogin();

  // 1.5 SearchGate：无论是否跑 Phase2/3/4，都需要保证 SearchGate 在线
  console.log('1️⃣ Phase1.5: 确认 SearchGate 在线或尝试启动...');
  await ensureSearchGate();

  // 2. Phase2：只在 safe-detail-urls 不足目标数量时执行列表采集
  const safeEntriesBefore = await loadSafeDetailEntries(keyword, env);
  const safeCountBefore = Array.isArray(safeEntriesBefore)
    ? safeEntriesBefore.length
    : 0;

  if (isPhase2ListOnlyMode()) {
    console.log(
      `\n[FullCollect] 进入 Phase2(ListOnly) 调试模式：当前已有 safe-detail-urls=${safeCountBefore} 条`,
    );
    await runPhase2ListOnly(keyword, target, env);
    console.log('\n✅ Phase1-2（ListOnly）执行完成（未进入详情/评论阶段）');
    console.log(
      `   safe-detail-urls 输出目录: ~/.webauto/download/xiaohongshu/${env}/${keyword}/safe-detail-urls.jsonl`,
    );
    return;
  }

  if (safeCountBefore < target) {
    console.log(
      `\n2️⃣ Phase2: 搜索结果列表采集（safe-detail-urls 续采）... 当前已有=${safeCountBefore}, 目标=${target}`,
    );
    await runPhase2ListOnly(keyword, target, env);
  } else {
    console.log(
      `\n[FullCollect] 检测到 safe-detail-urls.jsonl 已有 ${safeCountBefore} 条（>= target=${target}），本次跳过 Phase2 列表采集`,
    );
  }

  // 3. Phase3-4：完全基于 safe-detail-urls.jsonl 做详情 + 评论采集
  await runPhase3And4FromIndex(keyword, target, env);

  console.log('\n✅ Phase1-4 全流程采集完成（基于 safe-detail-urls.jsonl）');
  console.log(
    `   输出目录: ~/.webauto/download/xiaohongshu/${env}/${keyword}/<noteId>/`,
  );
}

main().catch((err) => {
  const reasonRaw = err?.message || String(err || '');
  const reason = String(reasonRaw || '').trim() || 'unknown_error';

  const explicit = new Map([
    // Phase2
    ['phase2_keyword_drift', 21],
    ['phase2_open_detail_not_ready', 22],
    ['phase2_recovery_failed', 23],
    ['phase2_safe_detail_target_not_reached', 24],
    ['stage_guard_not_search', 25],
    ['stage_guard_not_search_no_search', 26],
    // Infra / services
    ['search_gate_unhealthy', 11],
    ['session_start_timeout', 12],
  ]);

  const mapped =
    explicit.get(reason) ??
    (reason.startsWith('phase2_') ? 20 : null) ??
    (reason.startsWith('phase3_') ? 30 : null) ??
    (reason.startsWith('phase4_') ? 40 : null) ??
    1;

  console.error('❌ Phase1-4 全流程失败:', reason);
  console.error(`[Exit] code=${mapped} reason=${reason}`);
  process.exitCode = mapped;
});
