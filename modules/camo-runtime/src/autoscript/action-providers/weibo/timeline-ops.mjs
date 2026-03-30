import { devtoolsEval, sleep } from './common.mjs';

// Step 1: Expand all truncated posts in viewport
const EXPAND_ALL_JS = String.raw`(() => {
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

// Step 2: Extract posts with full text + links (no images)
const EXTRACT_TIMELINE_JS = String.raw`(() => {
  const posts = [];
  const items = document.querySelectorAll('.wbpro-scroller-item');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) continue;
    const author = item.querySelector("a[class*='name']");
    const timeLink = item.querySelector("a[class*='time']");
    const ogText = item.querySelector('.wbpro-feed-ogText');
    const reText = item.querySelector('.wbpro-feed-reText');
    const contentEl = item.querySelector('.wbpro-feed-content') || item.querySelector('[class*="wbtext"]');
    const url = timeLink ? timeLink.href.split('?')[0] : null;
    if (!url) continue;
    const authorUrl = author ? author.href : null;
    const authorIdMatch = authorUrl ? authorUrl.match(/weibo\.com\/(\d+)/) : null;
    // Extract external links (exclude hashtag search links)
    const allLinks = contentEl ? Array.from(contentEl.querySelectorAll('a[href]')) : [];
    const links = allLinks
      .filter(a => {
        const href = a.href || '';
        if (!href || href.startsWith('javascript:')) return false;
        if (href.includes('s.weibo.com/weibo?q=')) return false;
        return true;
      })
      .map(a => ({ text: a.textContent.trim(), href: a.href }));
    const fromEl = item.querySelector("a[class*='from']");
    posts.push({
      id: url.split('/').pop(),
      url,
      author: author ? author.textContent.trim() : null,
      authorUrl: authorUrl || null,
      authorId: authorIdMatch ? authorIdMatch[1] : null,
      content: ogText ? ogText.textContent.trim() : null,
      repostContent: reText ? reText.textContent.trim() : null,
      links,
      linkCount: links.length,
      timeText: timeLink ? timeLink.textContent.trim() : null,
      source: fromEl ? fromEl.textContent.trim() : null,
    });
  }
  return JSON.stringify({ posts, count: posts.length });
})()`;

const SCROLL_BOTTOM_JS = String.raw`(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return 'scrolled';
})()`;

const CHECK_TITLE_JS = String.raw`(() => document.title)()`;

export async function checkWeiboLoggedIn(profileId) {
  const title = await devtoolsEval(profileId, CHECK_TITLE_JS, { timeoutMs: 5000 });
  if (!title || typeof title !== 'string') {
    return { ok: false, title: title || '' };
  }
  const loggedIn = title.includes('微博') || title.includes('我的首页') || title.includes('首页');
  return { ok: loggedIn, title };
}

export async function expandTruncatedPosts(profileId) {
  const raw = await devtoolsEval(profileId, EXPAND_ALL_JS, { timeoutMs: 5000 });
  if (raw && typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return { expanded: 0 };
}

export async function extractVisibleTimelinePosts(profileId) {
  const raw = await devtoolsEval(profileId, EXTRACT_TIMELINE_JS, { timeoutMs: 15000 });
  if (!raw || typeof raw !== 'string') {
    return { posts: [], error: 'eval returned non-string' };
  }
  try {
    const data = JSON.parse(raw);
    return { posts: data.posts || [], count: data.count || 0 };
  } catch {
    return { posts: [], error: 'JSON parse error' };
  }
}

export async function scrollToLoadMore(profileId) {
  await devtoolsEval(profileId, SCROLL_BOTTOM_JS, { timeoutMs: 5000 });
}

export async function harvestTimeline({ profileId, maxPosts = 50, scrollDelayMs = 2500, maxEmptyScrolls = 2 } = {}) {
  const allPosts = [];
  const seenUrls = new Set();
  let emptyScrollCount = 0;

  while (allPosts.length < maxPosts) {
    // Expand truncated posts before extracting
    await expandTruncatedPosts(profileId);
    await sleep(500);

    const { posts, error } = await extractVisibleTimelinePosts(profileId);
    if (error) {
      console.warn(`[timeline] extract warning: ${error}`);
    }

    let newInThisRound = 0;
    for (const post of posts) {
      if (!post.url || seenUrls.has(post.url)) continue;
      if (allPosts.length >= maxPosts) break;
      seenUrls.add(post.url);
      post.collectedAt = new Date().toISOString();
      allPosts.push(post);
      newInThisRound++;
    }

    if (allPosts.length >= maxPosts) break;

    if (newInThisRound === 0) {
      emptyScrollCount++;
      if (emptyScrollCount >= maxEmptyScrolls) {
        console.log(`[timeline] reached end: ${emptyScrollCount} consecutive empty scrolls`);
        break;
      }
    } else {
      emptyScrollCount = 0;
    }

    await scrollToLoadMore(profileId);
    await sleep(scrollDelayMs);
  }

  return { posts: allPosts, total: allPosts.length, emptyScrolls: emptyScrollCount };
}

export async function navigateToWeiboHomepage(profileId) {
  const { runCamo } = await import('../../../../../../apps/webauto/entry/lib/camo-cli.mjs');
  const result = runCamo(['goto', profileId, '--url', 'https://weibo.com'], { timeoutMs: 30000 });
  if (!result.ok) {
    return { ok: false, error: result.stderr || 'goto failed' };
  }
  await sleep(3000);
  return { ok: true };
}
