#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书爬虫 - 修正版
 * 基于真实DOM结构适配
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_COUNT = 3; // 先采集3个测试

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

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

async function getCurrentUrl() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href` }
  })).data?.result || '';
}

// 提取列表项 - 修正版
async function extractList(startIndex = 0) {
  const script = `(() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    
    for (let i = ${startIndex}; i < els.length; i++) {
      const el = els[i];
      
      // 找隐藏的第一个a标签，它包含真实的explore链接
      const hiddenLink = el.querySelector('a[href^="/explore/"]');
      const noteId = hiddenLink ? hiddenLink.href.match(/\\/explore\\/([a-f0-9]+)/)?.[1] : '';
      
      // 获取标题文本
      const title = el.textContent.trim().substring(0, 50);
      
      items.push({
        index: i,
        noteId: noteId || '',
        title: title
      });
    }
    
    return items;
  })()`;

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  return result.data?.result || [];
}

// 点击详情页 - 使用第二个可见的链接
async function clickDetail(index) {
  const script = `(() => {
    const els = document.querySelectorAll('.note-item');
    const el = els[${index}];
    if (!el) return false;
    
    // 找第二个可点击的链接（class="cover mask ld"）
    const link = el.querySelector('a.cover');
    if (link) {
      link.click();
      return true;
    }
    
    return false;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result;
}

// 检查详情页是否有效
async function checkDetailValid() {
  const script = `(() => {
    const bodyText = document.body.textContent;
    
    if (bodyText.includes('暂时无法浏览') || bodyText.includes('无法访问') || bodyText.includes('404')) {
      return { valid: false, reason: '帖子无法访问' };
    }
    
    // 检查是否有内容或图片
    const hasContent = !!document.querySelector('.desc, .note-content');
    const hasImages = document.querySelectorAll('img[src*="sns-img"]').length > 0;
    
    if (!hasContent && !hasImages) {
      return { valid: false, reason: '无内容' };
    }
    
    return { valid: true };
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || { valid: false };
}

// 提取详情数据
async function extractDetail() {
  const script = `(() => {
    const data = {
      title: '',
      content: '',
      author: '',
      images: []
    };
    
    // 标题
    const titleSelectors = ['.title, #detail-title, h1'];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        data.title = el.textContent.trim();
        break;
      }
    }
    
    // 内容
    const contentSelectors = ['.desc, .note-content, #detail-desc'];
    for (const sel of contentSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        data.content = el.textContent.trim();
        break;
      }
    }
    
    // 作者
    const authorEl = document.querySelector('.author-container .name, .username');
    if (authorEl) data.author = authorEl.textContent.trim();
    
    // 图片
    const imgs = document.querySelectorAll('img[src*="sns-img"]');
    imgs.forEach(img => {
      if (img.src && !data.images.includes(img.src)) {
        data.images.push(img.src);
      }
    });
    
    return data;
  })()`;

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  return result.data?.result || {};
}

// 关闭详情页
async function closeDetail() {
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'key',
      target: { key: 'Escape' }
    }
  });
  
  await delay(1000);
}

// 滚动列表
async function scrollList() {
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'scroll',
      target: { deltaY: 800 }
    }
  });
}

async function main() {
  try {
    log('INIT', '=== 小红书爬虫（修正版）===');
    log('INIT', `目标: ${TARGET_COUNT} 个帖子`);
    
    const collectedItems = [];
    const collectedIds = new Set();
    let processedIndex = 0;
    let noNewCount = 0;
    const MAX_NO_NEW = 5;
    
    while (collectedItems.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
      // 获取列表
      const items = await extractList(processedIndex);
      
      if (items.length === 0) {
        noNewCount++;
        log('SCROLL', `无新项目，滚动 (${noNewCount}/${MAX_NO_NEW})`);
        await scrollList();
        await delay(2000);
        continue;
      }
      
      log('LIST', `找到 ${items.length} 个项目，从索引 ${processedIndex} 开始`);
      noNewCount = 0;
      
      for (const item of items) {
        if (collectedItems.length >= TARGET_COUNT) break;
        
        processedIndex = Math.max(processedIndex, item.index + 1);
        
        if (!item.noteId || collectedIds.has(item.noteId)) {
          log('SKIP', `跳过重复或无效: ${item.title}`);
          continue;
        }
        
        log('PROCESS', `[${item.index}] ${item.title}`);
        
        // 点击
        const clicked = await clickDetail(item.index);
        if (!clicked) {
          log('WARN', '点击失败');
          continue;
        }
        
        await delay(3000);
        
        // 检查有效性
        const validity = await checkDetailValid();
        if (!validity.valid) {
          log('SKIP', `无效: ${validity.reason}`);
          await closeDetail();
          await delay(1500);
          continue;
        }
        
        // 提取数据
        const data = await extractDetail();
        
        log('EXTRACT', `标题: ${data.title || '(无)'}`);
        log('EXTRACT', `内容: ${data.content?.length || 0} 字符`);
        log('EXTRACT', `图片: ${data.images?.length || 0} 张`);
        
        collectedItems.push({
          noteId: item.noteId,
          ...data
        });
        
        collectedIds.add(item.noteId);
        
        log('SUCCESS', `✅ 已采集 ${collectedItems.length}/${TARGET_COUNT}`);
        
        await closeDetail();
        await delay(1500);
      }
      
      // 滚动加载更多
      log('SCROLL', '滚动加载更多...');
      await scrollList();
      await delay(2000);
    }
    
    log('DONE', `=== 采集完成: ${collectedItems.length} 个帖子 ===`);
    
    // 输出采集结果
    collectedItems.forEach((item, i) => {
      console.log(`\n----- 帖子 ${i + 1} -----`);
      console.log(`ID: ${item.noteId}`);
      console.log(`标题: ${item.title}`);
      console.log(`作者: ${item.author}`);
      console.log(`内容: ${item.content?.substring(0, 100)}...`);
      console.log(`图片: ${item.images?.length || 0} 张`);
    });

  } catch (err) {
    log('ERROR', `失败: ${err.message}`);
    console.error(err);
  }
}

main();
