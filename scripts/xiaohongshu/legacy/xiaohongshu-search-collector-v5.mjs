#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书搜索采集脚本 v5
 * 修复：移除所有嵌套函数和复杂表达式，使用最简单的语法
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
              link: href,
              text: el.textContent.substring(0, 80),
              noteId: noteId
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
          return { clicked: true, imgSrc: img.src ? img.src.substring(0, 100) : '' };
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
          
          return { title, author, content, images: imgUrls };
        })()`
    }
  });
  return result.data?.result || {};
}

async function scrollPage() {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `window.scrollBy(0, 800)`
    }
  });
}

async function main() {
  const searchUrl = generateSearchUrl(KEYWORD);
  log('INIT', `Search URL: ${searchUrl}`);

  await navigate(searchUrl);
  await new Promise(r => setTimeout(r, 5000));

  const collected = [];
  const processedNoteIds = new Set();
  const uniqueNotes = new Map();
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const results = await getSearchResults();
    let newFound = false;

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const noteId = item.noteId;

      if (!noteId) continue;
      if (processedNoteIds.has(noteId)) continue;

      processedNoteIds.add(noteId);

      log('CLICK', `Processing note ${noteId}`);
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 4000));

      const detailUrl = await getCurrentUrl();
      const detailData = await extractNoteDetail();

      const detailKey = detailData.title + '-' + detailData.author;
      if (uniqueNotes.has(detailKey)) {
        log('SKIP', `Skipping duplicate: ${detailData.title}`);
        await navigate(searchUrl);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      uniqueNotes.set(detailKey, true);
      newFound = true;

      collected.push({
        noteId: noteId,
        detailUrl: detailUrl,
        title: detailData.title,
        author: detailData.author,
        content: detailData.content,
        images: detailData.images
      });

      log('COLLECT', `Collected ${collected.length}/${TARGET_COUNT}`);

      await navigate(searchUrl);
      await new Promise(r => setTimeout(r, 3000));

      if (collected.length >= TARGET_COUNT) break;
    }

    if (!newFound) {
      noNewCount++;
      log('SCROLL', `No new items found (${noNewCount}/${MAX_NO_NEW})`);
    } else {
      noNewCount = 0;
    }

    await scrollPage();
    await new Promise(r => setTimeout(r, 3000));
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
    lines.push('## ' + (i + 1) + '. ' + note.title);
    lines.push('');
    lines.push('**作者：** ' + note.author);
    lines.push('');
    
    if (note.content) {
      let text = note.content;
      if (text.length > 500) text = text.substring(0, 500) + '...';
      lines.push('**内容：** ' + text);
      lines.push('');
    }
    
    if (note.detailUrl) {
      lines.push('**链接：** ' + note.detailUrl);
      lines.push('');
    }
    
    if (note.images && note.images.length > 0) {
      lines.push('**图片：**');
      for (let j = 0; j < note.images.length; j++) {
        lines.push('  - ' + note.images[j]);
      }
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }

  const content = lines.join('\n');
  const filename = 'xiaohongshu_search_results.md';
  
  const fs = await import('fs/promises');
  await fs.writeFile(filename, content, 'utf-8');
  log('OUTPUT', `Markdown saved to: ${filename}`);
  
  console.log('\n📋 Collection Summary:');
  console.log(`   ✅ Total notes: ${collected.length}`);
  console.log(`   📁 Output file: ${filename}`);
  console.log('\n🎉 Collection completed!');
}

main().catch(err => {
  log('ERROR', err.message);
  console.error(err);
});
