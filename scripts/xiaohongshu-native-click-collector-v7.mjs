#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书采集脚本 v17 - 分析点击机制
 * 修复：尝试使用不同的点击方式，模拟真实用户行为
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_COUNT = 50;
const MAX_NO_NEW = 10;
const MAX_CLICK_RETRY = 3;
const KEYWORD = 'oppo小平板';

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

// 清除所有高亮
async function clearAllHighlights() {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        document.querySelectorAll('[data-webauto-highlight]').forEach(el => {
          el.style.border = '';
          el.removeAttribute('data-webauto-highlight');
        });
      })()`
    }
  });
}

// 高亮元素并确保在视口内
async function highlightElement(selector, index = 0) {
  await clearAllHighlights();
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const els = document.querySelectorAll('${selector}');
        const el = els[${index}];
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          // 等待滚动完成
          return new Promise(resolve => {
            setTimeout(() => {
              el.style.border = '4px solid red';
              el.setAttribute('data-webauto-highlight', 'true');
              const rect = el.getBoundingClientRect();
              resolve({
                visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
                rect: {
                  top: rect.top,
                  bottom: rect.bottom,
                  width: rect.width,
                  height: rect.height
                }
              });
            }, 300);
          });
        }
        return false;
      })()`
    }
  });
}

// 获取图片元素的绝对坐标
async function getImageAbsoluteCoords(index = 0) {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const els = document.querySelectorAll('.note-item');
        const container = els[${index}];
        if (!container) return null;
        
        // 直接获取图片元素
        const img = container.querySelector('img');
        if (!img) return null;
        
        // 获取相对于文档的坐标
        const rect = img.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        return {
          x: rect.left + scrollLeft + rect.width / 2,
          y: rect.top + scrollTop + rect.height / 2,
          viewportX: rect.left + rect.width / 2,
          viewportY: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          src: img.src
        };
      })()`
    }
  });
  return result.data?.result;
}

// 尝试多种点击方式
async function tryMultipleClickMethods(x, y) {
  log('CLICK', `Trying multiple click methods at (${Math.round(x)}, ${Math.round(y)})`);
  
  // 方法1: 原生点击
  try {
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: {
        profile: PROFILE,
        operation_type: 'move',
        target: { coordinates: { x, y } }
      }
    });
    
    await new Promise(r => setTimeout(r, 100));
    
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: {
        profile: PROFILE,
        operation_type: 'down',
        target: { coordinates: { x, y } }
      }
    });
    
    await new Promise(r => setTimeout(r, 50));
    
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: {
        profile: PROFILE,
        operation_type: 'up',
        target: { coordinates: { x, y } }
      }
    });
    
    log('CLICK', 'Native click method completed');
  } catch (err) {
    log('ERROR', `Native click failed: ${err.message}`);
  }
  
  // 等待一段时间
  await new Promise(r => setTimeout(r, 1000));
}

// 键盘操作
async function pressKey(key) {
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'key',
      target: { key }
    }
  });
}

// 鼠标滚动
async function scrollWheel(deltaY) {
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'scroll',
      target: { deltaY }
    }
  });
}

// 智能滚动（随机化）
async function smartScroll() {
  const minDelay = 1500;
  const maxDelay = 3500;
  const minDelta = 300;
  const maxDelta = 700;
  const reverseProb = 0.1;
  
  const delay = Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);
  const delta = Math.floor(Math.random() * (maxDelta - minDelta) + minDelta);
  const reverse = Math.random() < reverseProb ? -1 : 1;
  
  log('SCROLL', `Delta: ${delta * reverse}, Delay: ${delay}ms`);
  await scrollWheel(delta * reverse);
  
  await new Promise(r => setTimeout(r, delay));
}

async function getNewSearchResults(startIndex) {
  const result = await post('/v1/controller/action', {
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
              const match = href.match(/\\/explore\\/([a-f0-9]+)/);
              if (match) noteId = match[1];
            }
            items.push({
              index: i,
              noteId: noteId,
              title: el.textContent.substring(0, 50).trim()
            });
          }
          return items;
        })()`
    }
  });
  return result.data?.result || [];
}

