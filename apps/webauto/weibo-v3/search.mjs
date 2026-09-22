// Desktop Weibo search list. The mobile search API has no real pagination, so
// this page DAG stays on the desktop surface and follows pager links.

import { WEIBO_ANCHORS } from './browser.mjs';
import { normalizePost, dedupeBy } from './extract.mjs';

const READ_SEARCH_PAGE = `(() => {
  const seen = new Set();
  const posts = [];
  const links = [...document.querySelectorAll(".card-wrap a[href*='weibo.com/']")];
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/weibo\\.com\\/(?:\\d+|u\\/\\d+)\\/([A-Za-z0-9]+)/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    const card = link.closest('.card-wrap') || link;
    posts.push({
      mid: match[1],
      url: href.startsWith('//') ? 'https:' + href : href,
      text: (card.innerText || '').slice(0, 500),
    });
  }
  const pages = [...document.querySelectorAll("a[href*='page=']")]
    .map((anchor) => {
      const match = (anchor.getAttribute('href') || '').match(/page=(\\d+)/);
      return match ? Number(match[1]) : null;
    })
    .filter((value) => Number.isInteger(value));
  return {
    url: location.href,
    posts,
    pages: [...new Set(pages)].sort((a, b) => a - b),
  };
})()`;

export async function collectSearch({
  runtime,
  browser,
  topic,
  maxPages = 3,
  limit = 30,
  onPage = null,
} = {}) {
  if (!runtime) throw new Error('collectSearch requires the v3 runtime');
  if (!browser) throw new Error('collectSearch requires browser');
  const keyword = String(topic || '').trim();
  if (!keyword) throw new Error('collectSearch requires topic');
  const state = {
    found: [],
    visited: [],
    tailReason: null,
  };

  await browser.setViewport(1440, 900);
  const pageResult = await runtime.runPage({
    pageDagId: 'weibo.desktop.search',
    browser,
    selectors: WEIBO_ANCHORS.desktopSearch,
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: 'search',
      binding_id: 'weibo.search',
      item_key: keyword,
    },
    nodes: [
      {
        node_id: 'open',
        kind: 'Act',
        operation_kind: 'goto',
        operation_args: { url: 'https://s.weibo.com/weibo' },
        post_anchors: ['result.list'],
      },
      {
        node_id: 'collect_pages',
        kind: 'Extract',
        post_anchors: ['result.list'],
      },
    ],
    executor: async (node) => {
      if (node.node_id !== 'open') return { ok: true, outputs: {} };
      await browser.goto('https://s.weibo.com/weibo');
      await browser.fillInput(WEIBO_ANCHORS.desktopSearch['search.input'], keyword);
      // Submit from the keyboard, matching the page-search contract: the
      // keyword is entered in the input and submitted with Enter.
      await browser.pressKey('Enter');
      return { ok: true, outputs: {} };
    },
    extractors: {
      collect_pages: async () => {
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
          if (pageNumber > 1) await browser.click(WEIBO_ANCHORS.desktopSearch['pager.next']);
          const anchors = await browser.observeAnchors(WEIBO_ANCHORS.desktopSearch);
          if ((anchors['result.list']?.count || 0) <= 0) {
            state.tailReason = 'empty_result';
            state.visited.push({ page: pageNumber, posts: 0 });
            break;
          }
          const page = await browser.evaluate(READ_SEARCH_PAGE);
          const posts = (page?.posts || []).map((post) => normalizePost(post));
          state.visited.push({ page: pageNumber, posts: posts.length, url: page?.url || null });
          state.found.push(...posts);
          const unique = dedupeBy(state.found, (post) => post.mid || post.url);
          state.found.length = 0;
          state.found.push(...unique);
          if (state.found.length >= limit) {
            state.tailReason = 'limit_reached';
            break;
          }
          const maxPage = Math.max(0, ...(page?.pages || []));
          if (maxPage > 0 && pageNumber >= maxPage) {
            state.tailReason = 'last_page';
            break;
          }
          if (onPage) await onPage({ page: pageNumber, posts, total: state.found.length });
        }
        return { posts: state.found.slice(0, limit) };
      },
    },
  });
  if (pageResult.status !== 'succeeded') {
    throw new Error(`search page DAG failed for ${keyword}: ${pageResult.reason_code || pageResult.verdict || pageResult.status}`);
  }
  return {
    topic: keyword,
    surface: 'desktop',
    pagesVisited: state.visited,
    tailReason: state.tailReason,
    posts: pageResult.outputs.collect_pages?.posts || [],
    pageResult,
  };
}
