#!/usr/bin/env node
/**
 * 小红书采集脚本 v12 - 原生点击版本
 * 修复：使用 browser 原生点击而非 JS 模拟点击
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_COUNT = 50;
const MAX_NO_NEW = 10;
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

function generateSearchUrl(keyword) {
  const encoded = encodeURIComponent(keyword);
  return `https://www.xiaohongshu.com/search_result?keyword=${encoded}&source=unknown`;
}

// 高亮元素（JS）
async function highlightElement(selector, index = 0) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const els = document.querySelectorAll('${selector}');
        const el = els[${index}];
        if (el) {
          el.style.border = '4px solid red';
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          return true;
        }
        return false;
      })()`
    }
  });
}

// 获取元素中心坐标
async function getElementCenter(selector, index = 0) {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const els = document.querySelectorAll('${selector}');
        const el = els[${index}];
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height
        };
      })()`
    }
  });
  return result.data?.result;
}

// 原生鼠标点击（通过坐标）
async function nativeClick(x, y) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        return { x: ${x}, y: ${y} };
      })()`
    }
  });
  
  // 使用 user_action 原生点击
  await post('/v1/controller/action', {
    action: 'user_action',
    payload: {
      profile: PROFILE,
      operation_type: 'click',
      target: {
        coordinates: { x, y }
      }
    }
  });
}

// 键盘操作（ESC 关闭模态框）
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

async function clickNoteImageNative(index) {
  log('HIGHLIGHT', `Highlighting note ${index}`);
  await highlightElement('.note-item', index);
  await new Promise(r => setTimeout(r, 500));

  // 获取图片元素坐标
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const els = document.querySelectorAll('.note-item');
          const target = els[${index}];
          if (!target) return null;
          const img = target.querySelector('img');
          if (!img) return null;
          const rect = img.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height
          };
        })()`
    }
  });

  const coords = result.data?.result;
  if (!coords) {
    log('ERROR', `Failed to get coordinates for note ${index}`);
    return { clicked: false };
  }

  log('CLICK', `Native click at (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
  
  // 原生点击
  await nativeClick(coords.x, coords.y);
  await new Promise(r => setTimeout(r, 2000));
  
  return { clicked: true, coords };
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
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          // 查找评论区可见元素
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
             const rect = focusTarget.getBoundingClientRect();
             return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
             };
          }
          return null;
      })()`
    }
  });
  
  const coords = result.data?.result;
  if (coords) {
    log('FOCUS', `Focusing modal element at (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
    // 原生点击以获取焦点
    await nativeClick(coords.x, coords.y);
    await new Promise(r => setTimeout(r, 500));
  }
}

// 模态框内滚动（使用 PageDown）
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
  await pressKey('Escape');
  await new Promise(r => setTimeout(r, 1500));
}

async function main() {
  log('INIT', 'Starting native click collector');
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
      
      const clickResult = await clickNoteImageNative(item.index);
      if (!clickResult.clicked) {
        log('WARN', 'Click failed, skipping');
        continue;
      }
      
      const detailUrl = await getCurrentUrl();
      if (!detailUrl.includes('/explore/')) {
        log('WARN', 'Not in detail page, trying again');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
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
