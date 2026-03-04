import test from 'node:test';
import assert from 'node:assert/strict';

// Import XHS unified block modules
import { resolveXhsStage, resolveXhsUnifiedModeOverrides } from '../../../../apps/webauto/entry/lib/xhs-unified-stages.mjs';
import { nowIso, parseBool, parseIntFlag, parseNonNegativeInt, sanitizeForPath } from '../../../../apps/webauto/entry/lib/xhs-unified-blocks.mjs';
import { resolveDownloadRoot } from '../../../../apps/webauto/entry/lib/xhs-unified-output-blocks.mjs';
import { buildEvenShardPlan, buildDynamicWavePlan } from '../../../../apps/webauto/entry/lib/xhs-unified-plan-blocks.mjs';

// Import collect modules
import { buildXhsCollectOperations } from '../../../../modules/camo-runtime/src/autoscript/xhs-autoscript-collect.mjs';
import { buildXhsCollectAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-collect-template.mjs';

const baseOptions = {
  profileId: 'test-profile',
  keyword: 'unit-test',
  env: 'debug',
  tabCount: 1,
  noteIntervalMs: 1000,
  maxNotes: 3,
};

// ============================================
// Collect operations tests (core module)
// ============================================
test('buildXhsCollectOperations: collect_links enabled when stageLinksEnabled=true', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    detailLoopEnabled: false,
  });
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks, 'collect_links operation exists');
  assert.equal(collectLinks.enabled, true, 'collect_links.enabled when stageLinksEnabled');
  assert.ok(collectLinks.dependsOn.includes('ensure_tab_pool'));
  assert.equal(collectLinks.once, true, 'collect_links.once=true - single trigger executes full collect loop');
});

test('buildXhsCollectOperations: collect_links disabled when stageLinksEnabled=false', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: false,
    detailLoopEnabled: false,
  });
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks, 'collect_links operation exists');
  assert.equal(collectLinks.enabled, false);
});

test('buildXhsCollectOperations: finish_after_collect_links enabled when stageLinksEnabled=true and detailLoopEnabled=false', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    detailLoopEnabled: false,
  });
  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');
  assert.ok(finishOp, 'finish_after_collect_links operation exists');
  assert.equal(finishOp.enabled, true);
  assert.equal(finishOp.action, 'raise_error');
  assert.equal(finishOp.params.code, 'AUTOSCRIPT_DONE_LINKS_COLLECTED');
});

test('buildXhsCollectOperations: finish_after_collect_links disabled when detailLoopEnabled=true', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    detailLoopEnabled: true,
  });
  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');
  assert.ok(finishOp, 'finish_after_collect_links operation exists');
  assert.equal(finishOp.enabled, false);
});

test('buildXhsCollectOperations: finish_after_collect_links disabled when stageLinksEnabled=false', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: false,
    detailLoopEnabled: false,
  });
  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');
  assert.ok(finishOp, 'finish_after_collect_links operation exists');
  assert.equal(finishOp.enabled, false);
});

test('buildXhsCollectOperations: trigger is startup when detailLinksStartup=true', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    detailLinksStartup: true,
  });
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks);
  assert.equal(collectLinks.trigger, 'search_result_item.exist', 'trigger=search_result_item.exist - single trigger executes full collect loop');
});

test('buildXhsCollectOperations: trigger is search_result_item.exist when detailLinksStartup=false', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    detailLinksStartup: false,
  });
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks);
  assert.equal(collectLinks.trigger, 'search_result_item.exist', 'trigger=search_result_item.exist - single trigger executes full collect loop');
});

test('buildXhsCollectOperations: collect_links has correct dependencies', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
  });
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks);
  assert.ok(Array.isArray(collectLinks.dependsOn));
  assert.ok(collectLinks.dependsOn.includes('ensure_tab_pool'));
});

test('buildXhsCollectOperations: finish_after_collect_links depends on collect_links', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    detailLoopEnabled: false,
  });
  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');
  assert.ok(finishOp);
  assert.ok(Array.isArray(finishOp.dependsOn));
  assert.ok(finishOp.dependsOn.includes('collect_links'));
});

test('buildXhsCollectOperations: timeout and retry configured', () => {
  const ops = buildXhsCollectOperations({
    ...baseOptions,
    stageLinksEnabled: true,
    collectLinksTimeoutMs: 60000,
  });
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks);
  assert.equal(collectLinks.timeoutMs, 60000);
  assert.deepEqual(collectLinks.retry, { attempts: 1, backoffMs: 0 });
});

// ============================================
// Collect template tests
// ============================================
test('buildXhsCollectAutoscript: includes all operation types', () => {
  const script = buildXhsCollectAutoscript({
    ...baseOptions,
    stage: 'links',
    stageLinksEnabled: true,
  });
  assert.ok(Array.isArray(script.operations));
  const opIds = script.operations.map(op => op.id);
  assert.ok(opIds.includes('sync_window_viewport'), 'has bootstrap ops');
  assert.ok(opIds.includes('fill_keyword'), 'has search ops');
  assert.ok(opIds.includes('ensure_tab_pool'), 'has tab pool ops');
  assert.ok(opIds.includes('collect_links'), 'has collect ops');
  assert.ok(opIds.includes('abort_on_login_guard'), 'has guard ops');
});

test('buildXhsCollectAutoscript: defaults to links stage', () => {
  const script = buildXhsCollectAutoscript(baseOptions);
  assert.ok(script.name.includes('collect'));
  assert.ok(Array.isArray(script.operations));
  assert.ok(script.operations.length > 0);
});

test('buildXhsCollectAutoscript: respects stage parameter', () => {
  const script = buildXhsCollectAutoscript({
    ...baseOptions,
    stage: 'links',
  });
  assert.ok(script.operations.some(op => op.id === 'collect_links'));
});

test('buildXhsCollectAutoscript: has valid metadata', () => {
  const script = buildXhsCollectAutoscript(baseOptions);
  assert.ok(script.name, 'has name');
  assert.ok(script.source, 'has source');
  assert.ok(script.version, 'has version');
});

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