async function clickNoteWithRetry(index) {
  const beforeUrl = await getCurrentUrl();
  
  log('HIGHLIGHT', `Highlighting note ${index}`);
  await highlightElement('.note-item', index);
  await new Promise(r => setTimeout(r, 500));

  for (let attempt = 0; attempt < MAX_CLICK_RETRY; attempt++) {
    log('ATTEMPT', `Click attempt ${attempt + 1}/${MAX_CLICK_RETRY}`);
    
    // 获取图片元素坐标
    const coords = await getImageAbsoluteCoords(index);
    
    if (!coords) {
      log('ERROR', `Failed to get image coordinates for note ${index}`);
      return { clicked: false };
    }
    
    log('COORD', `Image: ${Math.round(coords.width)}x${Math.round(coords.height)}`);
    log('COORD', `Viewport: (${Math.round(coords.viewportX)}, ${Math.round(coords.viewportY)})`);
    log('COORD', `Page: (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
    log('COORD', `Src: ${coords.src.substring(0, 50)}...`);
    
    // 尝试多种点击方式
    await tryMultipleClickMethods(coords.x, coords.y);
    
    // 等待页面跳转
    log('WAIT', 'Waiting for page navigation...');
    await new Promise(r => setTimeout(r, 4000));
    
    const afterUrl = await getCurrentUrl();
    log('URL', `Before: ${beforeUrl.substring(0, 50)}...`);
    log('URL', `After: ${afterUrl.substring(0, 50)}...`);
    
    if (afterUrl.includes('/explore/')) {
      log('SUCCESS', 'Successfully navigated to detail page');
      return { clicked: true, url: afterUrl };
    }
    
    log('WARN', 'Not in detail page yet');
    if (attempt < MAX_CLICK_RETRY - 1) {
      log('RETRY', 'Retrying...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  return { clicked: false };
}

async function getCurrentUrl() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `location.href`
    }
  });
  return result.data?.result || '';
}

// 聚焦模态框内元素
async function focusModalElement() {
  await clearAllHighlights();
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const targets = document.querySelectorAll('.comment-item, .note-content, .author-container');
          let focusTarget = null;
          
          for (let i = 0; i < targets.length; i++) {
             const el = targets[i];
             const rect = el.getBoundingClientRect();
             if (rect.width > 0 && rect.height > 0) {
                focusTarget = el;
                break;
             }
          }
          
          if (focusTarget) {
             focusTarget.style.border = '3px solid purple';
             focusTarget.setAttribute('data-webauto-highlight', 'true');
             const rect = focusTarget.getBoundingClientRect();
             const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
             const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
             return {
                x: rect.left + scrollLeft + rect.width / 2,
                y: rect.top + scrollTop + rect.height / 2
             };
          }
          return null;
      })()`
    }
  });
  
  const coords = result.data?.result;
  if (coords) {
    log('FOCUS', `Focusing modal element at (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: {
        profile: PROFILE,
        operation_type: 'move',
        target: { coordinates: { x: coords.x, y: coords.y } }
      }
    });
    await new Promise(r => setTimeout(r, 100));
    await post('/v1/controller/action', {
      action: 'user_action',
      payload: {
        profile: PROFILE,
        operation_type: 'click',
        target: { coordinates: { x: coords.x, y: coords.y } }
      }
    });
    await new Promise(r => setTimeout(r, 500));
  }
}

// 模态框内滚动
async function scrollModalContent() {
  log('SCROLL', 'Pressing PageDown to scroll modal');
  await pressKey('PageDown');
  await new Promise(r => setTimeout(r, 1500));
}

async function extractNoteDetail() {
  log('EXTRACT', 'Extracting note detail...');
  
  // 聚焦并滚动模态框
  await focusModalElement();
  await scrollModalContent();
  await focusModalElement();
  await scrollModalContent();
  
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const data = {
          title: '',
          author: '',
          content: '',
          images: [],
          comments: []
        };
        
        // 提取标题
        const titleEl = document.querySelector('.note-detail-title, .note-title, h1, h2');
        if (titleEl) data.title = titleEl.textContent.trim();
        
        // 提取作者
        const authorEl = document.querySelector('.author-name, .username, [class*="author"]');
        if (authorEl) data.author = authorEl.textContent.trim();
        
        // 提取内容
        const contentEl = document.querySelector('.note-content, .note-text, .content, [class*="content"]');
        if (contentEl) data.content = contentEl.textContent.trim();
        
        // 提取图片（URL）
        const imgEls = document.querySelectorAll('.note-image img, .note-detail-mask img, img[class*="image"]');
        imgEls.forEach(img => {
          const src = img.src || img.dataset.src;
          if (src && !data.images.includes(src)) {
            data.images.push(src);
          }
        });
        
        // 提取评论
        const commentEls = document.querySelectorAll('.comment-item, .comment, [class*="comment"]');
        commentEls.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length < 200) {
            data.comments.push(text);
          }
        });
        
        return data;
      })()`
    }
  });
  
  return result.data?.result || {};
}

