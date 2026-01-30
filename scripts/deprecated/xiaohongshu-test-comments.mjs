#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书评论展开与提取测试（容器驱动版）
 *
 * 步骤：
 * 1. 复用 xiaohongshu_fresh 会话，确保在搜索页（关键字默认“手机膜”）。
 * 2. 通过容器 `xiaohongshu_search.search_result_list` / `search_result_item` 获取可点击的笔记。
 * 3. 使用 `search_result_item.navigate` 进入详情模态，驱动 `comment_section` 容器自动滚动与展开回复。
 * 4. 输出评论数量、前几条评论、THE END / 空状态命中情况，验证容器配置是否正确。
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const startScript = path.join(repoRoot, 'scripts', 'start-headful.mjs');
const KEYWORD_STATE_FILE = path.join(repoRoot, 'output', 'xiaohongshu-keyword-rotation.json');
const UNIFIED_API = 'http://127.0.0.1:7701';
const BROWSER_SERVICE = 'http://127.0.0.1:7704';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];
let currentKeyword = KEYWORDS[0];
const SEARCH_ROOT_ID = 'xiaohongshu_search';
const SEARCH_LIST_ID = 'xiaohongshu_search.search_result_list';
const SEARCH_ITEM_ID = 'xiaohongshu_search.search_result_item';
const DETAIL_MODAL_ID = 'xiaohongshu_detail.modal_shell';
const DETAIL_COMMENT_SECTION_ID = 'xiaohongshu_detail.comment_section';
const DETAIL_COMMENT_ITEM_ID = 'xiaohongshu_detail.comment_section.comment_item';
const DETAIL_SHOW_MORE_ID = 'xiaohongshu_detail.comment_section.show_more_button';
const DETAIL_COMMENT_END_ID = 'xiaohongshu_detail.comment_section.end_marker';
const DETAIL_COMMENT_EMPTY_ID = 'xiaohongshu_detail.comment_section.empty_state';
const DETAIL_HEADER_ID = 'xiaohongshu_detail.header';
const DETAIL_CONTENT_ID = 'xiaohongshu_detail.content';

const TEST_COUNT = 2;
const MAX_MATCH_RETRIES = 3;
const KEYWORD_GROUP_INTERVAL = 3;
const LOGIN_URL = 'https://www.xiaohongshu.com/login';
const SESSION_WAIT_TIMEOUT = 90_000;
const LOGIN_WAIT_TIMEOUT = 180_000;
const ROUNDS_PER_EXECUTION = Number(process.env.XHS_COMMENT_ROUNDS || 3);

let autoCookieStarted = false;
let sessionLaunchInFlight = null;

const buildSearchUrl = (keyword) =>
  `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes&type=51`;

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
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

async function controllerAction(action, payload = {}) {
  const result = await post('/v1/controller/action', { action, payload });
  if (result && result.success === false) {
    throw new Error(result.error || `controller action ${action} failed`);
  }
  return unwrapData(result);
}

async function executeOperation(containerId, operationId, config = {}) {
  return controllerAction('container:operation', {
    containerId,
    operationId,
    config,
    sessionId: PROFILE,
  });
}

