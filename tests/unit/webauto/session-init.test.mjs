import { it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeStartWindowSize,
  computeTargetViewportFromWindowMetrics,
} from '../../../apps/webauto/entry/lib/session-init.mjs';

it('computeStartWindowSize uses work area height near display height', () => {
  const target = computeStartWindowSize({
    metrics: {
      workWidth: 2560,
      workHeight: 1412,
      width: 2560,
      height: 1440,
    },
  });
  assert.equal(target.width, 2560);
  assert.equal(target.height, 1412);
  assert.equal(target.source, 'workArea');
});

it('computeStartWindowSize keeps safe fallback when display metrics missing', () => {
  const target = computeStartWindowSize(null);
  assert.equal(target.width, 1920);
  assert.equal(target.height, 1000);
  assert.equal(target.source, 'fallback');
});

it('computeTargetViewportFromWindowMetrics subtracts browser frame', () => {
  const viewport = computeTargetViewportFromWindowMetrics({
    innerWidth: 1210,
    innerHeight: 700,
    outerWidth: 1366,
    outerHeight: 900,
  });
  assert.equal(viewport.width, 1246);
  assert.equal(viewport.height, 720);
  assert.equal(viewport.frameW, 120);
  assert.equal(viewport.frameH, 180);
});
