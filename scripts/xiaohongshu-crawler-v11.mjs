#!/usr/bin/env node
/**
 * 小红书采集脚本 v11 - 增强版
 * 
 * 变更：
 * 1. 保存路径：~/.webauto/download/xiaohongshu/{keyword}/
 * 2. 持久化去重：自动扫描已下载目录
 * 3. 增强评论抓取：递归展开 + 动态检测
 * 4. 目录结构优化
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

// --- 配置 ---
const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = 'oppo小平板'; 
const TARGET_COUNT = 50; 
const MAX_NO_NEW = 10;

// --- 基础工具 ---

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function post(endpoint, data) {
  try {
    const res = await fetch(`${UNIFIED_API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (err.cause && err.cause.code === 'ECONNREFUSED') {
      console.error(`\n❌ 无法连接到 Unified API (${UNIFIED_API})。请确保服务已启动：\n   node scripts/start-headful.mjs\n`);
      process.exit(1);
    }
    throw err;
  }
}

function sanitizeName(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|.\s]/g, '_').trim().slice(0, 60);
}

// --- 浏览器操作 ---

async function executeScript(script) {
  const res = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: typeof script === 'function' ? `(${script.toString()})()` : script
    }
  });
  return res.data?.result;
}

async function jsClick(selector, index = 0) {
  return executeScript(`() => {
    const els = document.querySelectorAll('${selector}');
    const el = els[${index}];
    if (el) { el.click(); return true; }
    return false;
  }`);
}

async function getCurrentUrl() {
  return executeScript(() => location.href);
}

// --- 核心逻辑 ---

// 1. 获取 Headers
async function getHeaders() {
  const data = await executeScript(() => ({
    ua: navigator.userAgent,
    cookie: document.cookie
  }));
  return {
    'User-Agent': data?.ua || 'Mozilla/5.0',
    'Cookie': data?.cookie || '',
    'Referer': 'https://www.xiaohongshu.com/'
  };
}

// 2. 下载文件
async function downloadFile(url, dest, headers) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(dest, Buffer.from(buffer));
    return true;
  } catch (err) {
    log('WARN', `Download failed (${url}): ${err.message}`);
    return false;
  }
}

// 3. 评论区深度加载 (核心增强)
async function expandAndLoadComments() {
  log('COMMENT', 'Starting deep comment expansion...');
  
  await executeScript(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    // 定位滚动容器
    let scroller = document.querySelector('.note-scroller') || // Modal mode
                   document.querySelector('#noteContainer') || 
                   document.querySelector('.note-content-container'); // Page mode
                   
    // 如果找不到特定容器，且存在 mask，则可能是 mask 内部的结构变化
    if (!scroller && document.querySelector('.note-detail-mask')) {
       // 尝试通过评论区反向查找
       const commentsEl = document.querySelector('.comments-container');
       if (commentsEl) scroller = commentsEl.parentElement;
    }
    
    const target = scroller || window;
    const isWindow = !scroller;
    
    const scrollBottom = () => {
      if (isWindow) window.scrollTo(0, document.body.scrollHeight);
      else target.scrollTop = target.scrollHeight;
    };

    // 循环控制
    let noChangeCount = 0;
    let prevHeight = 0;
    let prevCommentCount = 0;
    const MAX_CYCLES = 20; // 最大循环次数，防止死锁

    for (let i = 0; i < MAX_CYCLES; i++) {
      // A. 滚动到底部加载一级评论
      scrollBottom();
      await sleep(1000);

      // B. 查找所有“展开回复”按钮
      // selector: .reply-expand (旧), .show-more, 包含 "展开" 文本的元素
      const expandBtns = Array.from(document.querySelectorAll('.reply-expand, .show-more, .expand-btn'));
      
      let clickedCount = 0;
      for (const btn of expandBtns) {
        // 确保可见且未点击过
        if (btn.offsetParent !== null && !btn.dataset.clicked) {
          btn.click();
          btn.dataset.clicked = 'true';
          clickedCount++;
          await sleep(300); // 间隔防止请求过快
        }
      }

      // C. 检查状态变化
      const currentHeight = isWindow ? document.body.scrollHeight : target.scrollHeight;
      const currentCommentCount = document.querySelectorAll('.comment-item').length;
      
      // 如果高度没变，且没有点击展开，且评论数量没变 -> 认为结束
      if (currentHeight === prevHeight && clickedCount === 0 && currentCommentCount === prevCommentCount) {
        noChangeCount++;
        if (noChangeCount >= 3) break; // 连续3次无进展，退出
      } else {
        noChangeCount = 0;
      }
      
      prevHeight = currentHeight;
      prevCommentCount = currentCommentCount;
      
      // 随机延时
      await sleep(500 + Math.random() * 500);
    }
    
    return true;
  });
}

// 4. 提取完整数据
async function extractFullData() {
  return executeScript(() => {
    const getText = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.innerText.trim() : ''; // 使用 innerText 获取可见文本
    };

    const data = {
      title: getText('.note-detail-title, .title, h1') || '无标题',
      content: getText('.note-content, .desc, .content, #detail-desc'),
      date: getText('.date, .bottom-container .time'),
      author: { name: 'Unknown', id: '', link: '' },
      images: [],
      comments: []
    };

    // 作者信息
    const authorNameEl = document.querySelector('.author-container .name, .author-wrapper .name');
    if (authorNameEl) data.author.name = authorNameEl.innerText.trim();
    
    const authorLinkEl = document.querySelector('.author-container .info, .author-wrapper');
    if (authorLinkEl && authorLinkEl.href) {
      data.author.link = authorLinkEl.href;
      const match = authorLinkEl.href.match(/\/user\/profile\/([a-f0-9]+)/);
      if (match) data.author.id = match[1];
    }

    // 图片提取
    // 1. Swiper 背景图
    document.querySelectorAll('.note-slider-image').forEach(div => {
      const bg = window.getComputedStyle(div).backgroundImage;
      const match = bg.match(/url\(["']?([^"']+)["']?\)/);
      if (match) data.images.push(match[1]);
    });
    // 2. Img 标签
    document.querySelectorAll('.note-slider-image img, .note-content img').forEach(img => {
      if (img.src && !data.images.includes(img.src)) data.images.push(img.src);
    });

    // 评论提取 (递归提取子评论)
    // 遍历所有顶层评论容器
    const commentItems = document.querySelectorAll('.comment-item');
    
    commentItems.forEach(item => {
      // 提取单条评论的辅助函数
      const extractOne = (el) => {
        const userEl = el.querySelector('.name, .user-name');
        const contentEl = el.querySelector('.content, .comment-content');
        const linkEl = el.querySelector('a.avatar, a.name');
        
        if (!userEl || !contentEl) return null;
        
        let userId = '';
        if (linkEl && linkEl.href) {
          const match = linkEl.href.match(/\/user\/profile\/([a-f0-9]+)/);
          if (match) userId = match[1];
        }
        
        return {
          user: userEl.innerText.trim(),
          userId: userId,
          text: contentEl.innerText.trim()
        };
      };

      // 提取主评论
      const rootComment = extractOne(item);
      if (rootComment) {
        // 检查是否有回复列表
        const replies = [];
        const replyEls = item.querySelectorAll('.reply-list .comment-item, .reply-container .comment-item');
        replyEls.forEach(replyEl => {
          const reply = extractOne(replyEl);
          if (reply) replies.push(reply);
        });
        
        rootComment.replies = replies;
        data.comments.push(rootComment);
      }
    });

    return data;
  });
}

async function getSearchItems(startIndex) {
  return executeScript(`() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    for (let i = ${startIndex}; i < els.length; i++) {
      const el = els[i];
      const linkEl = el.querySelector('a');
      const href = linkEl ? linkEl.href : '';
      let noteId = '';
      if (href) {
        const match = href.match(/\/explore\/([a-f0-9]+)/);
        if (match) noteId = match[1];
      }
      
      if (noteId) {
        // 简单的标题清理
        let title = el.textContent.replace(/\\n/g, ' ').trim().substring(0, 50);
        items.push({ index: i, noteId, title });
      }
    }
    return items;
  }`);
}

// --- 主程序 ---

async function main() {
  log('INIT', `Starting Crawler for "${KEYWORD}"`);
  
  // 1. 初始化目录: ~/.webauto/download/xiaohongshu/{keyword}/
  const baseDir = path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', sanitizeName(KEYWORD));
  await fs.mkdir(baseDir, { recursive: true });
  log('INIT', `Save path: ${baseDir}`);

  // 2. 持久化去重：扫描已存在目录
  const collectedIds = new Set();
  try {
    const existingDirs = await fs.readdir(baseDir);
    existingDirs.forEach(dir => {
      // 目录名格式: {title}_{noteId}
      // 提取最后一部分作为 ID
      const parts = dir.split('_');
      const possibleId = parts[parts.length - 1];
      if (possibleId && possibleId.length > 10) { // 简单校验 ID 长度
        collectedIds.add(possibleId);
      }
    });
    log('INIT', `Found ${collectedIds.size} already downloaded notes.`);
  } catch (err) {
    log('WARN', `Failed to scan existing dirs: ${err.message}`);
  }

  const headers = await getHeaders();
  let processedIndex = 0;
  let noNewCount = 0;
  let sessionCollectedCount = 0;

  while (sessionCollectedCount < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const items = await getSearchItems(processedIndex);
    
    if (!items || items.length === 0) {
      noNewCount++;
      log('SCROLL', `No new items, scrolling (${noNewCount}/${MAX_NO_NEW})`);
      await post('/v1/controller/action', {
        action: 'user_action',
        payload: { profile: PROFILE, operation_type: 'scroll', target: { deltaY: 800 } }
      });
      await delay(2000);
      continue;
    }
    
    noNewCount = 0;

    for (const item of items) {
      if (sessionCollectedCount >= TARGET_COUNT) break;
      processedIndex = Math.max(processedIndex, item.index + 1);
      
      // 去重检查
      if (collectedIds.has(item.noteId)) {
        // log('SKIP', `Duplicate: ${item.noteId}`);
        continue;
      }
      
      log('PROCESS', `[${sessionCollectedCount + 1}] ${item.title} (${item.noteId})`);
      
      // 点击进入详情
      const clicked = await jsClick('.note-item a', item.index);
      if (!clicked) {
        log('WARN', 'Click failed');
        continue;
      }
      
      await delay(3000); // 等待页面跳转和基本加载
      
      // 确认页面状态
      const url = await getCurrentUrl();
      if (!url.includes('/explore/')) {
        log('WARN', 'Not in detail page, skipping');
        continue;
      }

      // 深度加载评论
      await expandAndLoadComments();
      
      // 提取数据
      const data = await extractFullData();
      data.link = url;
      
      // 保存数据
      const dirName = `${sanitizeName(data.title)}_${item.noteId}`;
      const noteDir = path.join(baseDir, dirName);
      const imagesDir = path.join(noteDir, 'images');
      
      await fs.mkdir(imagesDir, { recursive: true });

      // 下载图片
      const savedImages = [];
      for (let i = 0; i < data.images.length; i++) {
        let imgUrl = data.images[i];
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        
        const ext = imgUrl.includes('.png') ? '.png' : '.jpg';
        const filename = `${i + 1}${ext}`;
        const destPath = path.join(imagesDir, filename);
        
        // 简单的重试机制
        let success = false;
        for (let r = 0; r < 3; r++) {
          success = await downloadFile(imgUrl, destPath, headers);
          if (success) break;
          await delay(1000);
        }
        
        if (success) savedImages.push(`./images/${filename}`);
        else savedImages.push(imgUrl); // 下载失败保留原链
        
        await delay(300);
      }

      // 生成 Markdown
      let md = `# ${data.title}\n\n`;
      md += `- **作者**: ${data.author.name} (ID: ${data.author.id}) [主页](${data.author.link})\n`;
      md += `- **发布时间**: ${data.date}\n`;
      md += `- **原文链接**: ${data.link}\n`;
      md += `- **Note ID**: ${item.noteId}\n\n`;
      
      md += `## 正文\n\n${data.content}\n\n`;
      
      md += `## 图片\n\n`;
      savedImages.forEach(img => {
        md += `![](${img})\n`;
      });
      
      md += `\n## 评论 (${data.comments.length} top-level)\n\n`;
      
      data.comments.forEach((c, idx) => {
        md += `### ${idx + 1}. ${c.user} (ID: ${c.userId})\n`;
        md += `${c.text}\n\n`;
        
        if (c.replies && c.replies.length > 0) {
          c.replies.forEach(r => {
            md += `> **${r.user}** (${r.userId}): ${r.text}\n>\n`;
          });
        }
        md += `\n`;
      });

      await fs.writeFile(path.join(noteDir, 'content.md'), md, 'utf-8');
      
      log('SUCCESS', `Saved to ${noteDir}`);
      collectedIds.add(item.noteId);
      sessionCollectedCount++;

      // 关闭详情页 (ESC)
      await post('/v1/controller/action', {
        action: 'user_action',
        payload: { profile: PROFILE, operation_type: 'key', target: { key: 'Escape' } }
      });
      await delay(1500);
    }
    
    // 翻页滚动
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: { profile: PROFILE, operation_type: 'scroll', target: { deltaY: 800 } }
    });
    await delay(2000);
  }
  
  log('DONE', `Session finished. Total collected: ${sessionCollectedCount}`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
});
