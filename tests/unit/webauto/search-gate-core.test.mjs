import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSearchGateState,
  evaluateSearchGatePermit,
  confirmSearchGateUsage,
  initDetailLinkQueue,
  claimDetailLink,
  completeDetailLink,
  releaseDetailLink,
} from '../../../runtime/infra/utils/search-gate-core.mjs';

describe('search gate core', () => {
  it('rejects the fourth consecutive same search resource when max consecutive same is 3', () => {
    const state = createSearchGateState();
    const config = { defaultWindowMs: 60_000, defaultMaxCount: 10, keywordWindowMs: 180_000, keywordMaxCount: 10, defaultSameResourceMaxConsecutive: 3 };
    const body = {
      kind: 'search',
      key: 'xhs-qa-1',
      keyword: 'deepseek',
      resourceKey: 'deepseek',
      sameResourceMaxConsecutive: 3,
      maxCount: 10,
    };

    const t0 = 1_000;
    const r1 = evaluateSearchGatePermit(state, body, config, t0);
    const r2 = evaluateSearchGatePermit(state, body, config, t0 + 1);
    const r3 = evaluateSearchGatePermit(state, body, config, t0 + 2);
    const r4 = evaluateSearchGatePermit(state, body, config, t0 + 3);

    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, true);
    assert.equal(r4.allowed, false);
    assert.equal(r4.deny, 'consecutive_same_resource_limit');
  });

  it('rejects the fourth consecutive same open link when max consecutive same is 3', () => {
    const state = createSearchGateState();
    const config = { defaultOpenWindowMs: 180_000, defaultOpenMaxCount: 20, defaultSameResourceMaxConsecutive: 3 };
    const body = {
      kind: 'open_link',
      key: 'xhs-qa-1',
      resourceKey: '699c26bc000000001a035e24',
      sameResourceMaxConsecutive: 3,
      maxCount: 20,
    };

    const t0 = 2_000;
    assert.equal(evaluateSearchGatePermit(state, body, config, t0).allowed, true);
    confirmSearchGateUsage(state, body, config, t0);
    assert.equal(evaluateSearchGatePermit(state, body, config, t0 + 1).allowed, true);
    confirmSearchGateUsage(state, body, config, t0 + 1);
    assert.equal(evaluateSearchGatePermit(state, body, config, t0 + 2).allowed, true);
    confirmSearchGateUsage(state, body, config, t0 + 2);
    const rejected = evaluateSearchGatePermit(state, body, config, t0 + 3);
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.deny, 'consecutive_same_resource_limit');
  });

  it('does not count open-link permit until confirmed success', () => {
    const state = createSearchGateState();
    const config = { defaultOpenWindowMs: 180_000, defaultOpenMaxCount: 20, defaultSameResourceMaxConsecutive: 2 };
    const body = {
      kind: 'open_link',
      key: 'xhs-qa-1',
      resourceKey: 'unfinished-note',
      sameResourceMaxConsecutive: 2,
      maxCount: 20,
    };

    const t0 = 3_000;
    const p1 = evaluateSearchGatePermit(state, body, config, t0);
    const p2 = evaluateSearchGatePermit(state, body, config, t0 + 1);
    const p3 = evaluateSearchGatePermit(state, body, config, t0 + 2);

    assert.equal(p1.allowed, true);
    assert.equal(p2.allowed, true);
    assert.equal(p3.allowed, true);
    assert.deepEqual(state.resourceHistory.get('open_link::xhs-qa-1') || [], []);

    confirmSearchGateUsage(state, body, config, t0 + 3);
    confirmSearchGateUsage(state, { ...body, resourceKey: 'another-note' }, config, t0 + 4);
    const p4 = evaluateSearchGatePermit(state, body, config, t0 + 5);
    assert.equal(p4.allowed, true);
  });

  it('rotates detail links in queue order and removes them only after done', () => {
    const state = createSearchGateState();
    initDetailLinkQueue(state, {
      key: 'xhs-qa-1',
      links: [
        { noteId: 'note-a', noteUrl: 'https://www.xiaohongshu.com/explore/note-a?xsec_token=a' },
        { noteId: 'note-b', noteUrl: 'https://www.xiaohongshu.com/explore/note-b?xsec_token=b' },
        { noteId: 'note-c', noteUrl: 'https://www.xiaohongshu.com/explore/note-c?xsec_token=c' },
      ],
    });

    const c1 = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-1' });
    const c2 = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-2' });
    assert.equal(c1.link.noteId, 'note-a');
    assert.equal(c2.link.noteId, 'note-b');

    releaseDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-1', noteId: 'note-a' });
    completeDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-2', noteId: 'note-b' });

    const c3 = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-3' });
    const c4 = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-4' });
    assert.equal(c3.link.noteId, 'note-c');
    assert.equal(c4.link.noteId, 'note-a');
  });

  it('does not re-claim a stale-closed detail link after it is skipped from queue', () => {
    const state = createSearchGateState();
    initDetailLinkQueue(state, {
      key: 'xhs-qa-1',
      links: [
        { noteId: 'note-a', noteUrl: 'https://www.xiaohongshu.com/explore/note-a?xsec_token=a' },
        { noteId: 'note-b', noteUrl: 'https://www.xiaohongshu.com/explore/note-b?xsec_token=b' },
      ],
    });

    const first = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-1' });
    assert.equal(first.link.noteId, 'note-a');

    const skipped = releaseDetailLink(state, {
      key: 'xhs-qa-1',
      consumerId: 'tab-1',
      noteId: 'note-a',
      reason: 'stale_closed',
      skip: true,
    });
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.linkKey, 'note-a');

    const next = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-1' });
    assert.equal(next.link.noteId, 'note-b');

    completeDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-1', noteId: 'note-b' });
    const exhausted = claimDetailLink(state, { key: 'xhs-qa-1', consumerId: 'tab-2' });
    assert.equal(exhausted.found, false);
    assert.equal(exhausted.exhausted, true);
  });
});
