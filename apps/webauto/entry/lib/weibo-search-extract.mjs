import { runCamo } from './camo-cli.mjs';

const EXTRACT_JS = String.raw`(() => {
  const cards = Array.from(document.querySelectorAll('.card-wrap'));
  const posts = [];
  for (const card of cards) {
    const nameEl = card.querySelector('a.name');
    const contentEl = card.querySelector('p.txt') || card.querySelector('.card-feed');
    const fromLinks = Array.from(card.querySelectorAll('.from a'));
    const linkEl = fromLinks.find(a => a.href && a.href.includes('weibo.com/') && !a.href.includes('app.weibo.com'));
    if (!linkEl) continue;
    const url = linkEl.href.split('?')[0];
    const author = nameEl ? nameEl.textContent.trim() : null;
    const content = contentEl ? contentEl.textContent.trim() : null;
    const urlMatch = url.match(/weibo\.com\/(\d+)\//);
    const authorId = urlMatch ? urlMatch[1] : null;
    posts.push({ url, author, authorId, content: content ? content.slice(0, 500) : null });
  }
  const nextEl = document.querySelector('a.next');
  return JSON.stringify({ posts, hasNext: !!nextEl, nextHref: nextEl ? nextEl.href : null });
})()`;

export async function extractSearchPage({ profileId, timeoutMs = 15000 } = {}) {
  const result = runCamo(['devtools', 'eval', profileId, EXTRACT_JS], { timeoutMs });
  if (!result.ok || !result.json) {
    return { posts: [], hasNext: false, nextHref: null, error: result.stderr || 'eval failed' };
  }
  const evalResult = result.json;
  if (!evalResult.result || !evalResult.result.ok) {
    const errMsg = evalResult.result?.error?.message || 'eval expression error';
    return { posts: [], hasNext: false, nextHref: null, error: errMsg };
  }
  try {
    const data = JSON.parse(evalResult.result.value);
    return { posts: data.posts || [], hasNext: data.hasNext || false, nextHref: data.nextHref || null };
  } catch {
    return { posts: [], hasNext: false, nextHref: null, error: 'JSON parse error' };
  }
}
