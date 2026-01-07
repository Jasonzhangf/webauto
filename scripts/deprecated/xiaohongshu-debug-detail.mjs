#!/usr/bin/env node
/**
 * 调试详情页切换问题
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

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 点击第1个帖子
  console.log('=== 点击第1个帖子 ===');
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { 
      profile: PROFILE, 
      script: `document.querySelectorAll('.note-item')[1].querySelector('a.cover').click()` 
    }
  });
  
  await delay(3000);
  
  // 获取URL和标题
  const result1 = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { 
      profile: PROFILE, 
      script: `({ url: location.href, title: document.querySelector('.title, h1')?.textContent.trim() })` 
    }
  });
  
  console.log('URL:', result1.data.result.url);
  console.log('标题:', result1.data.result.title);
  
  // 按ESC关闭
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'key',
      target: { key: 'Escape' }
    }
  });
  
  await delay(2000);
  
  // 点击第2个帖子
  console.log('\n=== 点击第2个帖子 ===');
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { 
      profile: PROFILE, 
      script: `document.querySelectorAll('.note-item')[2].querySelector('a.cover').click()` 
    }
  });
  
  await delay(3000);
  
  // 获取URL和标题
  const result2 = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { 
      profile: PROFILE, 
      script: `({ url: location.href, title: document.querySelector('.title, h1')?.textContent.trim() })` 
    }
  });
  
  console.log('URL:', result2.data.result.url);
  console.log('标题:', result2.data.result.title);
}

main();
