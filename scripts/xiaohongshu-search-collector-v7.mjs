#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书搜索采集脚本 v7
 * 修复：1. 使用 ESC 关闭模态框 2. 保持页面状态 3. 优化滚动和去重
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_COUNT = 50;
const MAX_NO_NEW = 5;
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
  // 也可以尝试更底层的 pressKey 如果 controller 支持
}

async function getSearchResults() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
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
          // 确保在详情页/模态框中
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

          // 采集评论
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

// 使用 ESC 关闭模态框
async function closeModal() {
  // 1. 尝试点击关闭按钮
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
    log('ACTION', 'Clicked close button');
    return;
  }

  // 2. 尝试 ESC 键
  log('ACTION', 'Pressing ESC');
  await pressKey('Escape');
  
  // 3. 兜底：点击遮罩层
  /*
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const mask = document.querySelector('.mask, .overlay');
          if (mask) mask.click();
      })()`
    }
  });
  */
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
  const clickedIndices = new Set(); // 记录本次 session 点击过的索引
  
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const results = await getSearchResults();
    let newFoundInBatch = false;

    // 遍历当前页面的所有笔记
    for (let i = 0; i < results.length; i++) {
      if (collected.length >= TARGET_COUNT) break;

      const item = results[i];
      
      // 跳过已点击的索引（因为我们现在不刷新页面了，index 应该还是可靠的，
      // 除非小红书动态删除了 DOM 节点，这在虚拟列表中常见。
      // 但如果是追加式加载，前面的 index 对应的内容不变）
      if (clickedIndices.has(item.index)) continue;
      if (!item.noteId) continue;

      // 初步去重：如果 noteId 已采集过（可能在之前的批次，或者页面重排）
      // 这里最好用内容去重，因为 ID 可能会变（如果是动态生成的）
      // 但对于小红书，ID 应该是固定的
      
      clickedIndices.add(item.index);

      log('CLICK', `Processing index ${item.index}: ${item.title.substring(0, 15)}...`);
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 3000)); // 等待模态框

      const detailUrl = await getCurrentUrl();
      const detailData = await extractNoteDetail();

      // 二次去重
      const detailKey = detailData.title + '-' + detailData.author;
      if (processedKeys.has(detailKey)) {
        log('SKIP', `Duplicate content: ${detailData.title}`);
        await closeModal(); // 关闭模态框
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      processedKeys.add(detailKey);
      newFoundInBatch = true;

      collected.push({
        noteId: item.noteId,
        detailUrl: detailUrl,
        ...detailData
      });

      log('COLLECT', `Collected ${collected.length}/${TARGET_COUNT} - ${detailData.title.substring(0, 15)}...`);

      // 关闭模态框，回到列表
      await closeModal();
      await new Promise(r => setTimeout(r, 1500));
    }

    if (!newFoundInBatch) {
      noNewCount++;
      log('SCROLL', `No new items in view. Scrolling... (${noNewCount}/${MAX_NO_NEW})`);
      const loaded = await scrollAndLoad();
      if (loaded) {
        noNewCount = 0;
        log('SCROLL', 'New content loaded.');
      }
    } else {
      noNewCount = 0;
      await scrollAndLoad(); // 继续加载更多
    }
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
