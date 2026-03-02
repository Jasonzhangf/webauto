import test from 'node:test';
import assert from 'node:assert/strict';

// Import XHS unified block modules
import { resolveXhsStage, resolveXhsUnifiedModeOverrides } from '../../../../apps/webauto/entry/lib/xhs-unified-stages.mjs';
import { nowIso, parseBool, parseIntFlag, parseNonNegativeInt, sanitizeForPath } from '../../../../apps/webauto/entry/lib/xhs-unified-blocks.mjs';
import { resolveDownloadRoot } from '../../../../apps/webauto/entry/lib/xhs-unified-output-blocks.mjs';
import { buildEvenShardPlan, buildDynamicWavePlan } from '../../../../apps/webauto/entry/lib/xhs-unified-plan-blocks.mjs';

const baseOptions = {
  profileId: 'test-profile',
  keyword: 'unit-test',
  env: 'debug',
  tabCount: 1,
  noteIntervalMs: 1000,
  maxNotes: 3,
};

// ============================================
// Stage resolution tests
// ============================================
test('resolveXhsStage: valid stages', () => {
  assert.equal(resolveXhsStage({ stage: 'full' }), 'full');
  assert.equal(resolveXhsStage({ stage: 'links' }), 'links');
  assert.equal(resolveXhsStage({ stage: 'content' }), 'content');
  assert.equal(resolveXhsStage({ stage: 'detail' }), 'detail');
});

test('resolveXhsStage: defaults to full', () => {
  assert.equal(resolveXhsStage({}), 'full');
  assert.equal(resolveXhsStage({ stage: '' }), 'full');
});

test('resolveXhsStage: rejects invalid stage', () => {
  assert.throws(() => resolveXhsStage({ stage: 'invalid' }), /invalid --stage/);
});

test('resolveXhsUnifiedModeOverrides: links-only mode', () => {
  const overrides = resolveXhsUnifiedModeOverrides('links-only');
  assert.equal(overrides.stage, 'links');
  assert.equal(overrides.doComments, false);
  assert.equal(overrides.doLikes, false);
});

test('resolveXhsUnifiedModeOverrides: content-only mode', () => {
  const overrides = resolveXhsUnifiedModeOverrides('content-only');
  assert.equal(overrides.stage, 'content');
  assert.equal(overrides.doLikes, false);
});

// ============================================
// Block utilities tests
// ============================================
test('nowIso: returns ISO string', () => {
  const result = nowIso();
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('T'));
});

test('parseBool: handles true values', () => {
  assert.equal(parseBool('1'), true);
  assert.equal(parseBool('true'), true);
  assert.equal(parseBool('yes'), true);
  assert.equal(parseBool(true), true);
});

test('parseBool: handles false values', () => {
  assert.equal(parseBool('0'), false);
  assert.equal(parseBool('false'), false);
  assert.equal(parseBool('no'), false);
  assert.equal(parseBool(false), false);
});

test('parseBool: fallback on undefined', () => {
  assert.equal(parseBool(undefined, true), true);
  assert.equal(parseBool(undefined, false), false);
});

test('parseIntFlag: parses valid numbers', () => {
  assert.equal(parseIntFlag('100', 10), 100);
  assert.equal(parseIntFlag(50, 10), 50);
});

test('parseIntFlag: fallback on invalid', () => {
  assert.equal(parseIntFlag('abc', 10), 10);
  assert.equal(parseIntFlag(undefined, 5), 5);
});

test('parseIntFlag: enforces minimum', () => {
  assert.equal(parseIntFlag('0', 10, 1), 1);
  assert.equal(parseIntFlag('-5', 10, 1), 1);
});

test('parseNonNegativeInt: handles zero and positive', () => {
  assert.equal(parseNonNegativeInt('0'), 0);
  assert.equal(parseNonNegativeInt('10'), 10);
});

test('parseNonNegativeInt: fallback on invalid', () => {
  assert.equal(parseNonNegativeInt('abc', 5), 5);
  assert.equal(parseNonNegativeInt(undefined, 3), 3);
});

test('sanitizeForPath: replaces special chars with underscore', () => {
  assert.equal(sanitizeForPath('test/keyword'), 'test_keyword');
  assert.equal(sanitizeForPath('test:keyword'), 'test_keyword');
  assert.equal(sanitizeForPath('test\\path'), 'test_path');
});

test('sanitizeForPath: fallback for empty', () => {
  assert.equal(sanitizeForPath('', 'fallback'), 'fallback');
  assert.equal(sanitizeForPath(null, 'default'), 'default');
});

// ============================================
// Plan builder tests
// ============================================
test('buildEvenShardPlan: distributes notes evenly', () => {
  const plan = buildEvenShardPlan({
    profiles: ['p1', 'p2'],
    totalNotes: 100,
    defaultMaxNotes: 50
  });
  assert.ok(Array.isArray(plan));
  assert.equal(plan.length, 2);
  assert.equal(plan[0].assignedNotes, 50);
  assert.equal(plan[1].assignedNotes, 50);
});

test('buildEvenShardPlan: handles single profile', () => {
  const plan = buildEvenShardPlan({
    profiles: ['p1'],
    totalNotes: 10,
    defaultMaxNotes: 20
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].assignedNotes, 10);
});

test('buildEvenShardPlan: handles empty profiles', () => {
  const plan = buildEvenShardPlan({
    profiles: [],
    totalNotes: 100,
    defaultMaxNotes: 50
  });
  assert.equal(plan.length, 0);
});

test('buildEvenShardPlan: uses defaultMaxNotes when totalNotes invalid', () => {
  const plan = buildEvenShardPlan({
    profiles: ['p1'],
    totalNotes: -1,
    defaultMaxNotes: 20
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].assignedNotes, 20);
});

test('buildDynamicWavePlan: builds wave plan', () => {
  const plan = buildDynamicWavePlan({
    profiles: ['p1', 'p2'],
    remainingNotes: 50
  });
  assert.ok(Array.isArray(plan));
  assert.ok(plan.length > 0);
  assert.ok(plan.every(p => typeof p.assignedNotes === 'number'));
});

test('buildDynamicWavePlan: respects remaining notes', () => {
  const plan = buildDynamicWavePlan({
    profiles: ['p1'],
    remainingNotes: 5
  });
  const total = plan.reduce((sum, p) => sum + p.assignedNotes, 0);
  assert.ok(total <= 5);
});

test('buildDynamicWavePlan: handles zero remaining notes', () => {
  const plan = buildDynamicWavePlan({
    profiles: ['p1', 'p2'],
    remainingNotes: 0
  });
  assert.equal(plan.length, 0);
});

// ============================================
// Output blocks tests
// ============================================
test('resolveDownloadRoot: returns default when empty', () => {
  const result = resolveDownloadRoot('');
  assert.ok(typeof result === 'string');
  assert.ok(result.length > 0);
});

test('resolveDownloadRoot: uses custom root', () => {
  const result = resolveDownloadRoot('/custom/path');
  assert.equal(result, '/custom/path');
});
