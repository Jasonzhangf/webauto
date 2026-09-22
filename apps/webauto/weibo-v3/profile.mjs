// User profile list collection. Mobile is the default surface because it is
// materially faster for post lists; desktop remains available for parity.

import { WEIBO_ANCHORS } from './browser.mjs';
import { dedupeBy, normalizePost } from './extract.mjs';

const READ_DESKTOP_PROFILE = `(() => {
  const posts = [];
  const items = document.querySelectorAll('.wbpro-scroller-item');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) continue;
    const timeLink = item.querySelector("a[class*='time']");
    const author = item.querySelector("a[class*='name']");
    const content = item.querySelector('.wbpro-feed-content') || item.querySelector('[class*="wbtext"]');
    const url = timeLink ? timeLink.href.split('?')[0] : null;
    if (!url) continue;
    posts.push({
      id: url.split('/').pop(),
      url,
      authorName: author ? author.textContent.trim() : null,
      authorId: author?.href?.match(/weibo\\.com\\/(\\d+)/)?.[1] || null,
      content: content ? content.textContent.trim() : null,
      timeText: timeLink.textContent.trim(),
    });
  }
  return { url: location.href, posts };
})()`;

const READ_MOBILE_PROFILE = `(() => {
  const posts = [];
  const cards = document.querySelectorAll('.card9');
  for (const card of cards) {
    const anchor = card.querySelector("a[href*='/detail/']") || card.querySelector("a[href*='m.weibo.cn']");
    const text = card.querySelector('.weibo-text') || card.querySelector('.weibo-main');
    const url = anchor ? anchor.href.split('?')[0] : null;
    if (!url || !url.includes('/detail/')) continue;
    posts.push({
      id: url.split('/').pop(),
      url,
      content: text ? text.textContent.trim() : null,
    });
  }
  return { url: location.href, posts };
})()`;

function isVisibleAnchor(anchor) {
  return Number(anchor?.count || 0) > 0 && anchor?.visible === true;
}

