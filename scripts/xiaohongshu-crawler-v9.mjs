#!/usr/bin/env node
/**
 * 小红书采集脚本 v9 - 深度爬取版
 * 功能：
 * 1. 关键词搜索与去重 (基于 noteId)
 * 2. 详情页深度爬取：
 *    - 帖子内容、元数据
 *    - 图片下载 (保存到本地)
 *    - 评论全量抓取 (自动滚动加载、自动展开、提取用户名/ID)
 * 3. 结果按任务目录结构保存
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 配置 ---
const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = 'oppo小平板'; // 搜索关键词
const TARGET_COUNT = 5; // 演示用，设小一点，实际可改大
const MAX_NO_NEW = 5;
const MAX_SCROLL_ATTEMPTS = 10; // 评论区滚动最大尝试次数

// --- 工具函数 ---

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

// 创建安全的目录名
function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

// 下载文件
async function downloadFile(url, destPath, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(buffer));
    return true;
  } catch (err) {
    log('ERROR', `Download failed: ${err.message}`);
    return false;
  }
}

// 获取浏览器上下文中的 User-Agent 和 Cookie (用于下载图片)
async function getBrowserHeaders() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => ({ ua: navigator.userAgent, cookie: document.cookie }))()`
    }
  });
  const data = result.data?.result || {};
  return {
    'User-Agent': data.ua || 'Mozilla/5.0',
    'Cookie': data.cookie || '',
    'Referer': 'https://www.xiaohongshu.com/'
  };
}

// --- 浏览器操作封装 ---

async function jsClick(selector, index = 0) {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const els = document.querySelectorAll('${selector}');
        const el = els[${index}];
        if (el) { el.click(); return true; }
        return false;
      })()`
    }
  })).data?.result;
}

// 获取当前URL
async function getCurrentUrl() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href` }
  })).data?.result || '';
}

// 模拟滚动（页面级）
async function scrollWindow() {
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'scroll',
      target: { deltaY: 500 }
    }
  });
}

// 搜索结果列表提取
async function getSearchResults(startIndex) {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const items = [];
          const els = document.querySelectorAll('.note-item');
          for (let i = ${startIndex}; i < els.length; i++) {
            const el = els[i];
            const linkEl = el.querySelector('a');
            const href = linkEl ? linkEl.href : '';
            let noteId = '';
            if (href) {
              // 尝试从 href 提取 /explore/xxxx
              const match = href.match(/\\/explore\\/([a-f0-9]+)/);
              if (match) noteId = match[1];
            }
            // 如果没有 noteId，尝试从 data 属性找（有些版本有）
            
            items.push({
              index: i,
              noteId: noteId, // 如果是空字符串，后续需过滤
              title: el.textContent.substring(0, 50).trim()
            });
          }
          return items;
        })()`
    }
  })).data?.result || [];
}

// --- 详情页处理逻辑 ---

// 处理评论区：滚动加载 + 展开回复
async function processComments() {
  log('COMMENT', 'Starting comment processing...');
  
  // 1. 尝试找到评论区容器并滚动
  // 在详情页 modal 中，评论区通常在 .note-scroller 或者整个右侧栏
  // 我们通过 JS 脚本循环执行：检查高度 -> 滚动 -> 检查“展开”按钮 -> 点击
  
  const script = `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    // 寻找滚动容器：通常是 .note-detail-mask 下的某个有 overflow-y 的容器
    // 或者直接找包含评论列表的父级
    let scroller = document.querySelector('.note-scroller') || 
                   document.querySelector('#noteContainer') ||
                   document.querySelector('.note-content-container');
                   
    // 如果找不到特定容器，可能整个 modal 是滚动的，或者 window 是滚动的（非 modal 模式）
    if (!scroller && document.querySelector('.note-detail-mask')) {
       // 这是一个 modal
       const commentsEl = document.querySelector('.comments-container');
       if (commentsEl) scroller = commentsEl.parentElement;
    }
    
    if (!scroller) scroller = window; // Fallback
    
    const scrollFunc = (el) => {
       if (el === window) window.scrollBy(0, 500);
       else el.scrollBy(0, 500);
    };
    
    let previousHeight = 0;
    let noChangeCount = 0;
    
    // 循环滚动加载
    for (let i = 0; i < ${MAX_SCROLL_ATTEMPTS}; i++) {
       scrollFunc(scroller);
       await sleep(800);
       
       // 检查是否有“展开更多回复”按钮并点击
       // 这里的 selector 需要根据实际情况调整，通常是 "展开 x 条回复"
       const expandBtns = document.querySelectorAll('.reply-expand, .show-more, [class*="expand"]');
       for (const btn of expandBtns) {
          if (btn.offsetParent !== null && !btn.dataset.clicked) { // 可见且未点击
             btn.click();
             btn.dataset.clicked = 'true';
             await sleep(500); // 等待展开
          }
       }
       
       // 检查是否有高度变化（以此判断是否加载了新内容）
       const currentHeight = scroller.scrollHeight || document.body.scrollHeight;
       if (currentHeight === previousHeight) {
          noChangeCount++;
          if (noChangeCount >= 3) break; // 连续3次没变化，认为到底了
       } else {
          noChangeCount = 0;
       }
       previousHeight = currentHeight;
    }
    
    return true;
  })()`;

  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });
}

// 提取详情页全部数据
async function extractDetail() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const data = {
          title: '',
          author: { name: '', id: '', link: '' },
          content: '',
          date: '',
          images: [],
          comments: []
        };
        
        // 1. 基础信息
        const titleEl = document.querySelector('.note-detail-title, .title');
        if (titleEl) data.title = titleEl.textContent.trim();
        
        const contentEl = document.querySelector('.note-content, .desc, .content');
        if (contentEl) data.content = contentEl.textContent.trim();
        
        const dateEl = document.querySelector('.date, .bottom-container .time');
        if (dateEl) data.date = dateEl.textContent.trim();
        
        // 2. 作者信息
        const authorNameEl = document.querySelector('.author-container .name, .author-wrapper .name');
        if (authorNameEl) data.author.name = authorNameEl.textContent.trim();
        
        const authorLinkEl = document.querySelector('.author-container .info, .author-wrapper');
        if (authorLinkEl && authorLinkEl.href) {
           data.author.link = authorLinkEl.href;
           const match = authorLinkEl.href.match(/\\/user\\/profile\\/([a-f0-9]+)/);
           if (match) data.author.id = match[1];
        }
        
        // 3. 图片
        // 找 swiper 或 list
        const imgEls = document.querySelectorAll('.note-slider-list .note-slider-image, .note-content img');
        // 如果是 slider 模式，可能需要处理背景图样式
        const bgDivs = document.querySelectorAll('.note-slider-image');
        bgDivs.forEach(div => {
           const style = window.getComputedStyle(div);
           const bgImage = style.backgroundImage; // url("...")
           if (bgImage && bgImage !== 'none') {
              const match = bgImage.match(/url\\(["']?([^"']+)["']?\\)/);
              if (match) data.images.push(match[1]);
           }
        });
        
        // 补充 img 标签检测
        const rawImgs = document.querySelectorAll('img.note-slider-image, .note-img');
        rawImgs.forEach(img => {
           if (img.src && !data.images.includes(img.src)) data.images.push(img.src);
        });
        
        // 4. 评论
        // 需要遍历评论树
        const commentItems = document.querySelectorAll('.comment-item');
        commentItems.forEach(item => {
           const userEl = item.querySelector('.name, .user-name');
           const contentEl = item.querySelector('.content, .comment-content');
           const linkEl = item.querySelector('a.avatar, a.name');
           
           let userId = '';
           if (linkEl && linkEl.href) {
              const match = linkEl.href.match(/\\/user\\/profile\\/([a-f0-9]+)/);
              if (match) userId = match[1];
           }
           
           if (userEl && contentEl) {
              data.comments.push({
                 user: userEl.textContent.trim(),
                 userId: userId,
                 text: contentEl.textContent.trim()
              });
           }
        });
        
        return data;
      })()`
    }
  })).data?.result || {};
}

// --- 主流程 ---

async function main() {
  log('INIT', `Starting V9 Crawler for keyword: "${KEYWORD}"`);
  
  // 1. 初始化目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const taskDirName = `${sanitizeName(KEYWORD)}_${timestamp}`;
  const taskPath = path.join(process.cwd(), 'xiaohongshu_data', taskDirName);
  
  await fs.mkdir(taskPath, { recursive: true });
  log('INIT', `Task directory created: ${taskPath}`);
  
  // 2. 获取浏览器 headers 用于下载
  const headers = await getBrowserHeaders();
  
  // 3. 搜索与采集循环
  const collectedIds = new Set();
  let processedIndex = 0;
  let noNewCount = 0;
  
  while (collectedIds.size < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const items = await getSearchResults(processedIndex);
    
    if (items.length === 0) {
      noNewCount++;
      log('SCROLL', `No new items found, scrolling (${noNewCount}/${MAX_NO_NEW})`);
      await scrollWindow();
      await delay(2000);
      continue;
    }
    
    noNewCount = 0;
    
    for (const item of items) {
      if (collectedIds.size >= TARGET_COUNT) break;
      processedIndex = Math.max(processedIndex, item.index + 1);
      
      if (!item.noteId || collectedIds.has(item.noteId)) {
        continue;
      }
      
      log('PROCESS', `Processing note ${item.index}: ${item.title} (ID: ${item.noteId})`);
      
      // 点击进入详情
      const clicked = await jsClick('.note-item a, .note-item', item.index);
      if (!clicked) {
        log('WARN', 'Click failed');
        continue;
      }
      
      await delay(3000); // 等待详情页加载
      
      // 检查 URL 确认是否进入详情
      const currentUrl = await getCurrentUrl();
      if (!currentUrl.includes('/explore/')) {
        log('WARN', 'Not in detail page, skipping');
        // 尝试关闭可能存在的弹窗或回退
        // 简单处理：如果是 modal 模式，URL 可能没变（或者是 pushState），但如果有 modal class 也可以
        // 这里假设 URL 会变
        continue;
      }
      
      // 滚动加载评论
      await processComments();
      
      // 提取数据
      const data = await extractDetail();
      
      // 保存数据
      const noteDirName = `note_${collectedIds.size + 1}_${item.noteId}`;
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
        
        log('DOWNLOAD', `Downloading image ${i + 1}/${data.images.length}`);
        const success = await downloadFile(imgUrl, dest, headers);
        if (success) {
          savedImages.push(`./images/${imgName}`);
        } else {
          savedImages.push(imgUrl); // 下载失败保留原链接
        }
        await delay(500); // 间隔防封
      }
      
      // 生成 Markdown
      let mdContent = `# ${data.title || '无标题'}\n\n`;
      mdContent += `- 作者: ${data.author.name} (ID: ${data.author.id})\n`;
      mdContent += `- 日期: ${data.date}\n`;
      mdContent += `- 链接: ${currentUrl}\n`;
      mdContent += `- 采集时间: ${new Date().toLocaleString()}\n\n`;
      mdContent += `## 内容\n\n${data.content}\n\n`;
      
      mdContent += `## 图片\n\n`;
      savedImages.forEach(img => {
        mdContent += `![](${img})\n`;
      });
      
      mdContent += `\n## 评论 (${data.comments.length})\n\n`;
      data.comments.forEach(c => {
        mdContent += `> **${c.user}** (ID: ${c.userId}): ${c.text}\n\n`;
      });
      
      await fs.writeFile(path.join(notePath, 'content.md'), mdContent, 'utf-8');
      
      collectedIds.add(item.noteId);
      log('SUCCESS', `Saved note ${item.noteId} to ${notePath}`);
      
      // 关闭详情页 (ESC)
      await post('/v1/controller/action', {
        action: 'user_action',
        payload: {
          profile: PROFILE,
          operation_type: 'key',
          target: { key: 'Escape' }
        }
      });
      await delay(1500);
    }
    
    // 批次结束，滚动列表
    log('SCROLL', 'Batch complete, scrolling main list...');
    await scrollWindow();
    await delay(2000);
  }
  
  log('DONE', `Job finished. Collected ${collectedIds.size} notes in ${taskPath}`);
}

main().catch(console.error);
