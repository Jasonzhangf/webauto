#!/usr/bin/env node
/**
 * 小红书搜索采集脚本 v2
 * 修复：1. 改进去重逻辑 2. 保存为Markdown 3. 图片只保存URL
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

function extractNoteId(href) {
  if (!href) return null;
  const match = href.match(/\/explore\/([a-f0-9]+)/);
  return match ? match[1] : null;
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
      script: `
        (() => {
          const noteItems = Array.from(document.querySelectorAll('.note-item'));
          return noteItems.map((el, index) => {
            const link = el.querySelector('a')?.href;
            return {
              index,
              link: link || '',
              text: el.textContent.substring(0, 80),
              noteId: link ? extractNoteIdFromHref(link) : ''
            };
          });
          
          function extractNoteIdFromHref(href) {
            const match = href.match(/\/explore\/([a-f0-9]+)/);
            return match ? match[1] : '';
          }
        })()
      `
    }
  });
  return result.data?.result || [];
}

async function clickNoteImage(index) {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (() => {
          const noteItems = Array.from(document.querySelectorAll('.note-item'));
          const target = noteItems[${index}];
          if (!target) return { clicked: false };
          const img = target.querySelector('img');
          if (!img) return { clicked: false };
          img.click();
          return { clicked: true, imgSrc: img.src.substring(0, 100) };
        })()
      `
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
      script: `
        (() => {
          const title = document.querySelector('[class*="title"]')?.textContent?.trim() || '';
          const author = document.querySelector('[class*="author"]')?.textContent?.trim() || '';
          const content = document.querySelector('[class*="content"]')?.textContent?.trim() || '';
          const images = Array.from(document.querySelectorAll('img'))
            .filter(img => img.src && !img.src.startsWith('data:'))
            .map(img => img.src)
            .slice(0, 5);
          return { title, author, content, images };
        })()
      `
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
  const collectedNoteIds = new Set();
  const processedNoteIds = new Set(); // 记录已经处理过的noteId（不管是否保存）
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const results = await getSearchResults();
    let newFound = false;

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const noteId = item.noteId;

      // 跳过无效的noteId
      if (!noteId) continue;

      // 跳过已经处理过的noteId
      if (processedNoteIds.has(noteId)) continue;

      processedNoteIds.add(noteId);
      newFound = true;

      log('CLICK', `Clicking note ${noteId}`);
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 4000));

      const detailUrl = await getCurrentUrl();
      const detailData = await extractNoteDetail();

      // 检查是否真的是新笔记（基于标题和作者）
      const isDuplicate = collected.some(c => 
        c.title === detailData.title && c.author === detailData.author
      );

      if (isDuplicate) {
        log('SKIP', `Skipping duplicate: ${detailData.title}`);
        await navigate(searchUrl);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      collected.push({
        noteId,
        detailUrl,
        ...detailData
      });

      log('COLLECT', `Collected ${collected.length}/${TARGET_COUNT}`);

      // 返回搜索页面
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

  // 生成Markdown
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

  collected.forEach((note, index) => {
    lines.push(`## ${index + 1}. ${note.title}`);
    lines.push('');
    lines.push(`**作者：** ${note.author}`);
    lines.push('');
    
    if (note.content) {
      lines.push(`**内容：** ${note.content.substring(0, 500)}`);
      lines.push('');
    }
    
    if (note.detailUrl) {
      lines.push(`**链接：** ${note.detailUrl}`);
      lines.push('');
    }
    
    if (note.images && note.images.length > 0) {
      lines.push('**图片：**');
      note.images.forEach(img => {
        lines.push(`  - ${img}`);
      });
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });

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
