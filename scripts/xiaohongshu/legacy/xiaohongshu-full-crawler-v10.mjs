#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * [LEGACY] 小红书完整爬虫 v10
 *
 * ⚠️ 该脚本包含 DOM click 等非系统级交互，不符合当前强制规则：
 * - 所有点击/输入/滚动必须通过系统级 API（mouse/keyboard/wheel）
 * - 禁止 DOM click/JS scroll/history.back
 *
 * 目前请使用 scripts/xiaohongshu/phase1-4 系列脚本作为标准入口。
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = 'oppo小平板';
const TARGET_COUNT = 10; // 目标采集数量

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

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function downloadFile(url, destPath, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(buffer));
    return true;
  } catch (err) {
    log('DOWNLOAD', `失败: ${err.message}`);
    return false;
  }
}

async function getBrowserHeaders() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `({ ua: navigator.userAgent, cookie: document.cookie })`
    }
  });
  const data = result.data?.result || {};
  return {
    'User-Agent': data.ua || 'Mozilla/5.0',
    'Cookie': data.cookie || '',
    'Referer': 'https://www.xiaohongshu.com/'
  };
}

async function getCurrentUrl() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href` }
  })).data?.result || '';
}

// 提取列表
async function extractList(startIndex = 0) {
  const script = `(() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    
    for (let i = ${startIndex}; i < els.length; i++) {
      const el = els[i];
      const hiddenLink = el.querySelector('a[href^="/explore/"]');
      const noteId = hiddenLink ? hiddenLink.href.match(/\\/explore\\/([a-f0-9]+)/)?.[1] : '';
      const title = el.textContent.trim().substring(0, 50);
      
      items.push({ index: i, noteId, title });
    }
    
    return items;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || [];
}

