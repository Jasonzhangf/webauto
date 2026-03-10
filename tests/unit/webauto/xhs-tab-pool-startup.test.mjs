import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('xhs tab pool startup fill', () => {
  it('preopens safe-link startup tabs up to tabCount before reuse rotation', async () => {
    const pages = [{ index: 1, url: 'https://www.xiaohongshu.com/explore', active: true }];
    const actionCalls = [];

    const fetchMock = mock.method(globalThis, 'fetch', async (url, init = {}) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const action = String(body?.action || '');
      const payload = body?.args || {};
      actionCalls.push({ action, payload });
      if (action === 'page:list') {
        return {
          ok: true,
          json: async () => ({ ok: true, data: { pages: pages.map((page) => ({ ...page })), activeIndex: 1 } }),
          text: async () => '',
        };
      }
      if (action === 'newPage') {
        const nextIndex = pages.length + 1;
        pages.push({ index: nextIndex, url: 'about:blank', active: false });
        return {
          ok: true,
          json: async () => ({ ok: true, index: nextIndex }),
          text: async () => '',
        };
      }
      if (action === 'goto') {
        const active = pages.find((page) => page.active) || pages[0];
        if (active) active.url = String(payload?.url || active.url);
        return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
      }
      if (action === 'page:switch') {
        const targetIndex = Number(payload?.index);
        for (const page of pages) page.active = Number(page.index) === targetIndex;
        return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
      }
      return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
    });

    try {
      const { executeTabPoolOperation } = await import('../../../modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs');
      const runtime = {};
      const result = await executeTabPoolOperation({
        profileId: 'xhs-qa-1',
        action: 'ensure_tab_pool',
        params: {
          tabCount: 4,
          url: 'https://www.xiaohongshu.com/explore',
          openDelayMs: 0,
          minDelayMs: 0,
          tabAppearTimeoutMs: 200,
          reuseOnly: false,
          normalizeTabs: true,
          seedOnOpen: true,
          syncViewport: false,
        },
        context: { runtime },
      });

      assert.equal(result.ok, true);
      assert.equal(result.data.tabCount, 4);
      assert.equal(runtime.tabPool.count, 4);
      assert.deepEqual(runtime.tabPool.slots.map((slot) => slot.slotIndex), [1, 2, 3, 4]);
      assert.equal(actionCalls.filter((entry) => entry.action === 'newPage').length, 3);
      const newPageCall = actionCalls.find((entry) => entry.action === 'newPage');
      assert.equal(newPageCall?.payload?.url, 'https://www.xiaohongshu.com/explore');
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('hydrates a newly created about:blank tab before counting startup as failed', async () => {
    const pages = [{ index: 1, url: 'https://www.xiaohongshu.com/explore', active: true }];
    const actionCalls = [];
    let firstListAfterOpen = true;

    const fetchMock = mock.method(globalThis, 'fetch', async (_url, init = {}) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const action = String(body?.action || '');
      const payload = body?.args || {};
      actionCalls.push({ action, payload });
      if (action === 'page:list') {
        if (pages.length === 2 && firstListAfterOpen) {
          firstListAfterOpen = false;
          return {
            ok: true,
            json: async () => ({ ok: true, data: { pages: [pages[0]].map((page) => ({ ...page })), activeIndex: 1 } }),
            text: async () => '',
          };
        }
        const activeIndex = (pages.find((page) => page.active)?.index) || 1;
        return {
          ok: true,
          json: async () => ({ ok: true, data: { pages: pages.map((page) => ({ ...page })), activeIndex } }),
          text: async () => '',
        };
      }
      if (action === 'newPage') {
        pages.push({ index: 2, url: 'about:blank', active: false });
        return {
          ok: true,
          json: async () => ({ ok: true, index: 2 }),
          text: async () => '',
        };
      }
      if (action === 'page:switch') {
        const targetIndex = Number(payload?.index);
        for (const page of pages) page.active = Number(page.index) === targetIndex;
        return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
      }
      if (action === 'goto') {
        const active = pages.find((page) => page.active) || pages[0];
        if (active) active.url = String(payload?.url || active.url);
        return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
      }
      return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
    });

    try {
      const { executeTabPoolOperation } = await import('../../../modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs');
      const runtime = {};
      const result = await executeTabPoolOperation({
        profileId: 'xhs-qa-1',
        action: 'ensure_tab_pool',
        params: {
          tabCount: 2,
          url: 'https://www.xiaohongshu.com/explore',
          openDelayMs: 0,
          minDelayMs: 0,
          tabAppearTimeoutMs: 200,
          reuseOnly: false,
          normalizeTabs: false,
          seedOnOpen: true,
          syncViewport: false,
        },
        context: { runtime },
      });

      assert.equal(result.ok, true);
      assert.equal(result.data.tabCount, 2);
      assert.ok(actionCalls.some((entry) => entry.action === 'goto' && entry.payload?.url === 'https://www.xiaohongshu.com/explore'));
      assert.equal(runtime.tabPool.count, 2);
    } finally {
      fetchMock.mock.restore();
    }
  });
});
