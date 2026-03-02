import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedOptions, resolveAutoscriptBuilder } from '../../../../apps/webauto/entry/lib/xhs-unified-options.mjs';

const baseArgv = {
  keyword: 'test-keyword',
  env: 'debug',
  'max-notes': 10,
};

test('buildUnifiedOptions returns expected fields', async () => {
  const options = await buildUnifiedOptions(baseArgv, 'test-profile');
  assert.ok(options.profileId === 'test-profile');
  assert.ok(options.keyword === 'test-keyword');
  assert.ok(options.env === 'debug');
  assert.ok(options.maxNotes === 10);
  assert.ok(typeof options.stage === 'string');
});

test('resolveAutoscriptBuilder returns correct builder', () => {
  const linksBuilder = resolveAutoscriptBuilder('links');
  const detailBuilder = resolveAutoscriptBuilder('detail');
  const fullBuilder = resolveAutoscriptBuilder('full');
  
  assert.ok(typeof linksBuilder === 'function');
  assert.ok(typeof detailBuilder === 'function');
  assert.ok(typeof fullBuilder === 'function');
  
  // Verify they produce autoscripts with operations
  const baseOpts = { keyword: 'test', profileId: 'p1', maxNotes: 5 };
  const linksScript = linksBuilder(baseOpts);
  const detailScript = detailBuilder(baseOpts);
  const fullScript = fullBuilder(baseOpts);
  
  assert.ok(Array.isArray(linksScript.operations));
  assert.ok(Array.isArray(detailScript.operations));
  assert.ok(Array.isArray(fullScript.operations));
});