// 点击详情
async function clickDetail(index) {
  const script = `(() => {
    const els = document.querySelectorAll('.note-item');
    const el = els[${index}];
    if (!el) return false;
    
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

// 等待详情页加载完成
async function waitForDetailLoad(expectedNoteId, maxWait = 10) {
  for (let i = 0; i < maxWait; i++) {
    await delay(1000);
    
    const url = await getCurrentUrl();
    if (url.includes(`/explore/${expectedNoteId}`)) {
      log('WAIT', '详情页加载完成');
      return true;
    }
  }
  
  log('WARN', '详情页加载超时');
  return false;
}

// 提取详情
async function extractDetail() {
  const script = `(() => {
    const data = {
      title: '',
      content: '',
      author: '',
      authorId: '',
      date: '',
      images: [],
      stats: {}
    };
    
    // 标题
    const titleEl = document.querySelector('.title, #detail-title, h1');
    if (titleEl) data.title = titleEl.textContent.trim();
    
    // 内容
    const contentEl = document.querySelector('.desc, .note-content, #detail-desc');
    if (contentEl) data.content = contentEl.textContent.trim();
    
    // 作者
    const authorEl = document.querySelector('.author-container .name, .username');
    if (authorEl) data.author = authorEl.textContent.trim();
    
    const authorLink = document.querySelector('.author-container a, a.username');
    if (authorLink && authorLink.href) {
      const match = authorLink.href.match(/\\/user\\/profile\\/([a-f0-9]+)/);
      if (match) data.authorId = match[1];
    }
    
    // 日期
    const dateEl = document.querySelector('.date, .publish-time');
    if (dateEl) data.date = dateEl.textContent.trim();
    
    // 图片
    const imgs = document.querySelectorAll('img[src*="sns-img"]');
    imgs.forEach(img => {
      if (img.src && !data.images.includes(img.src)) {
        data.images.push(img.src);
      }
    });
    
    return data;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || {};
}

// 爬取评论
async function extractComments() {
  log('COMMENT', '开始爬取评论...');
  
  // 滚动加载评论
  for (let i = 0; i < 3; i++) {
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: {
        profile: PROFILE,
        operation_type: 'key',
        target: { key: 'PageDown' }
      }
    });
    await delay(1500);
  }
  
  // 提取评论
  const script = `(() => {
    const comments = [];
    const commentEls = document.querySelectorAll('.comment-item');
    
    commentEls.forEach(item => {
      const userEl = item.querySelector('.username, .user-name');
      const contentEl = item.querySelector('.content, .comment-content');
      
      if (userEl && contentEl) {
        comments.push({
          user: userEl.textContent.trim(),
          text: contentEl.textContent.trim()
        });
      }
    });
    
    return comments;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || [];
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
  
  // 等待返回列表页
  await delay(2000);
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
    log('INIT', `=== 小红书完整爬虫 v10 ===`);
    log('INIT', `关键词: ${KEYWORD}, 目标: ${TARGET_COUNT} 条`);
    
    // 创建输出目录
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const taskDirName = `${sanitizeName(KEYWORD)}_${timestamp}`;
    const taskPath = path.join(process.cwd(), 'xiaohongshu_data', taskDirName);
    await fs.mkdir(taskPath, { recursive: true });
    log('INIT', `输出目录: ${taskPath}`);
    
    // 获取下载headers
    const headers = await getBrowserHeaders();
    
    const collectedItems = [];
    const collectedIds = new Set();
    let processedIndex = 0;
    let noNewCount = 0;
    const MAX_NO_NEW = 5;
    
    while (collectedItems.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
      const items = await extractList(processedIndex);
      
      if (items.length === 0) {
        noNewCount++;
        log('SCROLL', `无新项目，滚动 (${noNewCount}/${MAX_NO_NEW})`);
        await scrollList();
        await delay(2000);
        continue;
      }
      
      log('LIST', `找到 ${items.length} 个项目`);
      noNewCount = 0;
      
      for (const item of items) {
        if (collectedItems.length >= TARGET_COUNT) break;
        
        processedIndex = Math.max(processedIndex, item.index + 1);
        
        if (!item.noteId || collectedIds.has(item.noteId)) {
          continue;
        }
        
        log('PROCESS', `[${collectedItems.length + 1}/${TARGET_COUNT}] ${item.title}`);
        
        // 点击
        const clicked = await clickDetail(item.index);
        if (!clicked) {
          log('WARN', '点击失败');
          continue;
        }
        
        // 等待加载
        const loaded = await waitForDetailLoad(item.noteId);
        if (!loaded) {
          log('SKIP', '加载超时');
          await closeDetail();
          continue;
        }
        
        // 提取数据
        const data = await extractDetail();
        
        // 提取评论
        const comments = await extractComments();
        
        // 保存数据
        const noteDirName = `note_${collectedItems.length + 1}_${item.noteId}`;
        const notePath = path.join(taskPath, noteDirName);
        const imagesPath = path.join(notePath, 'images');
        await fs.mkdir(imagesPath, { recursive: true });
        
        // 下载图片
        const savedImages = [];
        for (let i = 0; i < data.images.length; i++) {
          const imgUrl = data.images[i];
          const ext = imgUrl.includes('.png') ? '.png' : '.jpg';
          const imgName = `${i + 1}${ext}`;
          const dest = path.join(imagesPath, imgName);
          
          log('DOWNLOAD', `图片 ${i + 1}/${data.images.length}`);
          const success = await downloadFile(imgUrl, dest, headers);
          if (success) {
            savedImages.push(`./images/${imgName}`);
          } else {
            savedImages.push(imgUrl);
          }
          await delay(500);
        }
        
        // 生成Markdown
        const currentUrl = await getCurrentUrl();
        let mdContent = `# ${data.title || '无标题'}\n\n`;
        mdContent += `- **作者**: ${data.author} (ID: ${data.authorId})\n`;
        mdContent += `- **日期**: ${data.date}\n`;
        mdContent += `- **链接**: ${currentUrl}\n`;
        mdContent += `- **采集时间**: ${new Date().toLocaleString()}\n\n`;
        
        mdContent += `## 内容\n\n${data.content}\n\n`;
        
        if (savedImages.length > 0) {
          mdContent += `## 图片\n\n`;
          savedImages.forEach(img => {
            mdContent += `![](${img})\n`;
          });
          mdContent += `\n`;
        }
        
        if (comments.length > 0) {
          mdContent += `## 评论 (${comments.length})\n\n`;
          comments.forEach(c => {
            mdContent += `> **${c.user}**: ${c.text}\n\n`;
          });
        }
        
        await fs.writeFile(path.join(notePath, 'content.md'), mdContent, 'utf-8');
        
        collectedItems.push({
          noteId: item.noteId,
          ...data,
          comments
        });
        
        collectedIds.add(item.noteId);
        
        log('SUCCESS', `✅ 已采集 ${collectedItems.length}/${TARGET_COUNT}`);
        log('STATS', `标题: ${data.title}, 图片: ${data.images.length}, 评论: ${comments.length}`);
        
        await closeDetail();
        await delay(2000);
      }
      
      log('SCROLL', '滚动加载更多...');
      await scrollList();
      await delay(2000);
    }
    
    log('DONE', `=== 采集完成: ${collectedItems.length} 个帖子 ===`);
    log('DONE', `保存位置: ${taskPath}`);

  } catch (err) {
    log('ERROR', `失败: ${err.message}`);
    console.error(err);
  }
}

main();