async function browserCommand(action, args = {}, timeout = 20000) {
  const controllerUrl = `${BROWSER_SERVICE}/command`;
  const res = await fetch(controllerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    throw new Error(`browser command ${action} failed: HTTP ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) {
    throw new Error(data.error || `browser command ${action} failed`);
  }
  return data.body || data;
}

async function ensureKeywordStateDir() {
  await fs.mkdir(path.dirname(KEYWORD_STATE_FILE), { recursive: true });
}

async function loadKeywordState() {
  await ensureKeywordStateDir();
  try {
    const raw = await fs.readFile(KEYWORD_STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { nextIndex: 0, totalRuns: 0 };
  }
}

async function saveKeywordState(state) {
  await ensureKeywordStateDir();
  await fs.writeFile(KEYWORD_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

async function pickKeywordForRound() {
  const state = await loadKeywordState();
  const nextIndex = Number.isInteger(state.nextIndex) ? state.nextIndex % KEYWORDS.length : 0;
  const keyword = KEYWORDS[nextIndex] || KEYWORDS[0];
  const totalRuns = (state.totalRuns || 0) + 1;
  const rotationReset = totalRuns % KEYWORD_GROUP_INTERVAL === 0;
  const updated = {
    nextIndex: (nextIndex + 1) % KEYWORDS.length,
    totalRuns,
  };
  await saveKeywordState(updated);
  return { keyword, totalRuns, rotationReset };
}

function extractSessions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.sessions)) return payload.sessions;
  if (Array.isArray(payload.data?.sessions)) return payload.data.sessions;
  if (Array.isArray(payload.result?.sessions)) return payload.result.sessions;
  if (payload.data) return extractSessions(payload.data);
  return [];
}

async function listSessions() {
  try {
    const raw = await controllerAction('session:list', {});
    return extractSessions(raw);
  } catch (err) {
    log('ERROR', `session:list 调用失败：${err.message}`);
    throw err;
  }
}

function normalizeSession(session) {
  if (!session) return null;
  return {
    profileId: session.profileId || session.profile_id || null,
    sessionId: session.session_id || session.sessionId || null,
    currentUrl: session.current_url || session.currentUrl || null,
  };
}

async function ensureBrowserSession(keyword) {
  const sessions = await listSessions().catch(() => []);
  const match = sessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
  if (match) {
    return match;
  }
  await startBrowserSession(keyword);
  return waitForSession(keyword);
}

async function startBrowserSession(keyword) {
  if (sessionLaunchInFlight) {
    return sessionLaunchInFlight;
  }
  const targetUrl = buildSearchUrl(keyword);
  log('SESSION', `未检测到 ${PROFILE} 会话，使用 start-headful 启动 -> ${targetUrl}`);
  sessionLaunchInFlight = new Promise((resolve) => {
    try {
      const child = spawn('node', [startScript, '--profile', PROFILE, '--url', targetUrl], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
      });
      child.unref();
      resolve();
    } catch (err) {
      log('ERROR', `启动会话失败：${err.message}`);
      resolve();
    }
  }).finally(() => {
    sessionLaunchInFlight = null;
  });
  return sessionLaunchInFlight;
}

async function waitForSession(keyword) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < SESSION_WAIT_TIMEOUT) {
    await delay(3000);
    const sessions = await listSessions().catch(() => []);
    const match = sessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
    if (match) {
      log('SESSION', `检测到 ${PROFILE} 会话，当前 URL: ${match.currentUrl || '未知'}`);
      return match;
    }
  }
  throw new Error(`等待 ${PROFILE} 会话超时 (${SESSION_WAIT_TIMEOUT / 1000}s)`);
}

async function inspectContainer(containerId, maxChildren = 80) {
  const snapshot = await controllerAction('containers:inspect-container', {
    profile: PROFILE,
    containerId,
    maxChildren,
  });
  return snapshot?.snapshot?.container_tree || null;
}

function mapTree(node) {
  if (!node) return null;
  return {
    id: node.id,
    defId: node.defId || node.name || node.id,
    name: node.name,
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

function collectNodesByDefId(node, defId) {
  if (!node) return [];
  const out = [];
  if (node.defId === defId) out.push(node);
  for (const child of node.children || []) {
    out.push(...collectNodesByDefId(child, defId));
  }
  return out;
}

async function getCurrentUrl() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'location.href',
  });
  return result?.result || '';
}

async function isLoggedIn() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `(() => {
        try {
          if (window.__INITIAL_STATE__?.user?.isLogin) return true;
          const avatar = document.querySelector('.header-avatar img, [class*="avatar"] img');
          if (avatar && avatar.src && !avatar.src.includes('default')) return true;
          return document.cookie.includes('web_session');
        } catch (err) {
          return false;
        }
      })();`,
    });
    return Boolean(result?.result ?? result);
  } catch (err) {
    log('WARN', `登录检测失败：${err.message}`);
    return false;
  }
}

async function highlightLoginAnchors() {
  try {
    const tree = await matchContainers();
    if (!tree) return;
    const targets = [];
    const loginGuard = findNodeByDefId(tree, 'xiaohongshu_login.login_guard');
    if (loginGuard) targets.push(loginGuard);
    const searchAnchor = findNodeByDefId(tree, 'xiaohongshu_search.login_anchor');
    if (searchAnchor) targets.push(searchAnchor);
    const detailAnchor = findNodeByDefId(tree, 'xiaohongshu_detail.login_anchor');
    if (detailAnchor) targets.push(detailAnchor);
    for (const node of targets) {
      if (!node.id) continue;
      await executeOperation(node.id, 'highlight', {
        style: '2px solid #ff7043',
        duration: 1200,
      });
    }
  } catch (err) {
    log('LOGIN', `高亮登录锚点失败：${err.message}`);
  }
}

async function ensureLoggedIn(keyword) {
  if (await isLoggedIn()) {
    log('LOGIN', '检测到登录态');
    return true;
  }
  log('LOGIN', '未登录，跳转到登录页等待人工登录');
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      if (!location.href.includes('/login')) {
        window.location.href = '${LOGIN_URL}';
      }
    })();`,
  });
  let lastNotify = Date.now();
  const start = Date.now();
  while (Date.now() - start < LOGIN_WAIT_TIMEOUT) {
    await highlightLoginAnchors();
    await delay(4000);
    if (await isLoggedIn()) {
      log('LOGIN', '检测到登录成功，返回业务流程');
      return true;
    }
    if (Date.now() - lastNotify > 10_000) {
      log('LOGIN', '仍在等待人工登录...');
      lastNotify = Date.now();
    }
  }
  throw new Error('等待登录超时，请手动完成登录后重试');
}

