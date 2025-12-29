#!/usr/bin/env node

/**
 * 通用高亮自检命令
 * - 自动获取当前页面中心元素
 * - 使用 runtime.dom.buildPathForElement 生成 dom path
 * - 生成 selector
 * - 依次执行容器高亮 + DOM 高亮
 */

import fs from 'node:fs';

const API_BASE = 'http://127.0.0.1:7701';
const LOG_FILE = '/tmp/webauto-highlight-self-check.log';

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
  } catch {}
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, error: text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function main() {
  log('=== Highlight Self-Check ===');

  const sessions = await getJson(`${API_BASE}/v1/session/list`);
  const session = sessions?.sessions?.[0] || sessions?.data?.sessions?.[0];
  if (!session?.profileId) {
    throw new Error('No active session found. Please start browser first.');
  }
  const profile = session.profileId;
  const url = session.current_url || session.currentUrl || '';
  log(`Active session: ${profile}`);
  if (url) log(`Current URL: ${url}`);

  // 1) 从当前页面中心点获取元素 + 生成 selector + dom path (使用 runtime 内置逻辑)
  const pickerScript = `(() => {
    const runtime = window.__webautoRuntime;
    if (!runtime?.dom?.buildPathForElement) {
      return { error: 'buildPathForElement not available' };
    }
    const pickElement = () => {
      const x = Math.floor(window.innerWidth / 2);
      const y = Math.floor(window.innerHeight / 2);
      return document.elementFromPoint(x, y) || document.body || document.documentElement;
    };
    const buildSelector = (el) => {
      if (!el) return null;
      if (el.id) return '#' + CSS.escape(el.id);
      const tag = (el.tagName || 'div').toLowerCase();
      const cls = (el.classList && el.classList.length) ? el.classList[0] : '';
      return cls ? tag + '.' + CSS.escape(cls) : tag;
    };
    const el = pickElement();
    return {
      tag: el?.tagName || null,
      id: el?.id || null,
      className: el?.className || null,
      selector: buildSelector(el),
      path: runtime.dom.buildPathForElement(el, null),
    };
  })()`;

  const pickRes = await postJson(`${API_BASE}/v1/browser/execute`, {
    profile,
    script: pickerScript,
  });

  if (!pickRes.ok || !pickRes.data?.success) {
    throw new Error(`Pick element failed: ${pickRes.data?.error || pickRes.status}`);
  }

  const picked = pickRes.data.data?.result || pickRes.data.result || pickRes.data;
  if (picked.error) {
    throw new Error(picked.error);
  }

  const selector = picked.selector;
  const path = picked.path;

  log(`Picked element: tag=${picked.tag} id=${picked.id || '-'} class=${picked.className || '-'}`);
  log(`Selector: ${selector || 'N/A'}`);
  log(`DOM Path: ${path || 'N/A'}`);

  if (!selector || !path) {
    throw new Error('Failed to build selector or path from current page');
  }

  // 2) 容器高亮（selector）
  const containerRes = await postJson(`${API_BASE}/v1/browser/highlight`, {
    profile,
    selector,
    options: { channel: 'container', sticky: true },
    color: 'green',
  });
  log(`Container highlight: status=${containerRes.status} result=${JSON.stringify(containerRes.data)}`);

  // 3) DOM 高亮（path）
  const domRes = await postJson(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile,
    path,
    options: { channel: 'dom', sticky: true },
    color: 'blue',
  });
  log(`DOM highlight: status=${domRes.status} result=${JSON.stringify(domRes.data)}`);

  log('Self-check complete.');
}

main().catch((err) => {
  log(`ERROR: ${err?.message || err}`);
  process.exit(1);
});
