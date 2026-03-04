import test from 'node:test';
import assert from 'node:assert/strict';

// Direct imports from target modules
import { buildXhsCollectOperations } from '../../../../modules/camo-runtime/src/autoscript/xhs-autoscript-collect.mjs';
import { buildXhsCollectAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-collect-template.mjs';

// ============================================
// Direct coverage: buildXhsCollectOperations
// ============================================
test('DIRECT: buildXhsCollectOperations returns exact structure with defaults', () => {
  const ops = buildXhsCollectOperations({
    profileId: 'test-p1',
    keyword: 'test-kw',
    env: 'debug',
    maxNotes: 10,
    stageLinksEnabled: true,
    detailLoopEnabled: false,
    detailLinksStartup: false,
    collectLinksTimeoutMs: 30000,
  });

  // Verify exact structure of collect_links
  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks, 'collect_links exists');
  assert.equal(collectLinks.enabled, true, 'collect_links.enabled=true when stageLinksEnabled=true');
  assert.equal(collectLinks.action, 'xhs_open_detail', 'collect_links.action=xhs_open_detail');
  assert.equal(collectLinks.trigger, 'search_result_item.exist', 'collect_links.trigger=search_result_item.exist when detailLinksStartup=false');
  assert.deepEqual(collectLinks.dependsOn, ['ensure_tab_pool'], 'collect_links.dependsOn=[ensure_tab_pool]');
  assert.equal(collectLinks.once, true, 'collect_links.once=true');
  assert.equal(collectLinks.timeoutMs, 30000, 'collect_links.timeoutMs from collectLinksTimeoutMs');
  assert.deepEqual(collectLinks.retry, { attempts: 1, backoffMs: 0 }, 'collect_links.retry default');
  assert.equal(collectLinks.onFailure, 'stop_all', 'collect_links.onFailure=stop_all');
  assert.equal(collectLinks.impact, 'script', 'collect_links.impact=script');
  assert.equal(collectLinks.params.mode, 'collect', 'collect_links.params.mode=collect');
  assert.equal(collectLinks.params.env, 'debug', 'collect_links.params.env from options');
 assert.equal(collectLinks.params.keyword, 'test-kw', 'collect_links.params.keyword from options');
  assert.equal(collectLinks.params.maxNotes, 10, 'collect_links.params.maxNotes from options');

 // Verify exact structure of finish_after_collect_links
  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');
  assert.ok(finishOp, 'finish_after_collect_links exists');
  assert.equal(finishOp.enabled, true, 'finish_after_collect_links.enabled=true when stageLinksEnabled=true && !detailLoopEnabled');
  assert.equal(finishOp.action, 'raise_error', 'finish_after_collect_links.action=raise_error');
  assert.equal(finishOp.params.code, 'AUTOSCRIPT_DONE_LINKS_COLLECTED', 'finish_after_collect_links.params.code');
  assert.deepEqual(finishOp.dependsOn, ['collect_links'], 'finish_after_collect_links.dependsOn=[collect_links]');
  assert.equal(finishOp.once, true, 'finish_after_collect_links.once=true');
});

test('DIRECT: buildXhsCollectOperations with detailLinksStartup=true uses startup trigger', () => {
  const ops = buildXhsCollectOperations({
    profileId: 'p1',
    keyword: 'kw',
    env: 'prod',
    maxNotes: 5,
    stageLinksEnabled: true,
    detailLinksStartup: true,
  });

  const collectLinks = ops.find(op => op.id === 'collect_links');
  assert.ok(collectLinks);
  assert.equal(collectLinks.trigger, 'startup', 'trigger=startup when detailLinksStartup=true');
});

test('DIRECT: buildXhsCollectOperations disabled when stageLinksEnabled=false', () => {
  const ops = buildXhsCollectOperations({
    profileId: 'p1',
    keyword: 'kw',
    env: 'prod',
    maxNotes: 5,
    stageLinksEnabled: false,
    detailLoopEnabled: false,
  });

  const collectLinks = ops.find(op => op.id === 'collect_links');
  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');

  assert.equal(collectLinks.enabled, false, 'collect_links.enabled=false when stageLinksEnabled=false');
  assert.equal(finishOp.enabled, false, 'finish_after_collect_links.enabled=false when stageLinksEnabled=false');
});

test('DIRECT: buildXhsCollectOperations finish disabled when detailLoopEnabled=true', () => {
  const ops = buildXhsCollectOperations({
    profileId: 'p1',
    keyword: 'kw',
    env: 'prod',
    maxNotes: 5,
    stageLinksEnabled: true,
    detailLoopEnabled: true,
  });

  const finishOp = ops.find(op => op.id === 'finish_after_collect_links');
  assert.equal(finishOp.enabled, false, 'finish_after_collect_links.enabled=false when detailLoopEnabled=true');
});

// ============================================
// Direct coverage: buildXhsCollectAutoscript
// ============================================
test('DIRECT: buildXhsCollectAutoscript metadata and stage parameter', () => {
  const script = buildXhsCollectAutoscript({
    profileId: 'meta-test-p1',
    keyword: 'meta-test-kw',
    env: 'debug',
    maxNotes: 20,
    stage: 'links',
  });

  // Verify metadata exists and has expected structure
  assert.ok(script.name, 'script.name exists');
  assert.ok(typeof script.name === 'string', 'script.name is string');
  assert.ok(script.name.includes('collect'), 'script.name contains collect');

  assert.ok(script.source, 'script.source exists');
  assert.ok(typeof script.source === 'string', 'script.source is string');
  assert.ok(script.source.includes('phase2-collect.mjs'), 'script.source contains phase2-collect path');

  // version is optional in base metadata

  // Verify stage parameter affects operations
  assert.ok(Array.isArray(script.operations), 'script.operations is array');
  assert.ok(script.operations.length > 0, 'script.operations has items');

  const collectLinks = script.operations.find(op => op.id === 'collect_links');
  assert.ok(collectLinks, 'collect_links operation present in template');

  // Verify all expected operation types are included
  const opIds = script.operations.map(op => op.id);
  assert.ok(opIds.includes('sync_window_viewport'), 'includes bootstrap ops');
  assert.ok(opIds.includes('fill_keyword'), 'includes search ops');
  assert.ok(opIds.includes('ensure_tab_pool'), 'includes tab pool ops');
  assert.ok(opIds.includes('abort_on_login_guard'), 'includes guard ops');
});

test('DIRECT: buildXhsCollectAutoscript respects stage parameter override', () => {
  const script = buildXhsCollectAutoscript({
    profileId: 'stage-override-p1',
    keyword: 'stage-test',
    env: 'prod',
    maxNotes: 10,
    stage: 'links',
  });

  assert.ok(script.operations.some(op => op.id === 'collect_links'), 'collect_links present for stage=links');
});

test('DIRECT: buildXhsCollectAutoscript defaults stage to links', () => {
  const script = buildXhsCollectAutoscript({
    profileId: 'default-stage-p1',
    keyword: 'default-stage',
    env: 'prod',
    maxNotes: 10,
    // no stage specified
  });

  assert.ok(script.operations.some(op => op.id === 'collect_links'), 'collect_links present with default stage');
});