async function ensureAutoCookies() {
  if (autoCookieStarted) return;
  try {
    await browserCommand('autoCookies:start', { profileId: PROFILE, intervalMs: 2500 });
    autoCookieStarted = true;
    log('COOKIE', 'autoCookies:start 已启用');
  } catch (err) {
    log('COOKIE', `自动保存 cookie 启动失败：${err.message}`);
  }
}

async function reportCookieStatus(tag = 'COOKIE') {
  try {
    const [cookiesResp, statusResp] = await Promise.all([
      browserCommand('getCookies', { profileId: PROFILE }),
      browserCommand('autoCookies:status', { profileId: PROFILE }),
    ]);
    const cookies = Array.isArray(cookiesResp?.cookies) ? cookiesResp.cookies : [];
    const autoEnabled = Boolean(statusResp?.ok ?? statusResp?.value ?? statusResp?.status);
    const preview = cookies.slice(0, 3).map((c) => c.name).join(', ');
    log(tag, `Cookie ${cookies.length} 个 ｜ auto=${autoEnabled ? 'ON' : 'OFF'} ｜ 示例: ${preview || '无'}`);
  } catch (err) {
    log(tag, `Cookie 状态检查失败：${err.message}`);
  }
}

async function prepareKeyword(keyword) {
  currentKeyword = keyword;
  await ensureBrowserSession(keyword);
  await ensureLoggedIn(keyword);
  await ensureAutoCookies();
  await reportCookieStatus();
  await ensureSearch(keyword);
}

