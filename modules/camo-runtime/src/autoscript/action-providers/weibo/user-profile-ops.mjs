import { callAPI } from '../../shared/api-client.mjs';
import { sleep } from '../../shared/dom-ops.mjs';
import { devtoolsEval } from './common.mjs';




const CHECK_TITLE_JS = String.raw`(() => document.title)()`;

const SCROLL_BOTTOM_JS = String.raw`(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return 'scrolled';
})()`;

const CHECK_BOTTOM_JS = String.raw`(() => {
  return JSON.stringify({
    scrollY: window.scrollY,
    bodyHeight: document.body.scrollHeight,
    innerHeight: window.innerHeight,
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
  return JSON.stringify({ posts, count: posts.length });
})()`;

const EXPAND_TRUNCATED_JS = String.raw`(() => {
  const items = document.querySelectorAll('.wbpro-scroller-item');
  let expanded = 0;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) continue;
    const expandBtn = item.querySelector('span.expand');
    if (expandBtn) {
      expandBtn.click();
      expanded++;
  return JSON.stringify({ expanded });
})()`;

export async function navigateToUserProfile(profileId, userId) {
  const url = `https://weibo.com/u/${userId}`;
  // Use camo CLI goto (more reliable than callAPI for navigation)
  const { execSync } = await import('child_process');
  try {
    execSync(`camo goto ${profileId} --url ${url}`, { timeout: 30000, encoding: 'utf-8' });
  } catch (err) {
    return { ok: false, error: err.message || 'goto failed' };

  // Wait for page to load with anchor polling (SPA may need time)
  const ANCHOR_WAIT_MS = 20000;
  const POLL_INTERVAL = 1000;
  const start = Date.now();
  while (Date.now() - start < ANCHOR_WAIT_MS) {
    await sleep(POLL_INTERVAL);
    try {
      const title = await devtoolsEval(profileId, CHECK_TITLE_JS, { timeoutMs: 5000 });
      if (title && typeof title === 'string' && title.includes('的个人主页')) {
        await sleep(1000); // extra settle
        return { ok: true, title };
      // Also check for feed items
      const check = await devtoolsEval(profileId, String.raw`(() => document.querySelectorAll('.vue-recycle-scroller__item-view').length)()`, { timeoutMs: 5000 });
      if (check && Number(check) > 0) {
        await sleep(1000);
        const title2 = await devtoolsEval(profileId, CHECK_TITLE_JS, { timeoutMs: 5000 });
        return { ok: true, title: title2 || '' };
    } catch {}
  // Fallback: return whatever we have
  try {
    const title = await devtoolsEval(profileId, CHECK_TITLE_JS, { timeoutMs: 5000 });
    return { ok: true, title: title || '' };
  } catch {
    return { ok: false, error: 'page load timeout' };

export async function extractUserProfilePosts(profileId) {
  const raw = await devtoolsEval(profileId, EXTRACT_USER_PROFILE_POSTS_JS, { timeoutMs: 15000 });
  const rawType = typeof raw;
  const rawPreview = rawType === 'string' ? raw.slice(0, 100) : JSON.stringify(raw)?.slice(0, 100);
  console.error(`[user-profile:DEBUG] extractUserProfilePosts raw type=${rawType} preview=${rawPreview}`);
  if (!raw || typeof raw !== 'string') {
    return { posts: [], error: `eval returned ${rawType}` };
  try {
    const data = JSON.parse(raw);
    return { posts: data.posts || [], count: data.count || 0 };
  } catch {
    return { posts: [], error: 'parse failed' };

export async function expandTruncatedPosts(profileId) {
  const raw = await devtoolsEval(profileId, EXPAND_TRUNCATED_JS, { timeoutMs: 5000 });
  if (raw && typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {}
  return { expanded: 0 };

export async function scrollUserProfileToBottom(profileId) {
  await devtoolsEval(profileId, SCROLL_BOTTOM_JS, { timeoutMs: 5000 });

export async function checkBottomReached(profileId, prevState = {}) {
  const raw = await devtoolsEval(profileId, CHECK_BOTTOM_JS, { timeoutMs: 5000 });
  if (raw && typeof raw === 'string') {
    try {
      const data = JSON.parse(raw);
      const stagnation = (prevState.scrollY === data.scrollY && prevState.bodyHeight === data.bodyHeight);
      return { ...data, stagnation };
    } catch {}
  return { stagnation: false };

export async function harvestUserProfile({
  profileId,
  userId,
  target = 50,
  scrollDelay = 2500,
  maxEmptyScrolls = 3,
  existingUrls = null,
  checkpointPath = null,
} = {}) {
  const allPosts = [];
  const seenUrls = existingUrls instanceof Set ? existingUrls : new Set(existingUrls || []);
  let resumedCount = seenUrls.size;

  // Resume from checkpoint if available
  if (checkpointPath) {
    try {
      const fs = await import('fs');
      const raw = await fs.promises.readFile(checkpointPath, 'utf-8');
      const ckpt = JSON.parse(raw);
      if (ckpt?.seenUrls) {
        for (const u of ckpt.seenUrls) seenUrls.add(u);
        resumedCount = seenUrls.size;
        console.log(`[user-profile:${userId}] resumed from checkpoint with ${resumedCount} existing URLs`);
    } catch {}

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

    let newInThisRound = 0;
    for (const post of posts) {
      if (!post.url || seenUrls.has(post.url)) continue;
      if (allPosts.length >= target) break;
      seenUrls.add(post.url);
      post.collectedAt = new Date().toISOString();
      post.userId = userId;
      allPosts.push(post);
      newInThisRound++;

    if (allPosts.length >= target) break;

    // Save checkpoint every 5 rounds
    if (checkpointPath && rounds % 5 === 0) {
      try {
        const fs = await import('fs');
        await fs.promises.writeFile(checkpointPath, JSON.stringify({
          userId, target, rounds, collectedCount: allPosts.length,
          seenUrls: [...seenUrls], savedAt: new Date().toISOString(),
        }, null, 2));
      } catch {}

    // Check if bottom reached or no new posts
    const scrollInfo = await checkBottomReached(profileId);
    const noProgress = newInThisRound === 0 || scrollInfo?.stagnation;
    if (noProgress) {
      emptyScrollCount++;
      if (emptyScrollCount >= maxEmptyScrolls) {
        console.log(`[user-profile:${userId}] reached end after ${rounds} rounds (${emptyScrollCount} consecutive no-progress)`);
        break;
    } else {
      emptyScrollCount = 0;

    await scrollUserProfileToBottom(profileId);
    const jitter = Math.floor(Math.random() * 2500);
    await sleep(scrollDelay + jitter);

  return {
    ok: true,
    posts: allPosts,
    total: allPosts.length + resumedCount,
    newPosts: allPosts.length,
    skippedDuplicates: resumedCount,
    rounds,
    emptyScrolls: emptyScrollCount,
    resumedFromCheckpoint: resumedCount > 0,
  };
