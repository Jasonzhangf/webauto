import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeSwitchTabIfNeeded } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs';
import { getProfileState } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/state.mjs';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('xhs tab switch reuse', () => {
  it('switches by initialized runtime tab slot mapping', async () => {
    const profileId = `test-profile-${Date.now()}`;
    const state = getProfileState(profileId);
    state.tabState = {
      tabCount: 2,
      limit: 50,
      cursor: 1,
      used: [50, 0],
    };

    const context = {
      runtime: {
        tabPool: {
          slots: [
            { slotIndex: 1, tabRealIndex: 7, url: 'https://example.com/a' },
            { slotIndex: 2, tabRealIndex: 11, url: 'https://example.com/b' },
          ],
        },
      },
    };

    const calls = [];
    global.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body || '{}'));
      calls.push({ action: body.action, payload: body.args });
      if (body.action === 'page:list') {
        return {
          ok: true,
          json: async () => ({
            pages: [
              { index: 7, url: 'https://example.com/a' },
              { index: 11, url: 'https://example.com/b' },
            ],
            activeIndex: 7,
          }),
        };
      }
      if (body.action === 'page:switch') {
        return {
          ok: true,
          json: async () => ({ ok: true }),
        };
      }
      throw new Error(`unexpected action: ${body.action}`);
    };

    const result = await executeSwitchTabIfNeeded({
      profileId,
      params: { tabCount: 2, commentBudget: 50 },
      context,
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.tabIndex, 2);
    assert.equal(result.data.targetIndex, 11);
    assert.deepEqual(
      calls.map((entry) => entry.action),
      ['page:list', 'page:switch'],
    );
    assert.equal(context.runtime.currentTab.slotIndex, 2);
    assert.equal(context.runtime.currentTab.tabRealIndex, 11);
  });

  it('skips switching when comment budget is uncapped', async () => {
    const profileId = `test-profile-uncapped-${Date.now()}`;
    const state = getProfileState(profileId);
    state.tabState = {
      tabCount: 2,
      limit: 0,
      cursor: 1,
      used: [999, 0],
    };

    const context = {
      runtime: {
        tabPool: {
          slots: [
            { slotIndex: 1, tabRealIndex: 7, url: 'https://example.com/a' },
            { slotIndex: 2, tabRealIndex: 11, url: 'https://example.com/b' },
          ],
        },
      },
    };

    const calls = [];
    global.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body || '{}'));
      calls.push(body.action);
      throw new Error(`unexpected action: ${body.action}`);
    };

    const result = await executeSwitchTabIfNeeded({
      profileId,
      params: { tabCount: 2, commentBudget: 0 },
      context,
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.tabIndex, 1);
    assert.equal(result.data.limit, 0);
    assert.deepEqual(calls, []);
  });
});
