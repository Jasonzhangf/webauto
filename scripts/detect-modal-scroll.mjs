#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 探测模态框滚动容器
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function main() {
  // 1. 打开第一个笔记
  console.log('Opening note...');
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const item = document.querySelector('.note-item');
        if (item) item.querySelector('img').click();
      })()`
    }
  });
  
  await new Promise(r => setTimeout(r, 4000));

  // 2. 探测滚动容器
  console.log('Detecting scroll container...');
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        // 查找可能包含滚动的容器
        const candidates = Array.from(document.querySelectorAll(
          '.note-detail-container, .note-container, .note-detail, .mask, .overlay, [class*="container"]'
        ));
        
        // 筛选出有滚动条的元素
        const scrollable = candidates.filter(el => {
          const style = window.getComputedStyle(el);
          return (el.scrollHeight > el.clientHeight) && 
                 (style.overflowY === 'auto' || style.overflowY === 'scroll');
        });
        
        return scrollable.map(el => ({
          className: el.className,
          id: el.id,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight
        }));
      })()`
    }
  });
  
  console.log('Scrollable containers:', JSON.stringify(result.data?.result, null, 2));
}

main().catch(console.error);
