#!/usr/bin/env node
/**
 * 小红书直接导航测试
 * 目标：验证跳转到不同帖子时 URL/标题 是否变化
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = '手机膜';
const SEARCH_URL = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(KEYWORD)}&source=web_search_result_notes&type=51`;
const TEST_COUNT = 3;

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

async function ensureSearchPage() {
  const currentUrl = await getCurrentUrl();
  if (!currentUrl.startsWith('https://www.xiaohongshu.com/search_result')) {
    log('NAV', '不在搜索页，跳转到当前关键字搜索页');
    await navigate(SEARCH_URL);
    await delay(3000);
    return;
  }
  log('NAV', '已在搜索页');
}

async function getCurrentUrl() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href` }
  })).data?.result || '';
}

async function navigate(url) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href = '${url}'` }
  });
}

async function extractNotes(limit = 5) {
  const script = `(() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    
    for (let i = 0; i < Math.min(${limit}, els.length); i++) {
      const el = els[i];
      const hiddenLink = el.querySelector('a[href^="/explore/"]');
      const coverLink = el.querySelector('a.cover');
      const noteId = hiddenLink ? (hiddenLink.href.match(/\\/explore\\/([a-f0-9]+)/)?.[1] || '') : '';
      let detailUrl = '';
      
      if (coverLink && coverLink.href && noteId) {
        const coverUrl = new URL(coverLink.href, location.origin);
        const token = coverUrl.searchParams.get('xsec_token') || '';
        const source = coverUrl.searchParams.get('xsec_source') || 'pc_search';
        detailUrl = 'https://www.xiaohongshu.com/explore/' + noteId +
          '?xsec_token=' + encodeURIComponent(token) +
          '&xsec_source=' + encodeURIComponent(source) +
          '&source=web_search_result_notes';
      } else if (hiddenLink && hiddenLink.href) {
        detailUrl = new URL(hiddenLink.getAttribute('href'), location.origin).href;
      }
      
      items.push({
        index: i,
        noteId,
        title: el.textContent.trim().substring(0, 50),
        detailUrl
      });
    }
    
    return items;
  })()`;

  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  return result.data?.result || [];
}

async function getDetailInfo() {
  const script = `(() => {
    const titleEl = document.querySelector('.title, #detail-title, h1');
    return {
      url: location.href,
      title: titleEl ? titleEl.textContent.trim() : '',
      noteIdFromUrl: (location.href.match(/explore\\/([a-f0-9]+)/) || [])[1] || ''
    };
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || {};
}

async function main() {
  try {
    log('INIT', `=== 小红书直接导航测试 (关键字: ${KEYWORD}) ===`);
    await ensureSearchPage();
    await delay(2000);
    
    const notes = await extractNotes(TEST_COUNT + 2);
    log('LIST', `找到 ${notes.length} 个列表项`);
    if (notes.length === 0) {
      log('ERROR', '没有找到任何列表项');
      return;
    }
    
    const selected = notes.filter(n => n.noteId && n.detailUrl).slice(0, TEST_COUNT);
    if (selected.length < TEST_COUNT) {
      log('WARN', '有效帖子少于测试数量');
    }
    
    const results = [];
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      log('TEST', `导航第 ${i + 1} 个帖子：${item.title} (${item.noteId})`);
      log('TEST', `URL -> ${item.detailUrl}`);
      
      await navigate(item.detailUrl);
      await delay(4000);
      
      const info = await getDetailInfo();
      log('DETAIL', `当前URL: ${info.url}`);
      log('DETAIL', `标题: ${info.title}`);
      results.push(info);
      
      log('TEST', '返回搜索页...');
      await navigate(SEARCH_URL);
      await delay(4000);
    }
    
    log('RESULT', '=== 导航结果 ===');
    results.forEach((info, idx) => {
      log('RESULT', `#${idx + 1} noteId=${info.noteIdFromUrl} title=${info.title}`);
    });
    
    const uniqueIds = new Set(results.map(r => r.noteIdFromUrl));
    log('RESULT', `共 ${results.length} 条，唯一 noteId: ${uniqueIds.size}`);
    if (uniqueIds.size === results.length) {
      log('RESULT', '✅ 导航切换成功');
    } else {
      log('RESULT', '❌ 导航存在重复，请进一步排查');
    }
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  }
}

main();
