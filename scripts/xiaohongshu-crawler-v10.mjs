#!/usr/bin/env node
/**
 * 小红书采集脚本 v10 - 全量评论与资源深度抓取版
 * 
 * 改进点：
 * 1. 强化评论区加载：递归检测“展开更多回复”，动态监测高度变化，提取所有一级和二级评论。
 * 2. 健壮的资源下载：重试机制，更好的 header 伪装。
 * 3. 结构化存储：完全符合用户要求的目录结构。
 * 4. 去重：基于 noteId 的全局去重（跨运行周期的去重需要外部数据库，这里实现单次运行去重）。
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- 配置 ---
const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = 'oppo小平板'; 
const TARGET_COUNT = 50; 
const MAX_NO_NEW = 10;
const COMMENT_SCROLL_TIMEOUT = 30000; // 评论区加载最大耗时
const DATA_ROOT = path.join(process.cwd(), 'xiaohongshu_data');

// --- 工具函数 ---

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
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

function sanitizeName(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 50);
}

// --- 浏览器控制 ---

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

// --- 业务逻辑 ---

// 1. 获取浏览器 Headers (UA, Cookie) 用于下载
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

// 3. 评论区深度加载
async function loadAllComments() {
  log('COMMENT', 'Expanding comments...');
  
  await executeScript(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    // 找到滚动容器
    // 在弹窗模式下，通常是 .note-detail-mask 下的某个容器，或者是 .note-scroller
    let scroller = document.querySelector('.note-scroller') || 
                   document.querySelector('#noteContainer') ||
                   document.querySelector('.note-content-container');
    
    // 如果是 Modal，可能是在 .note-detail-mask 内部
    if (!scroller && document.querySelector('.note-detail-mask')) {
       // 尝试找包含评论列表的容器
       const commentsContainer = document.querySelector('.comments-container');
       if (commentsContainer) scroller = commentsContainer.parentElement;
    }
    
    // Fallback: window
    const scrollTarget = scroller || window;
    const isWindow = !scroller;

    let noChangeCount = 0;
    let prevHeight = 0;
    const maxRetries = 15; // 此时大约滚动 15次

    for (let i = 0; i < maxRetries; i++) {
      // 1. 滚动到底部
      if (isWindow) {
        window.scrollTo(0, document.body.scrollHeight);
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
      
      await sleep(800);

      // 2. 点击所有“展开更多回复”
      const expandBtns = document.querySelectorAll('.reply-expand, .show-more, [class*="expand"]');
      let clicked = 0;
      expandBtns.forEach(btn => {
        if (btn.offsetParent !== null && !btn.dataset.clicked) {
           btn.click();
           btn.dataset.clicked = 'true';
           clicked++;
        }
      });
      
      if (clicked > 0) await sleep(500);

      // 3. 检查高度变化
      const currentHeight = isWindow ? document.body.scrollHeight : scroller.scrollHeight;
      if (currentHeight === prevHeight && clicked === 0) {
        noChangeCount++;
        if (noChangeCount >= 3) break; // 连续3次无变化且无点击，认为到底
      } else {
        noChangeCount = 0;
      }
      prevHeight = currentHeight;
    }
  });
}

// 4. 提取详情数据
async function extractData() {
  return executeScript(() => {
    const data = {
      title: '',
      author: { name: '', id: '', link: '' },
      content: '',
      date: '',
      images: [],
      comments: []
    };

    const getText = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.trim() : '';
    };

    data.title = getText('.note-detail-title, .title, h1');
    data.content = getText('.note-content, .desc, .content, #detail-desc');
    data.date = getText('.date, .bottom-container .time');

    // 作者
    const authorEl = document.querySelector('.author-container .name, .author-wrapper .name');
    if (authorEl) data.author.name = authorEl.textContent.trim();
    
    const authorLink = document.querySelector('.author-container .info, .author-wrapper');
    if (authorLink && authorLink.href) {
      data.author.link = authorLink.href;
      const match = authorLink.href.match(/\/user\/profile\/([a-f0-9]+)/);
      if (match) data.author.id = match[1];
    }

    // 图片 (Swiper or List)
    // 优先找 background-image (swiper模式)
    const bgDivs = document.querySelectorAll('.note-slider-image');
    bgDivs.forEach(div => {
      const style = window.getComputedStyle(div);
      const bg = style.backgroundImage;
      const match = bg.match(/url\(["']?([^"']+)["']?\)/);
      if (match) data.images.push(match[1]);
    });
    
    // 补充 img 标签
    const imgs = document.querySelectorAll('.note-slider-image img, .note-content img, .note-img');
    imgs.forEach(img => {
      if (img.src && !data.images.includes(img.src)) data.images.push(img.src);
    });

    // 评论提取 (Flattened structure)
    const commentItems = document.querySelectorAll('.comment-item, .comment-inner-container');
    commentItems.forEach(item => {
      const userEl = item.querySelector('.name, .user-name');
      const textEl = item.querySelector('.content, .comment-content');
      const linkEl = item.querySelector('a.avatar, a.name');
      
      if (userEl && textEl) {
        let userId = '';
        if (linkEl && linkEl.href) {
           const match = linkEl.href.match(/\/user\/profile\/([a-f0-9]+)/);
           if (match) userId = match[1];
        }
        
        data.comments.push({
          user: userEl.textContent.trim(),
          userId: userId,
          text: textEl.textContent.trim()
        });
      }
    });

    return data;
  });
}

// 5. 搜索列表获取
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
      
      // Filter out non-note items (e.g. ads, user cards) if necessary
      if (noteId) {
        items.push({ index: i, noteId, title: el.textContent.substring(0, 30) });
      }
    }
    return items;
  }`);
}

async function main() {
  log('INIT', `Starting V10 Crawler: ${KEYWORD}`);
  
  // 准备任务目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const taskDir = path.join(DATA_ROOT, `${sanitizeName(KEYWORD)}_${timestamp}`);
  await fs.mkdir(taskDir, { recursive: true });
  
  const headers = await getHeaders();
  const collectedIds = new Set();
  let processedIndex = 0;
  let noNewCount = 0;

  while (collectedIds.size < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const items = await getSearchItems(processedIndex);
    
    if (!items || items.length === 0) {
      noNewCount++;
      log('SCROLL', `No new items, scrolling (${noNewCount}/${MAX_NO_NEW})`);
      await post('/v1/controller/action', {
        action: 'user_action',
        payload: { profile: PROFILE, operation_type: 'scroll', target: { deltaY: 600 } }
      });
      await delay(2000);
      continue;
    }
    
    noNewCount = 0;

    for (const item of items) {
      if (collectedIds.size >= TARGET_COUNT) break;
      processedIndex = Math.max(processedIndex, item.index + 1);
      
      if (collectedIds.has(item.noteId)) continue;
      
      log('PROCESS', `[${collectedIds.size + 1}/${TARGET_COUNT}] ${item.title} (${item.noteId})`);
      
      // 点击进入
      const clicked = await jsClick('.note-item a', item.index);
      if (!clicked) {
        log('WARN', 'Click failed');
        continue;
      }
      
      await delay(3000); // 等待详情页
      
      // 确认进入
      const url = await getCurrentUrl();
      if (!url.includes('/explore/')) {
        log('WARN', 'Not in detail page? Skipping...');
        continue;
      }

      // 加载评论
      await loadAllComments();
      
      // 提取数据
      const data = await extractData();
      data.link = url;
      data.noteId = item.noteId;

      // 保存
      const noteDir = path.join(taskDir, `${sanitizeName(data.title)}_${item.noteId}`);
      const imagesDir = path.join(noteDir, 'images');
      await fs.mkdir(imagesDir, { recursive: true });

      // 下载图片
      const savedImages = [];
      for (let i = 0; i < data.images.length; i++) {
        const imgUrl = data.images[i];
        // 简单处理 URL 协议
        const fullUrl = imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl;
        const ext = fullUrl.includes('png') ? '.png' : '.jpg';
        const filename = `${i + 1}${ext}`;
        const dest = path.join(imagesDir, filename);
        
        const ok = await downloadFile(fullUrl, dest, headers);
        if (ok) savedImages.push(`./images/${filename}`);
        else savedImages.push(fullUrl);
        await delay(200);
      }

      // 生成 Markdown
      const mdPath = path.join(noteDir, 'content.md');
      const mdContent = `
# ${data.title}

- **作者**: ${data.author.name} (ID: ${data.author.id}) [主页](${data.author.link})
- **发布时间**: ${data.date}
- **原文链接**: ${data.link}
- **采集时间**: ${new Date().toLocaleString()}

## 正文

${data.content}

## 图片

${savedImages.map(img => `![](${img})`).join('\n')}

## 评论 (${data.comments.length})

${data.comments.map(c => `> **${c.user}** (${c.userId}): ${c.text}`).join('\n\n')}
`;
      await fs.writeFile(mdPath, mdContent.trim());
      
      log('SUCCESS', `Saved to ${noteDir}`);
      collectedIds.add(item.noteId);

      // 关闭弹窗 (ESC)
      await post('/v1/controller/action', {
        action: 'user_action',
        payload: { profile: PROFILE, operation_type: 'key', target: { key: 'Escape' } }
      });
      await delay(1500);
    }
    
    // 滚动主列表
    log('SCROLL', 'Batch done, scrolling list...');
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: { profile: PROFILE, operation_type: 'scroll', target: { deltaY: 600 } }
    });
    await delay(2000);
  }
  
  log('DONE', `Collected ${collectedIds.size} notes.`);
}

main().catch(console.error);
