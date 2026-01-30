#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 诊断 Phase2 停止问题
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkScrollState() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const listEl = document.querySelector('.search-result-container, .feeds-page, section[class*="note-item"], .masonry, .waterfall');
        const items = Array.from(document.querySelectorAll('section[class*="note-item"], a[class*="note-item"], .note-item, [data-v-*][class*="item"]'));
        const scrollY = window.scrollY;
        const bodyHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const endMarker = document.body.textContent.includes('- THE END -') || document.body.textContent.includes('没有更多了') || document.body.textContent.includes('已经到底了');
        
        return {
          hasList: !!listEl,
          itemCount: items.length,
          scrollY,
          bodyHeight,
          viewportHeight,
          isAtBottom: scrollY + viewportHeight >= bodyHeight - 500,
          hasEndMarker: endMarker,
          currentUrl: window.location.href
        };
      })()`
    }
  });
  return result.data;
}

async function main() {
  console.log('🔍 诊断 Phase2 停止问题\n');
  
  const state = await checkScrollState();
  console.log('📊 当前页面状态:');
  console.log(JSON.stringify(state, null, 2));
  
  if (state.isAtBottom) {
    console.log('\n⚠️ 已经到达页面底部');
  }
  
  if (state.hasEndMarker) {
    console.log('\n⚠️ 检测到结束标记');
  }
  
  if (!state.hasList) {
    console.log('\n❌ 没有找到搜索结果列表容器');
  } else {
    console.log(`\n✅ 搜索结果容器已找到，可见条目数: ${state.itemCount}`);
  }
  
  console.log(`\n📍 当前URL: ${state.currentUrl}`);
}

main().catch(console.error);
