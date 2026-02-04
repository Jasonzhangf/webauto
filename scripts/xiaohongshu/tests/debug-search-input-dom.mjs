#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';
ensureUtf8Console();

/**
 * debug-search-input-dom.mjs
 *
 * 目的：在 Camoufox 下精准分析搜索输入框的 DOM 结构，并输出可用于 readSearchInputValue 的 selector 方案。
 * 只读，不做任何点击/输入。
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/debug-search-input-dom.mjs --profile xiaohongshu_batch-1
 */

import minimist from 'minimist';
import { controllerAction } from '../../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';

const UNIFIED_API = 'http://127.0.0.1:7701';

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const profile = String(args.profile || args.session || 'xiaohongshu_batch-1');

  const script = `(() => {
    const candidates = [];

    function add(label, el) {
      if (!el) return;
      const r = el.getBoundingClientRect?.();
      candidates.push({
        label,
        tag: el.tagName,
        id: el.id || null,
        className: (el.className && String(el.className)) || null,
        type: el.getAttribute && el.getAttribute('type'),
        placeholder: el.getAttribute && el.getAttribute('placeholder'),
        name: el.getAttribute && el.getAttribute('name'),
        role: el.getAttribute && el.getAttribute('role'),
        ariaLabel: el.getAttribute && el.getAttribute('aria-label'),
        contenteditable: el.getAttribute && el.getAttribute('contenteditable'),
        value: ('value' in el) ? (el.value ?? null) : null,
        text: (el.textContent || '').slice(0, 120),
        rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        visible: !!(r && r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0),
      });
    }

    add('#search-input', document.querySelector('#search-input'));
    add('input[type=search]', document.querySelector('input[type="search"]'));
    add('input[placeholder*="搜索"]', document.querySelector('input[placeholder*="搜索"]'));
    add('input[placeholder*="关键字"]', document.querySelector('input[placeholder*="关键字"]'));

    // Common XHS home search patterns
    add('[data-testid*=search]', document.querySelector('[data-testid*="search"]'));
    add('[class*=search] input', document.querySelector('[class*="search"] input'));
    add('header input', document.querySelector('header input'));
    add('header [contenteditable=true]', document.querySelector('header [contenteditable="true"]'));

    // Enumerate top-level inputs in header for debugging
    const header = document.querySelector('header');
    if (header) {
      const inputs = Array.from(header.querySelectorAll('input,textarea,[contenteditable="true"],[contenteditable=""]')).slice(0, 20);
      for (let i = 0; i < inputs.length; i++) add('header_candidates[' + i + ']', inputs[i]);
    }

    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      candidates,
    };
  })()`;

  const res = await controllerAction(
    'browser:execute',
    { profile, script },
    UNIFIED_API,
  );

  const out = res?.result || res?.data?.result || res;
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error('❌ debug-search-input-dom failed:', e?.message || String(e));
  process.exit(1);
});
