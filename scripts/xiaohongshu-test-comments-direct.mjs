#!/usr/bin/env node
/**
 * 评论完整爬取测试（直接指定详情页）
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const DETAIL_URL = 'https://www.xiaohongshu.com/explore/69525272000000001e00243b?xsec_token=ABsEFzPSpzaPQR9rtWAkQLasNB0b00qMp1il6sWBoIhD8%3D&xsec_source=pc_cfeed';

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

async function ensureDetailPage() {
  const url = await getCurrentUrl();
  if (!url.startsWith('https://www.xiaohongshu.com/explore/69525272000000001e00243b')) {
    log('NAV', '导航到测试详情页');
    await navigate(DETAIL_URL);
    await delay(4000);
  } else {
    log('NAV', '已在测试详情页，刷新当前内容');
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: { profile: PROFILE, script: 'location.reload()' }
    });
    await delay(4000);
  }
}

async function scrollUntilEnd(maxRounds = 40) {
  log('SCROLL', '开始滚动并展开评论');
  for (let i = 0; i < maxRounds; i++) {
    const res = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `(() => {
          const selectors = [
            '.note-scroller',
            '.note-detail-mask .note-scroller',
            '.scroll-container',
            '[class*="scroll"][class*="note"]',
            '.comment-list'
          ];
          let target = null;
          for (const sel of selectors) {
            const node = document.querySelector(sel);
            if (node) { target = node; break; }
          }
          if (!target) {
            target = document.querySelector('.note-detail-mask') || document.scrollingElement || document.body;
          }
          const isWindow = target === document.body || target === document.documentElement || target === window;
          const before = isWindow ? (window.scrollY || document.documentElement.scrollTop) : target.scrollTop;
          const client = isWindow ? window.innerHeight : target.clientHeight;
          const showMores = Array.from(document.querySelectorAll('.show-more')).filter(btn => btn.textContent.includes('展开') && btn.offsetParent !== null);
          let clicked = 0;
          showMores.forEach(btn => {
            if (!btn.dataset.autoClicked) {
              btn.click();
              btn.dataset.autoClicked = '1';
              clicked++;
            }
          });
          if (isWindow) {
            window.scrollBy(0, 700);
          } else {
            target.scrollBy(0, 700);
          }
          let after = isWindow ? (window.scrollY || document.documentElement.scrollTop) : target.scrollTop;
          const max = isWindow ? document.body.scrollHeight : target.scrollHeight;
          const distanceToBottom = max - (after + client);
          if (after === before || distanceToBottom < 50) {
            if (isWindow) {
              window.scrollTo(0, document.body.scrollHeight);
              after = window.scrollY || document.documentElement.scrollTop;
            } else {
              target.scrollTop = target.scrollHeight;
              after = target.scrollTop;
            }
          }
          const endSeen = !!document.querySelector('[class*="end-container"]');
          return { before, after, max, clicked, endSeen, distanceToBottom, client, isWindow };
        })()`
      }
    });
    const result = res.data?.result || {};
    log('SCROLL', `第 ${i + 1} 次：${result.before} => ${result.after} / ${result.max}，展开 ${result.clicked || 0} 个，距底 ${result.distanceToBottom}`);
    if (result.endSeen) {
      log('SCROLL', '检测到 THE END 标记，停止滚动');
      return true;
    }
    await delay(1500);
  }
  log('SCROLL', '达到最大滚动次数仍未看到 THE END');
  return false;
}

async function extractComments() {
  const script = `(() => {
    const comments = [];
    const nodes = document.querySelectorAll('.comment-item');
    nodes.forEach(node => {
      const userEl = node.querySelector('.username, .user-name, .name');
      const contentEl = node.querySelector('.content, .comment-content, [class*="comment"] p');
      const linkEl = node.querySelector('a[href*="/user/profile/"]');
      let userId = '';
      if (linkEl && linkEl.href) {
        const match = linkEl.href.match(/\\/user\\/profile\\/([a-f0-9]+)/);
        if (match) userId = match[1];
      }
      if (userEl && contentEl) {
        comments.push({
          user: userEl.textContent.trim(),
          userId,
          text: contentEl.textContent.trim().replace(/\s+/g, ' ')
        });
      }
    });
    return comments;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || [];
}

async function main() {
  try {
    log('INIT', '=== 评论完整滚动测试 ===');
    await ensureDetailPage();
    const endSeen = await scrollUntilEnd();
    if (!endSeen) {
      log('WARN', '未检测到 THE END，结果可能不完整');
    }
    const comments = await extractComments();
    log('RESULT', `共提取 ${comments.length} 条评论`);
    comments.slice(0, 10).forEach((c, idx) => {
      log('COMMENT', `[${idx + 1}] ${c.user} (${c.userId}) -> ${c.text}`);
    });
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  }
}

main();