async function ensureSearch(keyword) {
  let url = await getCurrentUrl();
  if (!url.includes('/search_result')) {
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.location.href = '${buildSearchUrl(keyword)}';`,
    });
    await delay(4000);
  }
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const input = document.querySelector('#search-input, input[type="search"]');
      if (input) {
        input.value = '${keyword.replace(/'/g, "\\'")}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } else {
        window.location.href = 'https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(
          keyword,
        )}&source=web_search_result_notes';
      }
    })();`,
  });
  await delay(3500);
}

async function matchContainers(targetUrl = null) {
  let url = targetUrl || (await getCurrentUrl());
  if (!url || !url.startsWith('http')) {
    url = buildSearchUrl(currentKeyword);
  }
  const match = await controllerAction('containers:match', {
    profile: PROFILE,
    url,
    maxDepth: 3,
    maxChildren: 8,
  });
  return mapTree(match?.snapshot?.container_tree);
}

async function collectSearchItems(existing, keyword) {
  let tree = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      tree = await matchContainers(buildSearchUrl(keyword));
    } catch (err) {
      log('WARN', `containers:match 失败（${err.message}），尝试刷新搜索页`);
      await ensureSearch(keyword);
      await delay(2000);
      continue;
    }
    if (!tree || tree.defId !== SEARCH_ROOT_ID) {
      await ensureSearch(keyword);
      await delay(2000);
      tree = null;
      continue;
    }
    break;
  }
  if (!tree) return [];
  const listNode = findNodeByDefId(tree, SEARCH_LIST_ID);
  if (!listNode) return [];
  const inspected = await inspectContainer(listNode.id, 80);
  const effective = mapTree(inspected) || mapTree(listNode);
  const itemNodes = collectNodesByDefId(effective, SEARCH_ITEM_ID);
  const items = [];
  for (const node of itemNodes) {
    if (!node.id) continue;
    try {
      const result = await executeOperation(node.id, 'extract');
      const meta = (result?.extracted || result?.data?.extracted || [])[0] || {};
      const noteId = meta.note_id || meta.noteId;
      if (!noteId || existing.has(noteId)) continue;
      existing.add(noteId);
      items.push({ nodeId: node.id, meta });
    } catch (err) {
      log('WARN', `列表项提取失败: ${err.message}`);
    }
  }
  return items;
}

async function openDetail(item) {
  await executeOperation(item.nodeId, 'highlight', { style: '2px solid #ea4335', duration: 1200 });
  await executeOperation(item.nodeId, 'navigate', { wait_after_ms: 1200 });
  for (let i = 0; i < 10; i++) {
    const tree = await matchContainers();
    if (tree && (tree.defId === 'xiaohongshu_detail' || findNodeByDefId(tree, DETAIL_MODAL_ID))) {
      return tree;
    }
    await delay(500);
  }
  return null;
}

async function ensureDetailFocus() {
  for (let i = 0; i < 5; i++) {
    const tree = await matchContainers();
    if (tree && (tree.defId === 'xiaohongshu_detail' || findNodeByDefId(tree, DETAIL_MODAL_ID))) {
      return tree;
    }
    await delay(800);
  }
  return null;
}

