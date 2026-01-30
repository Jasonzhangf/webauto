#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书搜索采集脚本 v8
 * 修复：1. 优化滚动和列表获取逻辑，处理动态DOM 2. 增加调试日志
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_COUNT = 50;
const MAX_NO_NEW = 10; // 增加最大无新内容次数
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

// 模拟按键
async function pressKey(key) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `document.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${key}', bubbles: true, cancelable: true }));`
    }
  });
}

// 获取当前页面所有笔记的基本信息（只返回未处理的）
async function getNewSearchResults(processedIds) {
  // 将 Set 转为数组传给浏览器环境（需要序列化）
  const processedArray = Array.from(processedIds);
  
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const processed = new Set(${JSON.stringify(processedArray)});
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
            
            if (noteId && !processed.has(noteId)) {
              items.push({
                index: i,
                noteId: noteId,
                title: el.textContent.substring(0, 50).trim()
              });
            }
          }
          return items;
        })()`
    }
  });
  return result.data?.result || [];
}

async function clickNoteImage(index) {
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

async function extractNoteDetail() {
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
          const commentEls = document.querySelectorAll('.comment-item');
          for (let i = 0; i < commentEls.length; i++) {
             if (i >= 5) break;
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
             closeBtn.click();
             return true;
          }
          return false;
      })()`
    }
  });

  if (clickClose.data?.result) {
    // log('ACTION', 'Clicked close button');
    return;
  }

  // log('ACTION', 'Pressing ESC');
  await pressKey('Escape');
}

async function scrollAndLoad() {
  // 滚动一屏高度
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          window.scrollBy(0, window.innerHeight);
          return document.body.scrollHeight;
        })()`
    }
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // 再次滚动到底部确保触发
  const result2 = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          window.scrollTo(0, document.body.scrollHeight);
          return document.body.scrollHeight;
        })()`
    }
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  return result2.data?.result > result.data?.result;
}

async function main() {
  const searchUrl = generateSearchUrl(KEYWORD);
  log('INIT', `Search URL: ${searchUrl}`);

  await navigate(searchUrl);
  await new Promise(r => setTimeout(r, 5000));

  const collected = [];
  const processedNoteIds = new Set(); // 记录已处理的ID
  
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    // 获取当前页面所有未处理的笔记
    const newItems = await getNewSearchResults(processedNoteIds);
    
    if (newItems.length === 0) {
      noNewCount++;
      log('SCROLL', `No new items found. Scrolling... (${noNewCount}/${MAX_NO_NEW})`);
      await scrollAndLoad();
      continue;
    }

    noNewCount = 0; // 重置无新内容计数

    for (let i = 0; i < newItems.length; i++) {
      if (collected.length >= TARGET_COUNT) break;

      const item = newItems[i];
      processedNoteIds.add(item.noteId); // 标记为已处理

      log('CLICK', `Processing index ${item.index} (ID: ${item.noteId}): ${item.title.substring(0, 15)}...`);
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 3000));

      const detailUrl = await getCurrentUrl();
      // 检查是否成功打开了详情页（URL变化）
      if (!detailUrl.includes('/explore/')) {
          log('WARN', 'Failed to open detail page, retrying click...');
          await clickNoteImage(item.index);
          await new Promise(r => setTimeout(r, 3000));
      }

      const detailData = await extractNoteDetail();

      // 二次去重（基于内容，防止ID变动等情况）
      const detailKey = detailData.title + '-' + detailData.author;
      const isDuplicate = collected.some(c => c.title === detailData.title && c.author === detailData.author);
      
      if (isDuplicate) {
        log('SKIP', `Duplicate content: ${detailData.title}`);
      } else {
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
    
    // 处理完当前视图后，滚动加载更多
    log('SCROLL', 'Batch finished, scrolling...');
    await scrollAndLoad();
  }

  log('DONE', `Total collected: ${collected.length}`);

  // 生成 Markdown
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
