#!/usr/bin/env node
/**
 * DOM 高亮回环测试：
 * 1) 获取 DOM 树中的一个 path
 * 2) 调用 /v1/browser/highlight-dom-path
 * 3) 通过 /v1/controller/action(dom:pick:2) 获取 dom_path 回环
 * 4) 清理高亮
 */

const API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, raw: text };
  }
}

async function getDomTree() {
  const res = await post('/v1/controller/action', { action: 'containers:inspect', payload: { profile: PROFILE } });
  if (!res?.success) return null;
  return res.data?.domTree || res.data?.snapshot?.dom_tree || null;
}

function findFirstPath(node) {
  if (!node) return null;
  if (node.path && node.path !== 'root') return node.path;
  for (const child of node.children || []) {
    const path = findFirstPath(child);
    if (path) return path;
  }
  return null;
}

async function main() {
  console.log('[dom-loop] fetching dom tree...');
  const domTree = await getDomTree();
  if (!domTree) {
    console.log('[dom-loop] failed to load dom tree');
    process.exit(1);
  }
  const domPath = findFirstPath(domTree);
  if (!domPath) {
    console.log('[dom-loop] no dom_path found');
    process.exit(1);
  }
  console.log('[dom-loop] using dom_path:', domPath);

  console.log('[dom-loop] highlight-dom-path...');
  const highlightRes = await post('/v1/browser/highlight-dom-path', {
    profile: PROFILE,
    path: domPath,
    style: '2px solid blue',
    options: { channel: 'dom', sticky: true }
  });
  console.log('[dom-loop] highlight result:', highlightRes);

  console.log('[dom-loop] pick-dom via controller...');
  const pickRes = await post('/v1/controller/action', {
    action: 'dom:pick:2',
    payload: { profile: PROFILE }
  });
  console.log('[dom-loop] pick result:', pickRes);

  console.log('[dom-loop] clear highlight...');
  const clearRes = await post('/v1/browser/clear-highlight', {
    profile: PROFILE,
    channel: 'dom'
  });
  console.log('[dom-loop] clear result:', clearRes);
}

main().catch(err => {
  console.error('dom-loop failed:', err);
  process.exit(1);
});
