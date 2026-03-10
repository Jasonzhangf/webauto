import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('verify_subscriptions across-pages fallback', () => {
  it('uses current page fallback without crashing when no listed page matches the url filter', async () => {
    const domTree = {
      tag: 'body',
      selector: 'body',
      visible: true,
      children: [
        {
          tag: 'div',
          selector: 'div.note-item',
          classes: ['note-item'],
          visible: true,
          children: [],
        },
      ],
    };
    const fetchMock = mock.method(globalThis, 'fetch', async (url, init = {}) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const action = String(body?.action || '');
      const args = body?.args || {};

      if (action === 'page:list') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              pages: [
                { index: 7, url: 'https://www.xiaohongshu.com/explore', active: true },
                { index: 11, url: 'https://www.xiaohongshu.com/explore', active: false },
              ],
              activeIndex: 7,
            },
          }),
          text: async () => '',
        };
      }

      if (action === 'page:switch') {
        return {
          ok: true,
          json: async () => ({ ok: true }),
          text: async () => '',
        };
      }

      if (action === 'evaluate') {
        const script = String(args?.script || '');
        if (script.trim() === 'window.location.href') {
          return {
            ok: true,
            json: async () => ({ ok: true, result: 'https://www.xiaohongshu.com/explore' }),
            text: async () => '',
          };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              dom_tree: domTree,
              current_url: 'https://www.xiaohongshu.com/explore',
              viewport: { width: 1280, height: 720 },
            },
          }),
          text: async () => '',
        };
      }

      return {
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => '',
      };
    });

    try {
      const { executeOperation } = await import('../../../modules/camo-runtime/src/container/runtime-core/operations/index.mjs');
      const result = await executeOperation({
        profileId: 'xhs-qa-1',
        operation: {
          action: 'verify_subscriptions',
          params: {
            acrossPages: true,
            requireMatchedPages: true,
            pageUrlIncludes: ['/search_result'],
            selectors: [
              { id: 'search_result_item', selector: '.note-item', visible: false, minCount: 1 },
            ],
          },
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.code, 'OPERATION_DONE');
      assert.equal(result.data.matchedPageCount, 1);
      assert.equal(result.data.pages.at(-1)?.fallback, 'dom_match');
      assert.equal(result.data.pages.at(-1)?.index, 7);
    } finally {
      fetchMock.mock.restore();
    }
  });
});
