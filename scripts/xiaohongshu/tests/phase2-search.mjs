#!/usr/bin/env node
/**
 * Phase 2：搜索页验证脚本
 * - 假设 Phase 1 已运行并登录成功（已有 headful session）
 * - 轮换关键词，定位搜索框并输入
 * - 验证 `xiaohongshu_search.search_result_list` / `search_result_item` 是否命中
 * - 高亮前两个笔记，输出数量
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];
const SEARCH_ROOT_ID = 'xiaohongshu_search';
const SEARCH_BAR_ID = 'xiaohongshu_search.search_bar';
const SEARCH_LIST_ID = 'xiaohongshu_search.search_result_list';
const SEARCH_ITEM_ID = 'xiaohongshu_search.search_result_item';
const KEYWORD_GROUP_INTERVAL = 3;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const KEYWORD_STATE_FILE = path.join(repoRoot, 'output', 'xiaohongshu-keyword-rotation.json');

function buildSearchUrl(keyword) {
  return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes&type=51`;
}

function log(step, message) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${message}`);
}

async function post(endpoint, data) {
  let res;
  try {
    res = await fetch(`${UNIFIED_API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) {
    const connectionIssue = err?.cause?.code === 'ECONNREFUSED';
    const hint = connectionIssue
      ? '无法连接 Unified API：请先运行 Phase1 (scripts/xiaohongshu/tests/phase1-session-login.mjs) 并保持浏览器会话常驻。'
      : '';
    throw new Error(`${err.message}${hint ? ` ｜ ${hint}` : ''}`);
  }
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
  if (payload.data) return unwrapData(payload.data);
  return payload;
}

async function controllerAction(action, payload = {}) {
  const result = await post('/v1/controller/action', { action, payload });
  if (result && result.success === false) {
    throw new Error(result.error || `controller action ${action} failed`);
  }
  return unwrapData(result);
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
    currentUrl: session.current_url || session.currentUrl || null,
  };
}

async function ensureSessionExists() {
  const sessions = extractSessions(await controllerAction('session:list', {}));
  const match = sessions.map(normalizeSession).find((s) => s?.profileId === PROFILE);
  if (!match) {
    throw new Error(`未检测到 ${PROFILE} 会话，请先运行 Phase1 (scripts/xiaohongshu/tests/phase1-session-login.mjs)`);
  }
  log('SESSION', `复用会话，当前 URL: ${match.currentUrl || '未知'}`);
  return match;
}

async function getCurrentUrl() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'location.href',
  });
  return result?.result || result || '';
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

async function ensureLoggedIn() {
  if (!(await isLoggedIn())) {
    throw new Error('当前未登录，请先运行 Phase1 并完成人工登录');
  }
}

async function fillSearch(keyword) {
  log('SEARCH', `输入关键字：${keyword}`);
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const input = document.querySelector('#search-input, input[type=\"search\"]');
      if (!input) return false;
      input.focus();
      input.value = '${keyword.replace(/'/g, "\\'")}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })();`,
  });
  await delay(3500);
}

async function matchContainers(targetUrl) {
  const url = targetUrl || (await getCurrentUrl());
  const result = await controllerAction('containers:match', {
    profile: PROFILE,
    url,
    maxDepth: 3,
    maxChildren: 8,
  });
  return mapTree(result?.snapshot?.container_tree);
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

async function inspectContainer(containerId, maxChildren = 80) {
  const snapshot = await controllerAction('containers:inspect-container', {
    profile: PROFILE,
    containerId,
    maxChildren,
  });
  return mapTree(snapshot?.snapshot?.container_tree);
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

async function highlightNodes(nodes, limit = 2) {
  for (const node of nodes.slice(0, limit)) {
    if (!node.id) continue;
    await controllerAction('container:operation', {
      containerId: node.id,
      operationId: 'highlight',
      config: { style: '2px solid #34a853', duration: 1200 },
      sessionId: PROFILE,
    });
  }
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

async function pickKeyword() {
  const state = await loadKeywordState();
  const idx = Number.isInteger(state.nextIndex) ? state.nextIndex % KEYWORDS.length : 0;
  const keyword = KEYWORDS[idx] || KEYWORDS[0];
  const totalRuns = (state.totalRuns || 0) + 1;
  const updated = { nextIndex: (idx + 1) % KEYWORDS.length, totalRuns };
  await saveKeywordState(updated);
  return { keyword, totalRuns, rotationReset: totalRuns % KEYWORD_GROUP_INTERVAL === 0 };
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log('PHASE2', '搜索页验证开始');
  await ensureSessionExists();
  await ensureLoggedIn();
  const { keyword, totalRuns, rotationReset } = await pickKeyword();
  log('ROUND', `关键词「${keyword}」 (历史第 ${totalRuns} 次${rotationReset ? '，完成一轮轮换' : ''})`);
  await fillSearch(keyword);

  const tree = await matchContainers(buildSearchUrl(keyword));
  if (!tree || tree.defId !== SEARCH_ROOT_ID) {
    throw new Error('搜索根容器未匹配，检查页面是否在搜索结果');
  }
  const searchBar = findNodeByDefId(tree, SEARCH_BAR_ID);
  if (searchBar?.id) {
    await controllerAction('container:operation', {
      containerId: searchBar.id,
      operationId: 'highlight',
      config: { style: '2px solid #4285f4', duration: 1000 },
      sessionId: PROFILE,
    });
  }

  const listNode = findNodeByDefId(tree, SEARCH_LIST_ID);
  if (!listNode?.id) {
    throw new Error('未找到搜索结果列表容器');
  }
  const inspected = (await inspectContainer(listNode.id, 60)) || listNode;
  const items = collectNodesByDefId(inspected, SEARCH_ITEM_ID);
  log('RESULT', `命中搜索结果 ${items.length} 条`);
  if (!items.length) {
    throw new Error('结果列表为空，无法继续');
  }
  await highlightNodes(items, 2);
  log('PHASE2', '搜索验证完成，可继续 Phase3');
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exitCode = 1;
});
