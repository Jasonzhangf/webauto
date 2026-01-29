import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetCount } from './targetCountMode.js';

test('resolveTargetCount uses absolute mode by default', () => {
  const out = resolveTargetCount({ targetCount: 12, baseCount: 5 });
  assert.equal(out.mode, 'absolute');
  assert.equal(out.requested, 12);
  assert.equal(out.targetTotal, 12);
});

test('resolveTargetCount supports incremental mode', () => {
  const out = resolveTargetCount({ targetCount: 12, baseCount: 5, mode: 'incremental' });
  assert.equal(out.mode, 'incremental');
  assert.equal(out.requested, 12);
  assert.equal(out.targetTotal, 17);
});

test('resolveTargetCount normalizes invalid targetCount', () => {
  const out = resolveTargetCount({ targetCount: -3, baseCount: 5, mode: 'incremental' });
  assert.equal(out.requested, 0);
  assert.equal(out.targetTotal, 5);
});

test('resolveTargetCount handles non-finite targetCount', () => {
  const out = resolveTargetCount({ targetCount: Number.NaN, baseCount: 2, mode: 'absolute' });
  assert.equal(out.requested, 0);
  assert.equal(out.targetTotal, 0);
});
