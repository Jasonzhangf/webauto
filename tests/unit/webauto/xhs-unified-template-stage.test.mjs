import { it } from 'node:test';
import assert from 'node:assert/strict';

import { buildXhsUnifiedAutoscript } from '../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';

function getOperation(script, id) {
  return (script.operations || []).find((item) => item?.id === id) || null;
}

it('links stage enables search+collect only and terminates after link collection', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-1',
    keyword: '城市漫步',
    stage: 'links',
    stageLinksEnabled: true,
    stageContentEnabled: false,
    stageLikeEnabled: false,
    stageReplyEnabled: false,
    doHomepage: false,
    doImages: false,
    doComments: false,
    doLikes: false,
    doReply: false,
    doOcr: false,
  });

  assert.equal(getOperation(script, 'collect_links')?.enabled, true);
  assert.equal(getOperation(script, 'collect_links')?.params?.collectOpenLinksOnly, true);
  assert.equal(getOperation(script, 'open_first_detail')?.enabled, false);
  assert.equal(getOperation(script, 'detail_harvest')?.enabled, false);
  assert.equal(getOperation(script, 'comment_like'), null);
  assert.equal(getOperation(script, 'comment_reply')?.enabled, false);
  assert.equal(getOperation(script, 'finish_after_collect_links')?.enabled, true);
});

it('reply stage enables reply flow and keeps like flow off', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-2',
    keyword: '咖啡店',
    stage: 'reply',
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: false,
    stageReplyEnabled: true,
    doComments: true,
    doLikes: false,
    doReply: true,
  });

  assert.equal(getOperation(script, 'open_first_detail')?.enabled, true);
  assert.equal(getOperation(script, 'collect_links')?.params?.collectOpenLinksOnly, true);
  assert.equal(getOperation(script, 'open_first_detail')?.params?.preservePreCollected, true);
  assert.equal(getOperation(script, 'comments_harvest')?.enabled, true);
  assert.equal(getOperation(script, 'comment_match_gate')?.enabled, true);
  assert.equal(getOperation(script, 'comment_like'), null);
  assert.equal(getOperation(script, 'comment_reply')?.enabled, true);
});

it('like stage enables match gate without reply flow', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-2b',
    keyword: '咖啡店',
    stage: 'like',
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: true,
    stageReplyEnabled: false,
    doComments: true,
    doLikes: true,
    doReply: false,
  });

  assert.equal(getOperation(script, 'comments_harvest')?.enabled, true);
  assert.equal(getOperation(script, 'comment_match_gate')?.enabled, true);
  assert.equal(getOperation(script, 'comment_reply')?.enabled, false);
});

it('comments_harvest should wait for warmup but not expand_replies', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-3',
    keyword: '春晚',
    stage: 'like',
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: true,
    stageReplyEnabled: false,
    doComments: true,
    doLikes: true,
    doReply: false,
  });

  assert.deepEqual(getOperation(script, 'comments_harvest')?.dependsOn, ['warmup_comments_context']);
  assert.deepEqual(getOperation(script, 'expand_replies')?.dependsOn, ['detail_harvest']);
  assert.equal(getOperation(script, 'comment_like'), null);
  assert.equal(getOperation(script, 'comments_harvest')?.params?.doLikes, true);
});

it('detail stage runs open/close loop without content/comment/like actions', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-4',
    keyword: 'deepseek',
    stage: 'detail',
    stageLinksEnabled: true,
    stageContentEnabled: false,
    stageLikeEnabled: false,
    stageReplyEnabled: false,
    stageDetailEnabled: true,
    doComments: false,
    doLikes: false,
    doReply: false,
    doHomepage: false,
    doImages: false,
    doOcr: false,
  });

  assert.equal(getOperation(script, 'collect_links')?.enabled, true);
  assert.equal(getOperation(script, 'open_first_detail')?.enabled, true);
  assert.equal(getOperation(script, 'open_next_detail')?.enabled, true);
  assert.equal(getOperation(script, 'open_first_detail')?.params?.stage, 'detail');
  assert.equal(getOperation(script, 'open_next_detail')?.params?.stage, 'detail');
  assert.equal(getOperation(script, 'close_detail')?.enabled, true);
  assert.equal(getOperation(script, 'detail_harvest')?.enabled, false);
  assert.equal(getOperation(script, 'comments_harvest')?.enabled, false);
  assert.equal(getOperation(script, 'comment_match_gate')?.enabled, false);
  assert.equal(getOperation(script, 'comment_like'), null);
  assert.equal(getOperation(script, 'comment_reply')?.enabled, false);
});

