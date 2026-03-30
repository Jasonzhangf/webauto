import { runCamo } from './camo-cli.mjs';
import { sleep } from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/common.mjs';

const EXTRACT_TIMELINE_JS = String.raw`(() => {
  const posts = [];
  const cards = document.querySelectorAll('.card-wrap, [class*="Feed_wrap"]');
  for (const card of cards) {
    const midEl = card.getAttribute('mid') || card.getAttribute('data-mid');
    const fromLinks = Array.from(card.querySelectorAll('.from a[href]'));
    const linkEl = fromLinks.find(a => a.href && a.href.includes('weibo.com/') && !a.href.includes('app.weibo.com'));
    if (!linkEl) continue;
    const url = linkEl.href.split('?')[0];
    const nameEl = card.querySelector('a.name') || card.querySelector('[class*="head_cut"]');
    const contentEl = card.querySelector('p.txt') || card.querySelector('[class*="wbtext"]');
    const author = nameEl ? nameEl.textContent.trim() : null;
    const content = contentEl ? contentEl.textContent.trim().slice(0, 500) : null;
    const urlMatch = url.match(/weibo\\.com\\/(\\d+)\\//);
    const authorId = urlMatch ? urlMatch[1] : null;
    const id = url.split('/').filter(Boolean).pop()?.split('?')[0] || midEl || null;
    posts.push({ id, url, author, authorId, content });
  }
  return JSON.stringify({ posts });
})()`;

const SCROLL_BOTTOM_JS = String.raw`(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return 'scrolled';
})()`;

export async function extractHomepageTimeline({ profileId, timeoutMs = 15000 } = {}) {
  const result = runCamo(['devtools', 'eval', profileId, EXTRACT_TIMELINE_JS], { timeoutMs });
  if (!result.ok || !result.json) {
    return { posts: [], error: result.stderr || 'eval failed' };
  }
  const evalResult = result.json;
  if (!evalResult.result || !evalResult.result.ok) {
    const errMsg = evalResult.result?.error?.message || 'eval expression error';
    return { posts: [], error: errMsg };
  }
  try {
    const data = JSON.parse(evalResult.result.value);
    return { posts: data.posts || [] };
  } catch {
    return { posts: [], error: 'JSON parse error' };
  }
}

export async function scrollAndWaitForMore({ profileId, scrollDelayMs = 1500 } = {}) {
  runCamo(['devtools', 'eval', profileId, SCROLL_BOTTOM_JS], { timeoutMs: 5000 });
  await sleep(scrollDelayMs);
}

export function dedupPosts(posts, seenIds) {
  const newPosts = [];
  for (const post of posts) {
    const key = post.url || post.id;
    if (!key || seenIds.has(key)) continue;
    seenIds.add(key);
    newPosts.push(post);
  }
  return newPosts;
}
