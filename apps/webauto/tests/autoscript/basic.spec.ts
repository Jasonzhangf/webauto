import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXhsAutoscriptBase } from '../../../../modules/camo-runtime/src/autoscript/xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsSearchOperations,
  buildXhsTabPoolOperation,
  buildXhsDetailOperations,
  buildXhsGuardOperations,
} from '../../../../modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs';

const baseOptions = {
  profileId: 'test-profile',
  keyword: 'unit-test',
  env: 'debug',
  tabCount: 1,
  noteIntervalMs: 1000,
};

test('autoscript base yields options and base metadata', () => {
  const { options, base } = buildXhsAutoscriptBase(baseOptions, { name: 'test', source: 'test' });
  assert.equal(options.keyword, 'unit-test');
  assert.equal(base.name, 'test');
});

test('bootstrap operations include sync and goto_home', () => {
  const ops = buildXhsBootstrapOperations(baseOptions);
  assert.ok(Array.isArray(ops) && ops.length > 0);
  assert.ok(ops.some((op) => op.id === 'sync_window_viewport'));
  assert.ok(ops.some((op) => op.id === 'goto_home'));
});

test('search operations include fill and submit', () => {
  const ops = buildXhsSearchOperations(baseOptions);
  assert.ok(ops.some((op) => op.id === 'fill_keyword'));
  assert.ok(ops.some((op) => op.id === 'submit_search'));
  assert.ok(ops.some((op) => op.id === 'verify_subscriptions_all_pages'));
});

test('tab pool operation exists', () => {
  const ops = buildXhsTabPoolOperation({ ...baseOptions, tabCount: 2 });
  assert.ok(Array.isArray(ops) && ops.length > 0);
  assert.ok(ops.some((op) => op.id === 'ensure_tab_pool'));
});

test('detail operations include open and close detail', () => {
  const ops = buildXhsDetailOperations(baseOptions);
  assert.ok(ops.some((op) => op.id === 'open_first_detail'));
  assert.ok(ops.some((op) => op.id === 'close_detail'));
});

test('guard operations include abort_on_login_guard', () => {
  const ops = buildXhsGuardOperations(baseOptions);
  assert.ok(ops.some((op) => op.id === 'abort_on_login_guard'));
});
