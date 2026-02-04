#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * [LEGACY] 小红书搜索采集脚本
 *
 * ⚠️ 该脚本存在多处“非系统级操作”（DOM click / location.href / JS scroll），
 * 与仓库强制规则（只允许系统 click/scroll/输入）冲突。
 *
 * 目前小红书主回归入口请使用 scripts/xiaohongshu/phase1-4 系列脚本。
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
          return noteItems.map((el, index) => ({
            index,
            link: el.querySelector('a')?.href,
            text: el.textContent.substring(0, 80),
            hasImage: !!el.querySelector('img')
          }));
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
          const title = document.querySelector('[class*=\\"title\\"]')?.textContent?.trim();
          const author = document.querySelector('[class*=\\"author\\"]')?.textContent?.trim();
          const content = document.querySelector('[class*=\\"content\\"]')?.textContent?.trim();
          const images = Array.from(document.querySelectorAll('img')).map(img => img.src).slice(0, 5);
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
  const collectedIds = new Set();
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const results = await getSearchResults();
    let newCount = 0;

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const noteId = extractNoteId(item.link);

      if (!noteId || collectedIds.has(noteId)) continue;

      collectedIds.add(noteId);
      newCount++;

      log('CLICK', `Clicking note ${noteId}`);
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 4000));

      const detailUrl = await getCurrentUrl();
      const detailData = await extractNoteDetail();

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

    if (newCount === 0) {
      noNewCount++;
      log('SCROLL', `No new items found (${noNewCount}/${MAX_NO_NEW})`);
    } else {
      noNewCount = 0;
    }

    await scrollPage();
    await new Promise(r => setTimeout(r, 3000));
  }

  log('DONE', `Total collected: ${collected.length}`);

  const fs = await import('fs/promises');
  await fs.writeFile('xiaohongshu_search_results.json', JSON.stringify(collected, null, 2));
  log('OUTPUT', 'Saved to xiaohongshu_search_results.json');
}

main().catch(err => {
  log('ERROR', err.message);
  console.error(err);
});
