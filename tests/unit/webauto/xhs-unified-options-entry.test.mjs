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
      'detail-open-by-links': false,
    }, 'xhs-qa-1');

    assert.equal(options.detailOpenByLinks, false);
    assert.equal(options.autoCloseDetail, false);
  });

  it('full mode defaults to safe-link detail opening', async () => {
    const options = await buildUnifiedOptions({
      keyword: 'deepseek',
      stage: 'full',
      'max-notes': 2,
    }, 'xhs-qa-1');

    assert.equal(options.detailOpenByLinks, true);
  });
});
