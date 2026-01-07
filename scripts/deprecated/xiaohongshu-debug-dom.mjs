#!/usr/bin/env node
/**
 * 调试DOM结构，看看列表项的真实结构
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const script = `(() => {
  const items = [];
  const els = document.querySelectorAll('.note-item');
  
  console.log('找到列表项数量:', els.length);
  
  for (let i = 0; i < Math.min(3, els.length); i++) {
    const el = els[i];
    
    const info = {
      index: i,
      outerHTML: el.outerHTML.substring(0, 500),
      hasLink: !!el.querySelector('a'),
      linkHref: el.querySelector('a')?.href || null,
      clickable: el.onclick !== null || el.querySelector('[onclick]') !== null,
      classList: Array.from(el.classList),
      children: Array.from(el.children).map(c => ({
        tag: c.tagName,
        classes: Array.from(c.classList)
      }))
    };
    
    items.push(info);
  }
  
  return items;
})()`;

async function main() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  const items = result.data?.result || [];
  
  console.log('===== DOM结构调试 =====');
  console.log(JSON.stringify(items, null, 2));
}

main();
