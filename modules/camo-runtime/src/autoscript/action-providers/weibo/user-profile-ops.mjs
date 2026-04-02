import { devtoolsEval } from './common.mjs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const BROWSER_SERVICE_URL = process.env.CAMO_BROWSER_HTTP_PROTO
  ? `${process.env.CAMO_BROWSER_HTTP_PROTO}://${process.env.CAMO_BROWSER_HTTP_HOST || '127.0.0.1'}:${process.env.CAMO_BROWSER_HTTP_PORT || 7704}`
  : 'http://127.0.0.1:7704';

async function callAPI(action, payload = {}, timeoutMs = 20000) {
  const r = await fetch(`${BROWSER_SERVICE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args: payload }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return r.json();
}

const CHECK_TITLE_JS = String.raw`(() => document.title)()`;

const SCROLL_BOTTOM_JS = String.raw`(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return 'scrolled';
})()`;

const CHECK_BOTTOM_JS = String.raw`(() => {
  const bottomEl = document.querySelector('div[class*="_box_1px0u"]');
  if (!bottomEl) return JSON.stringify({ bottom: false });
  const text = bottomEl.textContent || '';
  return JSON.stringify({ bottom: text.includes('没有更多') });
})()`;

const EXTRACT_USER_PROFILE_POSTS_JS = String.raw`(() => {
  const posts = [];
  // User profile page uses vue-recycle-scroller for virtual scrolling
  const items = document.querySelectorAll('.vue-recycle-scroller__item-view');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) continue;
    // Skip if item has no content (virtual scroll placeholder)
    const card = item.querySelector('.wbpro-scroller-item') || item.querySelector('[class*="wbpro-feed"]');
    if (!card) continue;
    const author = card.querySelector("a[class*='name']") || card.querySelector('a[usercard]');
    const timeLink = card.querySelector("a[class*='time']");
    const contentEl = card.querySelector('.wbpro-feed-content') || card.querySelector('[class*="wbtext"]');
    const url = timeLink ? timeLink.href.split('?')[0] : null;
    if (!url) continue;
    const authorUrl = author ? author.href : null;
    const authorIdMatch = authorUrl ? authorUrl.match(/weibo\.com\/(\d+)/) : null;
    const allLinks = contentEl ? Array.from(contentEl.querySelectorAll('a[href]')) : [];
    const links = allLinks
      .filter(a => {
        const href = a.href || '';
        if (!href || href.startsWith('javascript:')) return false;
        if (href.includes('s.weibo.com/weibo?q=')) return false;
        return true;
      })
      .map(a => ({ text: a.textContent.trim(), href: a.href }));
    const fromEl = card.querySelector("a[class*='from']");
    posts.push({
      id: url.split('/').pop(),
      url,
      author: author ? author.textContent.trim() : null,
      authorUrl: authorUrl || null,
      authorId: authorIdMatch ? authorIdMatch[1] : null,
      content: contentEl ? contentEl.textContent.trim() : null,
      links,
      linkCount: links.length,
      timeText: timeLink ? timeLink.textContent.trim() : null,
      source: fromEl ? fromEl.textContent.trim() : null,
    });
  }
  return JSON.stringify({ posts, count: posts.length });
})()`;

const EXPAND_TRUNCATED_JS = String.raw`(() => {
  const items = document.querySelectorAll('.wbpro-scroller-item');
  let expanded = 0;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) continue;
    const expandBtn = item.querySelector('[class*="expand"]');
    if (expandBtn && (expandBtn.textContent.trim() === '展开' || expandBtn.textContent.trim() === '展开全文')) {
      expandBtn.click();
      expanded++;
    }
  }
  return JSON.stringify({ expanded });
})()`;

export async function navigateToUserProfile(profileId, userId) {
  const url = `https://weibo.com/u/${userId}`;
  const result = await callAPI('goto', { profileId, url }, 30000);
  if (!result?.ok) {
    return { ok: false, error: result.error || result.stderr || 'goto failed' };
  }
  await sleep(3000);
  const title = await devtoolsEval(profileId, CHECK_TITLE_JS, { timeoutMs: 5000 });
  return { ok: true, title: title || '' };
}

export async function extractUserProfilePosts(profileId) {
  const raw = await devtoolsEval(profileId, EXTRACT_USER_PROFILE_POSTS_JS, { timeoutMs: 15000 });
  if (!raw || typeof raw !== 'string') {
    return { posts: [], error: 'eval returned non-string' };
  }
  try {
    const data = JSON.parse(raw);
    return { posts: data.posts || [], count: data.count || 0 };
  } catch {
    return { posts: [], error: 'parse failed' };
  }
}

export async function expandTruncatedPosts(profileId) {
  const raw = await devtoolsEval(profileId, EXPAND_TRUNCATED_JS, { timeoutMs: 5000 });
  if (raw && typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return { expanded: 0 };
}

export async function scrollUserProfileToBottom(profileId) {
  await devtoolsEval(profileId, SCROLL_BOTTOM_JS, { timeoutMs: 5000 });
}

export async function checkBottomReached(profileId) {
  const raw = await devtoolsEval(profileId, CHECK_BOTTOM_JS, { timeoutMs: 5000 });
  if (raw && typeof raw === 'string') {
    try {
      const data = JSON.parse(raw);
      return data.bottom === true;
    } catch {}
  }
  return false;
}

export async function harvestUserProfile({
  profileId,
  userId,
  target = 50,
  scrollDelay = 2500,
  maxEmptyScrolls = 2,
} = {}) {
  const allPosts = [];
  const seenUrls = new Set();
  let emptyScrollCount = 0;
  let rounds = 0;

  while (allPosts.length < target) {
    rounds++;
    // Expand truncated posts
    await expandTruncatedPosts(profileId);
    await sleep(500);

    // Extract visible posts
    const { posts, error } = await extractUserProfilePosts(profileId);
    if (error) {
      console.warn(`[user-profile:${userId}] extract warning: ${error}`);
    }

    let newInThisRound = 0;
    for (const post of posts) {
      if (!post.url || seenUrls.has(post.url)) continue;
      if (allPosts.length >= target) break;
      seenUrls.add(post.url);
      post.collectedAt = new Date().toISOString();
      post.userId = userId;
      allPosts.push(post);
      newInThisRound++;
    }

    if (allPosts.length >= target) break;

    // Check if bottom reached
    const bottomReached = await checkBottomReached(profileId);
    if (bottomReached) {
      console.log(`[user-profile:${userId}] bottom reached after ${rounds} rounds`);
      break;
    }

    if (newInThisRound === 0) {
      emptyScrollCount++;
      if (emptyScrollCount >= maxEmptyScrolls) {
        console.log(`[user-profile:${userId}] reached end: ${emptyScrollCount} consecutive empty scrolls`);
        break;
      }
    } else {
      emptyScrollCount = 0;
    }

    await scrollUserProfileToBottom(profileId);
    const jitter = Math.floor(Math.random() * 2500);
    await sleep(scrollDelay + jitter);
  }

  return {
    ok: true,
    posts: allPosts,
    total: allPosts.length,
    rounds,
    emptyScrolls: emptyScrollCount,
  };
}
