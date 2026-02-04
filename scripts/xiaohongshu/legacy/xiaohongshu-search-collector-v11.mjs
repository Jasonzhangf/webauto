#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书搜索采集脚本 v11
 * 修复：通过点击评论区元素强制聚焦，确保模态框滚动生效
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

async function navigate(url) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `window.location.href = "${url}"`
    }
  });
}

async function pressKey(key) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `document.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${key}', bubbles: true, cancelable: true }));`
    }
  });
}

// 高亮并聚焦元素
async function highlightAndFocus(selector, index = 0) {
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
          el.focus();
          return true;
        }
        return false;
      })()`
    }
  });
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

async function clickNoteImage(index) {
  await highlightAndFocus('.note-item', index);
  await new Promise(r => setTimeout(r, 500));

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const els = document.querySelectorAll('.note-item');
          const target = els[${index}];
          if (!target) return { clicked: false };
          const img = target.querySelector('img');
          if (!img) return { clicked: false };
          img.click();
          return { clicked: true };
        })()`
    }
  });
  return result.data?.result;
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

// 强制聚焦模态框并滚动
async function focusAndScrollModal() {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          // 查找评论区或内容区的可见元素
          const targets = document.querySelectorAll('.comment-item, .note-content, .author-container, .note-detail-mask');
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
             // 1. 高亮
             focusTarget.style.border = '3px solid purple';
             
             // 2. 点击以获取焦点
             focusTarget.click();
             focusTarget.focus();
             
             // 3. 尝试找到滚动父级并滚动
             let parent = focusTarget.parentElement;
             while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                   parent.scrollTop += 500; // JS 滚动
                   parent.style.border = '2px solid blue'; // 标记滚动容器
                   return { method: 'js-scroll', target: parent.className };
                }
                parent = parent.parentElement;
             }
             
             return { method: 'click-focus', target: focusTarget.className };
          }
          return { method: 'none' };
      })()`
    }
  });
  
  // 4. 发送键盘滚动命令
  await pressKey('PageDown');
}

async function extractNoteDetail() {
  // 尝试多次滚动加载
  log('ACTION', 'Focusing and scrolling modal...');
  for (let i = 0; i < 3; i++) {
     await focusAndScrollModal();
     await new Promise(r => setTimeout(r, 1500));
  }

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          let title = '';
          let author = '';
          let content = '';
          
          const titleEl = document.querySelector('[class*="title"]');
          if (titleEl) title = titleEl.textContent.trim();
          
          const authorEl = document.querySelector('[class*="author"]');
          if (authorEl) author = authorEl.textContent.trim();
          
          const contentEl = document.querySelector('[class*="content"]');
          if (contentEl) content = contentEl.textContent.trim();
          
          const imgUrls = [];
          const imgs = document.querySelectorAll('img');
          for (let i = 0; i < imgs.length; i++) {
            const src = imgs[i].src;
            if (src && !src.startsWith('data:')) {
              imgUrls.push(src);
            }
            if (imgUrls.length >= 5) break;
          }

          const comments = [];
          const commentEls = document.querySelectorAll('.comment-item, [class*="comment-item"]');
          for (let i = 0; i < commentEls.length; i++) {
             if (i >= 15) break;
             const el = commentEls[i];
             const text = el.textContent.trim();
             if (text) comments.push(text);
          }
          
          return { title, author, content, images: imgUrls, comments };
        })()`
    }
  });
  return result.data?.result || {};
}

async function closeModal() {
  const clickClose = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const closeBtn = document.querySelector('.close-circle, .close-icon, [class*="close"]');
          if (closeBtn && closeBtn.offsetParent !== null) {
             closeBtn.style.border = '2px solid green';
             closeBtn.click();
             return true;
          }
          return false;
      })()`
    }
  });

  if (clickClose.data?.result) return;
  
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `document.body.focus()` }
  });
  
  await pressKey('Escape');
}

async function scrollAndLoad() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const oldHeight = document.body.scrollHeight;
          window.scrollTo(0, oldHeight);
          return oldHeight;
        })()`
    }
  });
  
  await new Promise(r => setTimeout(r, 4000));
  
  const checkResult = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `document.body.scrollHeight`
    }
  });
  
  return checkResult.data?.result > result.data?.result;
}

async function main() {
  const searchUrl = generateSearchUrl(KEYWORD);
  log('INIT', `Search URL: ${searchUrl}`);

  await navigate(searchUrl);
  await new Promise(r => setTimeout(r, 5000));

  const collected = [];
  const processedKeys = new Set();
  
  let processedIndex = 0;
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const newItems = await getNewSearchResults(processedIndex);
    
    if (newItems.length === 0) {
      noNewCount++;
      log('SCROLL', `No new items found. Scrolling... (${noNewCount}/${MAX_NO_NEW})`);
      const loaded = await scrollAndLoad();
      if (loaded) {
        log('SCROLL', 'New content loaded.');
        noNewCount = 0;
      }
      continue;
    }

    noNewCount = 0;

    for (let i = 0; i < newItems.length; i++) {
      if (collected.length >= TARGET_COUNT) break;

      const item = newItems[i];
      processedIndex = Math.max(processedIndex, item.index + 1);

      if (!item.noteId) continue;

      log('CLICK', `Processing index ${item.index} (ID: ${item.noteId}): ${item.title.substring(0, 15)}...`);
      
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 3000));

      const detailUrl = await getCurrentUrl();
      if (!detailUrl.includes('/explore/')) {
          log('WARN', 'Failed to open detail page, retrying click...');
          await clickNoteImage(item.index);
          await new Promise(r => setTimeout(r, 3000));
      }

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
        log('COLLECT', `Collected ${collected.length}/${TARGET_COUNT} (Comments: ${detailData.comments?.length})`);
      }

      await closeModal();
      await new Promise(r => setTimeout(r, 1000));
    }
    
    log('SCROLL', `Batch finished (index ${processedIndex}), scrolling...`);
    await scrollAndLoad();
  }

  log('DONE', `Total collected: ${collected.length}`);

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
    lines.push(`## ${i + 1}. ${note.title}`);
    lines.push('');
    lines.push(`**作者：** ${note.author}`);
    lines.push('');
    
    if (note.content) {
      let text = note.content.replace(/\n/g, '  \n');
      if (text.length > 300) text = text.substring(0, 300) + '...';
      lines.push('**内容摘要：**  \n' + text);
      lines.push('');
    }

    if (note.comments && note.comments.length > 0) {
        lines.push('**热评：**');
        note.comments.forEach(c => lines.push(`> ${c}  `));
        lines.push('');
    }
    
    lines.push(`**链接：** [查看详情](${note.detailUrl})`);
    lines.push('');
    
    if (note.images && note.images.length > 0) {
      lines.push('**图片：**');
      for (let j = 0; j < note.images.length; j++) {
        lines.push(`![](${note.images[j]})`);
      }
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }

  const fs = await import('fs/promises');
  await fs.writeFile('xiaohongshu_search_results.md', lines.join('\n'), 'utf-8');
  log('OUTPUT', `Markdown saved to: xiaohongshu_search_results.md`);
}

main().catch(err => {
  log('ERROR', err.message);
  console.error(err);
});