async function collectRenderedProfile({
  browser,
  userId,
  target,
  scrollWaitMs,
  maxEmptyScrolls,
  selectors,
  readScript,
}) {
  const posts = [];
  let emptyScrolls = 0;
  let rounds = 0;
  const maxRounds = Math.max(2, Math.ceil(target / 5) + maxEmptyScrolls + 5);
  const readyAnchor = Object.keys(selectors)[0] || 'profile.root';

  async function waitForContentChange(previousDigest) {
    const startedAt = Date.now();
    const waitMs = Math.max(500, Number(scrollWaitMs) || 2500);
    while (Date.now() - startedAt < waitMs) {
      const anchors = await browser.observeAnchors(selectors);
      const anchor = anchors[readyAnchor];
      if (isVisibleAnchor(anchor)) {
        const page = await browser.evaluate(readScript);
        const rows = (page?.posts || []).map((post) => normalizePost(post, { userId }));
        const digest = rows.map((post) => post.mid || post.url).filter(Boolean).join('|');
        if (digest && digest !== previousDigest) return { anchors, rows };
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const anchors = await browser.observeAnchors(selectors);
    const page = await browser.evaluate(readScript);
    return {
      anchors,
      rows: (page?.posts || []).map((post) => normalizePost(post, { userId })),
    };
  }

  while (posts.length < target && rounds < maxRounds) {
    rounds++;
    const anchors = await browser.observeAnchors(selectors);
    const root = isVisibleAnchor(anchors[readyAnchor])
      ? anchors[readyAnchor]
      : Object.values(anchors).find(isVisibleAnchor);
    if (!root) {
      emptyScrolls++;
      if (emptyScrolls >= maxEmptyScrolls) break;
    }
    const page = await browser.evaluate(readScript);
    const normalized = (page?.posts || []).map((post) => normalizePost(post, { userId }));
    const before = posts.length;
    posts.push(...normalized);
    const unique = dedupeBy(posts, (post) => post.mid || post.url);
    posts.length = 0;
    posts.push(...unique);
    if (posts.length >= target) break;
    if (posts.length === before) {
      emptyScrolls++;
      if (emptyScrolls >= maxEmptyScrolls) break;
    } else {
      emptyScrolls = 0;
    }
    await browser.scroll(Math.max(600, Math.floor(800 + Math.random() * 500)));
    const digest = posts.map((post) => post.mid || post.url).filter(Boolean).join('|');
    const settled = await waitForContentChange(digest);
    const settledRows = settled.rows || [];
    if (settledRows.length > 0) {
      const settledUnique = dedupeBy([...posts, ...settledRows], (post) => post.mid || post.url);
      posts.length = 0;
      posts.push(...settledUnique);
    }
  }

  return { posts: posts.slice(0, target), rounds, emptyScrolls };
}

export async function collectProfile({
  runtime,
  browser,
  userId,
  target = 50,
  surface = 'mobile',
  scrollWaitMs = 2500,
  maxEmptyScrolls = 2,
} = {}) {
  if (!runtime) throw new Error('collectProfile requires the v3 runtime');
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('collectProfile requires userId');
  const desktop = surface === 'desktop';
  const url = desktop ? `https://weibo.com/u/${uid}` : `https://m.weibo.cn/u/${uid}`;
  const selectors = desktop ? WEIBO_ANCHORS.desktopProfile : WEIBO_ANCHORS.mobileProfile;
  const readScript = desktop ? READ_DESKTOP_PROFILE : READ_MOBILE_PROFILE;
  const pageKind = desktop ? 'weibo.desktop.profile' : 'weibo.mobile.profile';
  const pageResult = await runtime.runPage({
    pageDagId: pageKind,
    browser,
    selectors,
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: 'profile',
      binding_id: pageKind,
      item_key: uid,
    },
    nodes: [
      {
        node_id: 'open',
        kind: 'Act',
        operation_kind: 'goto',
        operation_args: { url },
        post_anchors: ['profile.root'],
      },
      {
        node_id: 'collect_posts',
        kind: 'Extract',
        post_anchors: ['profile.root'],
      },
    ],
    executor: async (node) => {
      if (node.node_id !== 'open') return { ok: true, outputs: {} };
      if (desktop) await browser.setViewport(1440, 900);
      else await browser.setViewport(390, 844);
      await browser.goto(url);
      return { ok: true, outputs: {} };
    },
    extractors: {
      collect_posts: async () => collectRenderedProfile({
        browser,
        userId: desktop ? uid : uid,
        target,
        scrollWaitMs,
        maxEmptyScrolls,
        selectors,
        readScript,
      }),
    },
  });
  if (pageResult.status !== 'succeeded') {
    throw new Error(`profile page DAG failed for ${uid}: ${pageResult.reason_code || pageResult.verdict || pageResult.status}`);
  }
  return {
    ...pageResult.outputs.collect_posts,
    pageResult,
  };
}

export async function collectTimeline({
  runtime,
  browser,
  target = 50,
  scrollWaitMs = 2500,
  maxEmptyScrolls = 2,
} = {}) {
  if (!runtime) throw new Error('collectTimeline requires the v3 runtime');
  const url = 'https://weibo.com';
  const pageResult = await runtime.runPage({
    pageDagId: 'weibo.desktop.timeline',
    browser,
    selectors: WEIBO_ANCHORS.desktopProfile,
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: 'timeline',
      binding_id: 'weibo.timeline',
      item_key: 'home',
    },
    nodes: [
      {
        node_id: 'open',
        kind: 'Act',
        operation_kind: 'goto',
        operation_args: { url },
        post_anchors: ['profile.root'],
      },
      {
        node_id: 'collect_posts',
        kind: 'Extract',
        post_anchors: ['profile.root'],
      },
    ],
    executor: async (node) => {
      if (node.node_id !== 'open') return { ok: true, outputs: {} };
      await browser.setViewport(1440, 900);
      await browser.goto(url);
      return { ok: true, outputs: {} };
    },
    extractors: {
      collect_posts: async () => collectRenderedProfile({
        browser,
        userId: null,
        target,
        scrollWaitMs,
        maxEmptyScrolls,
        selectors: WEIBO_ANCHORS.desktopProfile,
        readScript: READ_DESKTOP_PROFILE,
      }),
    },
  });
  if (pageResult.status !== 'succeeded') {
    throw new Error(`timeline page DAG failed: ${pageResult.reason_code || pageResult.verdict || pageResult.status}`);
  }
  return {
    ...pageResult.outputs.collect_posts,
    pageResult,
  };
}
