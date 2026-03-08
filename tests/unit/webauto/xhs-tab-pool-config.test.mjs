import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildXhsTabPoolOperation } from '../../../modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs';

describe('xhs tab pool config', () => {
  it('normalizes tabs against a clean explore seed during safe-link detail startup', () => {
    const [operation] = buildXhsTabPoolOperation({
      tabCount: 4,
      tabOpenDelayMs: 1400,
      tabOpenMinDelayMs: 10000,
      detailLinksStartup: true,
    });

    assert.equal(operation.id, 'ensure_tab_pool');
    assert.equal(operation.params.url, 'https://www.xiaohongshu.com/explore');
    assert.equal(operation.params.normalizeTabs, true);
    assert.equal(operation.params.seedOnOpen, true);
  });

  it('keeps search-stage tab pool behavior unchanged', () => {
    const [operation] = buildXhsTabPoolOperation({
      tabCount: 4,
      tabOpenDelayMs: 1400,
      tabOpenMinDelayMs: 10000,
      detailLinksStartup: false,
    });

    assert.equal(operation.id, 'ensure_tab_pool');
    assert.equal('url' in operation.params, false);
    assert.equal(operation.params.normalizeTabs, false);
    assert.equal(operation.params.seedOnOpen, true);
  });
});
