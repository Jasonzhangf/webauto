#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 用 Unified API（HTTP）获取当前页面的 DOM/状态摘要，便于定位脚本失败原因。
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/ws-dom-dump.mjs --profile xiaohongshu_batch-2
 */

import minimist from 'minimist';

const UNIFIED_API = 'http://127.0.0.1:7701';

async function post(action, payload) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data.data || data;
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const profile = String(args.profile || args.session || '').trim();
  if (!profile) {
    console.error('❌ 必须提供 --profile');
    process.exit(1);
  }

  const result = await post('browser:execute', {
    profile,
    script: `(() => {
      const url = location.href;
      const title = document.title;
      const readyState = document.readyState;
      const text = (document.body && document.body.innerText ? document.body.innerText.slice(0, 1200) : '');
      const hasDetailMask = !!document.querySelector('.note-detail-mask');
      const hasSearchInput = !!document.querySelector('#search-input, input[type="search"], input[placeholder*="搜索"]');
      return { url, title, readyState, hasDetailMask, hasSearchInput, text };
    })()`,
  });

  console.log(JSON.stringify(result?.result || result, null, 2));
}

main().catch((e) => {
  console.error('❌ ws-dom-dump failed:', e?.message || String(e));
  process.exit(1);
});