async function closeDetail() {
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const closeBtn = document.querySelector('.note-detail-mask [class*="close"], .note-detail .close');
      if (closeBtn) {
        closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'button';
      }
      window.history.back();
      return 'history';
    })();`,
  });
  await delay(1500);
}

async function scrollComments(sectionId) {
  for (let i = 0; i < 6; i++) {
    await executeOperation(sectionId, 'scroll', { direction: 'down', distance: 600 });
    await delay(500);
    await executeOperation(sectionId, 'find-child', { container_id: DETAIL_SHOW_MORE_ID });
    await delay(400);
  }
}

async function collectComments(sectionNode) {
  const inspected = await inspectContainer(sectionNode.id, 160);
  const effective = mapTree(inspected) || sectionNode;
  const commentNodes = collectNodesByDefId(effective, DETAIL_COMMENT_ITEM_ID);
  const endNode = findNodeByDefId(effective, DETAIL_COMMENT_END_ID);
  const emptyNode = findNodeByDefId(effective, DETAIL_COMMENT_EMPTY_ID);
  const rows = [];
  for (const node of commentNodes) {
    if (!node.id) continue;
    try {
      const result = await executeOperation(node.id, 'extract');
      const info = (result?.extracted || result?.data?.extracted || [])[0];
      if (info) rows.push(info);
    } catch (err) {
      log('WARN', `评论提取失败：${err.message}`);
    }
  }
  return { rows, reachedEnd: Boolean(endNode), isEmpty: Boolean(emptyNode) };
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testKeyword(keyword) {
  currentKeyword = keyword;
  log('INIT', `=== 测试关键字：${keyword} ===`);
  await prepareKeyword(keyword);

  const seenIds = new Set();
  const items = await collectSearchItems(seenIds, keyword);
  if (!items.length) {
    log('ERROR', '列表为空，无法测试');
    return;
  }

  const targets = items.slice(0, TEST_COUNT);
  for (let index = 0; index < targets.length; index++) {
    const item = targets[index];
    const noteId = item.meta.note_id || item.meta.noteId || `note_${index}`;
    log('TEST', `处理笔记 ${index + 1}: ${item.meta.title || noteId}`);
    const detailTree = await openDetail(item);
    if (!detailTree) {
      log('WARN', '无法进入详情，跳过');
      continue;
    }
    const modalNode = findNodeByDefId(detailTree, DETAIL_MODAL_ID) || detailTree;
    const headerNode = findNodeByDefId(modalNode, DETAIL_HEADER_ID);
    const contentNode = findNodeByDefId(modalNode, DETAIL_CONTENT_ID);
    const commentSectionNode = findNodeByDefId(modalNode, DETAIL_COMMENT_SECTION_ID);

    if (headerNode?.id) {
      const result = await executeOperation(headerNode.id, 'extract');
      const info = (result?.extracted || [])[0] || {};
      log('INFO', `作者信息：${info.author_name || '未知'} | ${info.author_link || ''}`);
    }
    if (contentNode?.id) {
      const result = await executeOperation(contentNode.id, 'extract');
      const info = (result?.extracted || [])[0] || {};
      log('INFO', `正文标题：${info.title || '无'} / 长度：${(info.text || '').length}`);
    }
    if (commentSectionNode?.id) {
      log('ACTION', '滚动评论并展开回复...');
      await scrollComments(commentSectionNode.id);
      const { rows, reachedEnd, isEmpty } = await collectComments(commentSectionNode);
      log(
        'COMMENT',
        `共提取 ${rows.length} 条评论 ｜ THE END: ${reachedEnd ? '是' : '否'} ｜ 空状态: ${isEmpty ? '是' : '否'}`,
      );
      rows.slice(0, 5).forEach((row, idx) => {
        log('COMMENT', `  [${idx + 1}] ${row.user_name || row.user || '匿名'} (${row.user_id || ''}) -> ${row.text || ''}`);
      });
    } else {
      log('WARN', '未找到评论容器');
    }

    await closeDetail();
    await ensureSearch(keyword);
  }
}

async function main() {
  const rounds = Number.isFinite(ROUNDS_PER_EXECUTION) && ROUNDS_PER_EXECUTION > 0 ? Math.floor(ROUNDS_PER_EXECUTION) : 1;
  try {
    for (let round = 0; round < rounds; round++) {
      const { keyword, totalRuns, rotationReset } = await pickKeywordForRound();
      log(
        'ROUND',
        `第 ${round + 1}/${rounds} 轮 ｜ 使用关键字「${keyword}」 (历史第 ${totalRuns} 次${rotationReset ? '，完成一轮轮换' : ''})`,
      );
      await testKeyword(keyword);
    }
    log('DONE', '评论测试完成');
  } catch (err) {
    console.error('[ERROR]', err);
    process.exitCode = 1;
  }
}

main();
