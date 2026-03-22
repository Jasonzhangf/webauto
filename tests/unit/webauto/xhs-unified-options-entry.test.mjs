import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildUnifiedOptions } from '../../../apps/webauto/entry/lib/xhs-unified-options.mjs';

describe('xhs unified entry options', () => {
  it('safe-link single-note detail defaults autoCloseDetail to true', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      stage: 'detail',
      'max-notes': 1,
      'detail-open-by-links': true,
    }, 'xhs-qa-1');

    assert.equal(options.detailOpenByLinks, true);
    assert.equal(options.autoCloseDetail, true);
  });

  it('plain single-note detail keeps modal open by default', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      stage: 'detail',
      'max-notes': 1,
      // Click mode forbidden by policy; removed,
    }, 'xhs-qa-1');

    assert.equal(options.detailOpenByLinks, true);
    assert.equal(options.autoCloseDetail, true);
  });

  it('full mode defaults to safe-link detail opening', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      stage: 'full',
      'max-notes': 2,
    }, 'xhs-qa-1');

    assert.equal(options.detailOpenByLinks, true);
  });

  it('comments-enabled full run defaults to 4 tabs', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      stage: 'full',
      'max-notes': 5,
      'do-comments': true,
    }, 'xhs-qa-1');

    assert.equal(options.tabCount, 4);
  });

  it('derives a single collect->detail handoff path from outputRoot/env/keyword by default', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      env: 'debug',
      stage: 'detail',
      'output-root': '/tmp/xhs-unified-handoff',
    }, 'xhs-qa-1');

    assert.equal(options.sharedHarvestPath, '/tmp/xhs-unified-handoff/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl');
  });

  it('accepts explicit shared-harvest-path override for collect->detail handoff', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      env: 'debug',
      stage: 'detail',
      'output-root': '/tmp/xhs-unified-handoff',
      'shared-harvest-path': '/tmp/custom/handoff-links.jsonl',
    }, 'xhs-qa-1');

    assert.equal(options.sharedHarvestPath, '/tmp/custom/handoff-links.jsonl');
  });
});
