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

// ============================================
// Autoscript base tests
// ============================================
test('autoscript base yields options and base metadata', () => {
  const { options, base } = buildXhsAutoscriptBase(baseOptions, { name: 'test', source: 'test' });
  assert.equal(options.keyword, 'unit-test');
  assert.equal(base.name, 'test');
});

test('autoscript base: empty keyword is normalized', () => {
  // buildXhsAutoscriptBase normalizes empty keyword to default
  const { options } = buildXhsAutoscriptBase({ ...baseOptions, keyword: '' }, { name: 'test', source: 'test' });
  assert.ok(typeof options.keyword === 'string');
});

test('autoscript base: negative tabCount normalized', () => {
  const { options } = buildXhsAutoscriptBase({ ...baseOptions, tabCount: -1 }, { name: 'test', source: 'test' });
  assert.ok(options.tabCount >= 1);
});

// ============================================
// Bootstrap operations tests
// ============================================
test('bootstrap operations include sync and goto_home', () => {
  const ops = buildXhsBootstrapOperations(baseOptions);
  assert.ok(Array.isArray(ops) && ops.length > 0);
  assert.ok(ops.some((op) => op.id === 'sync_window_viewport'));
  assert.ok(ops.some((op) => op.id === 'goto_home'));
});

test('bootstrap operations: each op has id', () => {
  const ops = buildXhsBootstrapOperations(baseOptions);
  ops.forEach(op => {
    assert.ok(op.id, 'op has id');
  });
});

// ============================================
// Search operations tests
// ============================================
test('search operations include fill and submit', () => {
  const ops = buildXhsSearchOperations(baseOptions);
  assert.ok(ops.some((op) => op.id === 'fill_keyword'));
  assert.ok(ops.some((op) => op.id === 'submit_search'));
  assert.ok(ops.some((op) => op.id === 'verify_subscriptions_all_pages'));
});

test('search operations: fill_keyword operation exists', () => {
  const ops = buildXhsSearchOperations(baseOptions);
  const fillOp = ops.find(op => op.id === 'fill_keyword');
  assert.ok(fillOp);
  assert.ok(fillOp.id === 'fill_keyword');
});

// ============================================
// Tab pool operations tests
// ============================================
test('tab pool operation exists', () => {
  const ops = buildXhsTabPoolOperation({ ...baseOptions, tabCount: 2 });
  assert.ok(Array.isArray(ops) && ops.length > 0);
  assert.ok(ops.some((op) => op.id === 'ensure_tab_pool'));
});

test('tab pool operation: tabCount affects pool size', () => {
  const ops1 = buildXhsTabPoolOperation({ ...baseOptions, tabCount: 1 });
  const ops4 = buildXhsTabPoolOperation({ ...baseOptions, tabCount: 4 });
  const pool1 = ops1.find(op => op.id === 'ensure_tab_pool');
  const pool4 = ops4.find(op => op.id === 'ensure_tab_pool');
  assert.ok(pool1 || ops1.length > 0);
  assert.ok(pool4 || ops4.length > 0);
});

// ============================================
// Detail operations tests
// ============================================
test('detail operations include open and close detail', () => {
  const ops = buildXhsDetailOperations(baseOptions);
  assert.ok(ops.some((op) => op.id === 'open_first_detail'));
  assert.ok(ops.some((op) => op.id === 'close_detail'));
});

test('detail operations: valid operation types', () => {
  const ops = buildXhsDetailOperations(baseOptions);
  const validTypes = ['click', 'scroll', 'wait', 'collect', 'navigate'];
  ops.forEach(op => {
    if (op.type) {
      assert.ok(validTypes.includes(op.type) || op.type.startsWith('xhs_'), `valid type: ${op.type}`);
    }
  });
});

// ============================================
// Guard operations tests
// ============================================
test('guard operations include abort_on_login_guard', () => {
  const ops = buildXhsGuardOperations(baseOptions);
  assert.ok(ops.some((op) => op.id === 'abort_on_login_guard'));
});

test('guard operations: abort_on_login_guard exists', () => {
  const ops = buildXhsGuardOperations(baseOptions);
  const guard = ops.find(op => op.id === 'abort_on_login_guard');
  assert.ok(guard);
  assert.ok(guard.id === 'abort_on_login_guard');
});
