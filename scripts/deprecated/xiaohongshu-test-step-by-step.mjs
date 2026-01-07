#!/usr/bin/env node
/**
 * 小红书爬虫功能分步测试脚本 - 改进版
 * 目标：分别验证每个小功能，不杀session
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

async function getCurrentUrl() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href` }
  })).data?.result || '';
}

/**
 * 测试1：列表项提取
 */
async function test1_extractList() {
  log('TEST1', '开始测试：列表项提取');
  
  const script = `(() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    
    for (let i = 0; i < Math.min(10, els.length); i++) {
      const el = els[i];
      const linkEl = el.querySelector('a');
      const href = linkEl ? linkEl.href : '';
      let noteId = '';
      
      if (href) {
        const match = href.match(/\\/explore\\/([a-f0-9]+)/);
        if (match) noteId = match[1];
      }
      
      const title = el.textContent.substring(0, 50).trim();
      
      items.push({
        index: i,
        noteId: noteId,
        title: title,
        hasLink: !!linkEl
      });
    }
    
    return items;
  })()`;

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  const items = result.data?.result || [];
  
  log('TEST1', `找到 ${items.length} 个列表项`);
  
  if (items.length > 0) {
    log('TEST1', `第一个项目: ${JSON.stringify(items[0], null, 2)}`);
    log('TEST1', '✅ 列表项提取测试通过');
    return items;
  } else {
    log('TEST1', '❌ 没有找到列表项');
    return [];
  }
}

/**
 * 测试2：点击进入详情页 - 改进版
 */
async function test2_clickDetail(index = 0) {
  log('TEST2', `开始测试：点击第 ${index} 个项目进入详情页`);
  
  // 点击前先检查是否已有modal
  const beforeModal = (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { 
      profile: PROFILE, 
      script: `!!document.querySelector('.note-detail-mask, .note-detail, [class*="detail-modal"]')` 
    }
  })).data?.result;
  
  log('TEST2', `点击前modal状态: ${beforeModal}`);
  
  // JS点击
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

  const clicked = (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: clickScript }
  })).data?.result;

  if (!clicked) {
    log('TEST2', '❌ 点击失败');
    return false;
  }

  log('TEST2', '点击成功，等待详情页加载...');
  await delay(3000);

  // 检查详情页是否出现
  const detailCheck = (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { 
      profile: PROFILE, 
      script: `(() => {
        const hasModal = !!document.querySelector('.note-detail-mask, .note-detail, [class*="detail"]');
        const hasTitle = !!document.querySelector('.title, #detail-title, [class*="title"]');
        const hasContent = !!document.querySelector('.desc, .note-content, #detail-desc');
        const url = location.href;
        
        return {
          hasModal,
          hasTitle,
          hasContent,
          inExplore: url.includes('/explore/')
        };
      })()` 
    }
  })).data?.result || {};
  
  log('TEST2', `详情页检测: ${JSON.stringify(detailCheck)}`);

  if (detailCheck.hasModal || detailCheck.hasTitle || detailCheck.inExplore) {
    log('TEST2', '✅ 成功打开详情页');
    return true;
  } else {
    log('TEST2', '❌ 未能打开详情页');
    return false;
  }
}

/**
 * 测试3：详情页数据提取 - 改进版
 */
async function test3_extractDetail() {
  log('TEST3', '开始测试：详情页数据提取');

  const script = `(() => {
    const data = {
      title: '',
      content: '',
      images: [],
      author: '',
      selectors_found: {}
    };
    
    // 尝试多种标题选择器
    const titleSelectors = [
      '.title',
      '#detail-title',
      '[class*="title"]',
      '.note-content .title',
      'h1'
    ];
    
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        data.title = el.textContent.trim();
        data.selectors_found.title = sel;
        break;
      }
    }
    
    // 内容
    const contentSelectors = [
      '.desc',
      '.note-content',
      '#detail-desc',
      '[class*="desc"]',
      '[class*="content"]'
    ];
    
    for (const sel of contentSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim() && el.textContent.length > 10) {
        data.content = el.textContent.trim();
        data.selectors_found.content = sel;
        break;
      }
    }
    
    // 作者
    const authorSelectors = [
      '.author-container .name',
      '.username',
      '[class*="author"] [class*="name"]'
    ];
    
    for (const sel of authorSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        data.author = el.textContent.trim();
        data.selectors_found.author = sel;
        break;
      }
    }
    
    // 图片
    const imgSelectors = [
      'img[src*="sns-img"]',
      '.note-slider-img img',
      '.carousel-container img',
      '.swiper-slide img',
      'img[class*="note"]'
    ];
    
    for (const selector of imgSelectors) {
      const imgs = document.querySelectorAll(selector);
      imgs.forEach(img => {
        if (img.src && !data.images.includes(img.src)) {
          data.images.push(img.src);
        }
      });
      if (data.images.length > 0) {
        data.selectors_found.images = selector;
        break;
      }
    }
    
    return data;
  })()`;

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  const data = result.data?.result || {};
  
  log('TEST3', `标题: ${data.title || '(未找到)'}`);
  log('TEST3', `作者: ${data.author || '(未找到)'}`);
  log('TEST3', `内容长度: ${data.content?.length || 0} 字符`);
  log('TEST3', `图片数量: ${data.images?.length || 0}`);
  log('TEST3', `使用的选择器: ${JSON.stringify(data.selectors_found || {})}`);
  
  if (data.images && data.images.length > 0) {
    log('TEST3', `第一张图片: ${data.images[0].substring(0, 100)}`);
  }

  if (data.title || data.content || (data.images && data.images.length > 0)) {
    log('TEST3', '✅ 详情页数据提取测试通过');
    return data;
  } else {
    log('TEST3', '❌ 未能提取到有效数据');
    
    // 调试：输出当前页面的所有class
    const debugInfo = (await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: { 
        profile: PROFILE, 
        script: `(() => {
          const allClasses = new Set();
          document.querySelectorAll('*').forEach(el => {
            el.classList.forEach(c => allClasses.add(c));
          });
          return Array.from(allClasses).filter(c => c.includes('title') || c.includes('content') || c.includes('desc')).slice(0, 20);
        })()` 
      }
    })).data?.result || [];
    
    log('TEST3', `调试 - 页面中包含title/content/desc的class: ${JSON.stringify(debugInfo)}`);
    
    return null;
  }
}

async function main() {
  try {
    log('INIT', '=== 小红书爬虫功能分步测试（改进版）===');
    
    const items = await test1_extractList();
    if (items.length === 0) {
      log('MAIN', '列表提取失败，退出测试');
      return;
    }

    await delay(2000);

    const opened = await test2_clickDetail(0);
    if (!opened) {
      log('MAIN', '无法打开详情页，跳过后续测试');
      return;
    }

    await delay(2000);

    await test3_extractDetail();

    log('MAIN', '=== 基础功能测试完成 ===');

  } catch (err) {
    log('ERROR', `测试失败: ${err.message}`);
    console.error(err);
  }
}

main();
