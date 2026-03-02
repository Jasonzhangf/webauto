import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXhsCollectOperations } from '../../../../modules/camo-runtime/src/autoscript/xhs-autoscript-collect.mjs';
import { buildXhsCollectAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-collect-template.mjs';
import { buildXhsUnifiedAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';
import { buildXhsDetailAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-detail-template.mjs';

const baseOptions = {
  profileId: 'test-profile',
  keyword: 'unit-test',
  env: 'debug',
  tabCount: 1,
  noteIntervalMs: 1000,
  maxNotes: 3,
};

test('collect operations include collect_links', () => {
  const ops = buildXhsCollectOperations(baseOptions);
  assert.ok(Array.isArray(ops) && ops.length > 0);
  assert.ok(ops.some((op) => op.id === 'collect_links'));
});

test('collect template builds operations', () => {
  const script = buildXhsCollectAutoscript({ ...baseOptions, stage: 'links' });
  assert.ok(Array.isArray(script.operations));
  assert.ok(script.operations.some((op) => op.id === 'collect_links'));
});

test('unified template builds operations', () => {
  const script = buildXhsUnifiedAutoscript(baseOptions);
  assert.ok(Array.isArray(script.operations));
  assert.ok(script.operations.some((op) => op.id === 'collect_links'));
});

test('detail template builds operations', () => {
  const script = buildXhsDetailAutoscript({ ...baseOptions, stage: 'detail' });
  assert.ok(Array.isArray(script.operations));
  assert.ok(script.operations.some((op) => op.id === 'open_first_detail'));
});
