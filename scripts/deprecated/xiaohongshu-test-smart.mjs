#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书爬虫智能测试 - 自动跳过无效帖子
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

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

async function extractList() {
  const script = `(() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const linkEl = el.querySelector('a');
      const href = linkEl ? linkEl.href : '';
      let noteId = '';
      
      if (href) {
        const match = href.match(/\\/explore\\/([a-f0-9]+)/);
        if (match) noteId = match[1];
      }
      
      const title = el.textContent.substring(0, 50).trim();
      
      items.push({ index: i, noteId, title, hasLink: !!linkEl });
    }
    
    return items;
  })()`;

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  return result.data?.result || [];
}

async function clickDetail(index) {
  const clickScript = `(() => {
    const els = document.querySelectorAll('.note-item');
    const el = els[${index}];
    if (el) {
      const link = el.querySelector('a') || el;
      link.click();
      return true;
    }
    return false;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: clickScript }
  })).data?.result;
}

async function checkDetailValid() {
  const script = `(() => {
    // 检查是否有"暂时无法浏览"的提示
    const bodyText = document.body.textContent;
    if (bodyText.includes('暂时无法浏览') || bodyText.includes('无法访问')) {
      return { valid: false, reason: '帖子无法访问' };
    }
    
    // 检查是否有实际内容
    const hasContent = !!document.querySelector('.desc, .note-content, #detail-desc');
    const hasImages = document.querySelectorAll('img[src*="sns-img"]').length > 0;
    
    if (!hasContent && !hasImages) {
      return { valid: false, reason: '无内容和图片' };
    }
    
    return { valid: true };
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || { valid: false, reason: '未知' };
}

async function extractDetail() {
  const script = `(() => {
    const data = {
      title: '',
      content: '',
      images: [],
      author: ''
    };
    
    const titleEl = document.querySelector('.title, #detail-title, [class*="Note"] h1');
    if (titleEl) data.title = titleEl.textContent.trim();
    
    const contentEl = document.querySelector('.desc, .note-content, #detail-desc, [class*="Note"] .content');
    if (contentEl) data.content = contentEl.textContent.trim();
    
    const authorEl = document.querySelector('.author-container .name, .username, [class*="Author"] .name');
    if (authorEl) data.author = authorEl.textContent.trim();
    
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

async function closeDetail() {
  // 尝试ESC键
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

async function main() {
  try {
    log('INIT', '=== 小红书爬虫智能测试 ===');
    
    // 1. 获取列表
    const items = await extractList();
    log('LIST', `找到 ${items.length} 个帖子`);
    
    if (items.length === 0) {
      log('ERROR', '没有找到帖子');
      return;
    }
    
    // 2. 尝试点击前几个帖子，找到第一个有效的
    let validDetail = null;
    let validIndex = -1;
    
    for (let i = 0; i < Math.min(5, items.length); i++) {
      log('TRY', `尝试第 ${i} 个帖子: ${items[i].title}`);
      
      const clicked = await clickDetail(i);
      if (!clicked) {
        log('TRY', `点击失败，跳过`);
        continue;
      }
      
      await delay(3000);
      
      const validity = await checkDetailValid();
      
      if (validity.valid) {
        log('SUCCESS', `找到有效帖子，索引: ${i}`);
        validIndex = i;
        validDetail = await extractDetail();
        break;
      } else {
        log('SKIP', `帖子无效: ${validity.reason}，关闭并尝试下一个`);
        await closeDetail();
        await delay(1500);
      }
    }
    
    if (!validDetail) {
      log('ERROR', '前5个帖子都无法访问');
      return;
    }
    
    // 3. 输出提取到的数据
    log('DETAIL', `===== 帖子详情 =====`);
    log('DETAIL', `标题: ${validDetail.title}`);
    log('DETAIL', `作者: ${validDetail.author}`);
    log('DETAIL', `内容长度: ${validDetail.content?.length || 0} 字符`);
    log('DETAIL', `图片数量: ${validDetail.images?.length || 0}`);
    
    if (validDetail.content) {
      log('DETAIL', `内容预览: ${validDetail.content.substring(0, 100)}...`);
    }
    
    if (validDetail.images && validDetail.images.length > 0) {
      log('DETAIL', `第一张图: ${validDetail.images[0]}`);
    }
    
    log('DONE', '✅ 测试完成');

  } catch (err) {
    log('ERROR', `测试失败: ${err.message}`);
    console.error(err);
  }
}

main();