async function closeModal() {
  log('CLOSE', 'Closing modal with ESC');
  await clearAllHighlights();
  await pressKey('Escape');
  await new Promise(r => setTimeout(r, 1500));
}

async function main() {
  log('INIT', 'Starting native click collector v7 (analyze click mechanism)');
  log('INIT', `Target: ${TARGET_COUNT} notes`);
  
  // 检查服务
  try {
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: { profile: PROFILE, script: 'true' }
    });
  } catch (err) {
    log('ERROR', `Service check failed: ${err.message}`);
    return;
  }
  
  const collected = [];
  const processedKeys = new Set();
  let processedIndex = 0;
  let noNewCount = 0;
  
  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    log('BATCH', `Processing batch from index ${processedIndex}`);
    
    const newItems = await getNewSearchResults(processedIndex);
    log('FOUND', `Found ${newItems.length} new items`);
    
    if (newItems.length === 0) {
      noNewCount++;
      log('SCROLL', `No new items, scrolling... (${noNewCount}/${MAX_NO_NEW})`);
      await smartScroll();
      continue;
    }
    
    noNewCount = 0;
    
    for (let i = 0; i < newItems.length; i++) {
      if (collected.length >= TARGET_COUNT) break;
      
      const item = newItems[i];
      processedIndex = Math.max(processedIndex, item.index + 1);
      
      if (!item.noteId) continue;
      
      log('PROCESS', `Processing ${item.index} (ID: ${item.noteId})`);
      
      const clickResult = await clickNoteWithRetry(item.index);
      if (!clickResult.clicked) {
        log('WARN', 'Click failed after retries, skipping');
        continue;
      }
      
      const detailUrl = clickResult.url;
      log('SUCCESS', `Detail URL: ${detailUrl.substring(0, 60)}...`);
      
      log('EXTRACT', 'Extracting detail...');
      const detailData = await extractNoteDetail();
      
      const detailKey = detailData.title + '-' + detailData.author;
      if (processedKeys.has(detailKey)) {
        log('SKIP', `Duplicate: ${detailData.title}`);
      } else {
        processedKeys.add(detailKey);
        collected.push({
          noteId: item.noteId,
          detailUrl: detailUrl,
          ...detailData
        });
        log('COLLECT', `Collected ${collected.length}/${TARGET_COUNT}`);
      }
      
      await closeModal();
      await new Promise(r => setTimeout(r, 1000));
    }
    
    log('SCROLL', 'Batch complete, scrolling...');
    await smartScroll();
  }
  
  log('DONE', `Collected ${collected.length} notes`);
  
  // 清除所有高亮
  await clearAllHighlights();
  
  // 输出 Markdown
  const lines = [
    '# 小红书搜索结果',
    '',
    `采集时间：${new Date().toLocaleString('zh-CN')}`,
    `搜索关键词：${KEYWORD}`,
    `笔记数量：${collected.length}`,
    '',
    '---',
    ''
  ];
  
  for (let i = 0; i < collected.length; i++) {
    const note = collected[i];
    lines.push(`## ${i + 1}. ${note.title || '无标题'}`);
    lines.push('');
    lines.push(`**作者：** ${note.author || '未知'}`);
    lines.push('');
    
    if (note.content) {
      let text = note.content.replace(/\n/g, '  \n');
      if (text.length > 300) text = text.substring(0, 300) + '...';
      lines.push('**内容摘要：**  \n' + text);
      lines.push('');
    }
    
    if (note.comments && note.comments.length > 0) {
      lines.push('**热评：**');
      note.comments.slice(0, 5).forEach(c => lines.push(`> ${c}  `));
      lines.push('');
    }
    
    lines.push(`**链接：** [查看详情](${note.detailUrl})`);
    lines.push('');
    
    if (note.images && note.images.length > 0) {
      lines.push('**图片：**');
      note.images.forEach(imgUrl => lines.push(`![](${imgUrl})`));
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }
  
  const fs = await import('fs/promises');
  await fs.writeFile('xiaohongshu_native_click_results.md', lines.join('\n'), 'utf-8');
  log('OUTPUT', `Saved to: xiaohongshu_native_click_results.md`);
}

main().catch(err => {
  log('ERROR', err.message);
  console.error(err);
});