it('single-note detail stage keeps modal open by default and uses larger comment scroll steps', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-5',
    keyword: 'deepseek',
    stage: 'detail',
    maxNotes: 1,
    autoCloseDetail: false,
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: false,
    stageReplyEnabled: false,
    stageDetailEnabled: true,
    doComments: true,
    doLikes: false,
    doReply: false,
    commentsScrollStepMin: 520,
    commentsScrollStepMax: 760,
  });

  assert.equal(getOperation(script, 'close_detail')?.enabled, false);
  assert.equal(getOperation(script, 'comments_harvest')?.params?.scrollStepMin, 520);
  assert.equal(getOperation(script, 'comments_harvest')?.params?.scrollStepMax, 760);
});

it('single-note safe-link detail stage auto-closes by default so failure can advance the loop', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-5b',
    keyword: 'deepseek',
    stage: 'detail',
    maxNotes: 1,
    detailOpenByLinks: true,
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: false,
    stageReplyEnabled: false,
    stageDetailEnabled: true,
    doComments: true,
    doLikes: false,
    doReply: false,
  });

  assert.equal(getOperation(script, 'close_detail')?.enabled, true);
});

it('safe-link detail stage serializes modal ops through manual dependency chain', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-5c',
    keyword: 'deepseek',
    stage: 'detail',
    maxNotes: 1,
    detailOpenByLinks: true,
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: false,
    stageReplyEnabled: false,
    stageDetailEnabled: true,
    doComments: true,
    doLikes: false,
    doReply: false,
  });

  assert.equal(getOperation(script, 'detail_harvest')?.trigger, 'manual');
  assert.deepEqual(getOperation(script, 'detail_harvest')?.conditions, [{ type: 'subscription_exist', subscriptionId: 'detail_modal' }]);
  assert.equal(getOperation(script, 'warmup_comments_context')?.trigger, 'manual');
  assert.deepEqual(getOperation(script, 'warmup_comments_context')?.conditions, [{ type: 'subscription_exist', subscriptionId: 'detail_modal' }]);
  assert.equal(getOperation(script, 'comments_harvest')?.trigger, 'manual');
  assert.deepEqual(getOperation(script, 'comments_harvest')?.conditions, [{ type: 'subscription_exist', subscriptionId: 'detail_modal' }]);
  assert.equal(getOperation(script, 'close_detail')?.trigger, 'manual');
  assert.deepEqual(getOperation(script, 'close_detail')?.conditions, [
    { type: 'operation_done', operationId: 'comments_harvest' },
    { type: 'subscription_exist', subscriptionId: 'detail_modal' },
  ]);
});

it('multi-tab detail stage switches tabs after close using a manual dependency chain', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-stage-6',
    keyword: 'deepseek',
    stage: 'detail',
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: false,
    stageReplyEnabled: false,
    stageDetailEnabled: true,
    doComments: true,
    doLikes: false,
    doReply: false,
    autoCloseDetail: true,
    tabCount: 4,
  });

  assert.equal(getOperation(script, 'tab_switch_if_needed')?.enabled, true);
  assert.equal(getOperation(script, 'tab_switch_if_needed')?.trigger, 'manual');
  assert.deepEqual(getOperation(script, 'tab_switch_if_needed')?.dependsOn, ['close_detail']);
  assert.equal(getOperation(script, 'tab_switch_if_needed')?.oncePerAppear, false);
  assert.ok(getOperation(script, 'open_next_detail')?.dependsOn?.includes('tab_switch_if_needed'));
});
