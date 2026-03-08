import { it } from 'node:test';
import assert from 'node:assert/strict';

import { buildXhsUnifiedAutoscript } from '../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';
import { updateProfileStatsFromEvent, createProfileStats } from '../../../apps/webauto/entry/lib/xhs-unified-runtime-blocks.mjs';

function getOperation(script, id) {
  return (script.operations || []).find((item) => item?.id === id) || null;
}

it('like stage folds like execution into comments_harvest and disables standalone comment_like op', () => {
  const script = buildXhsUnifiedAutoscript({
    profileId: 'xhs-like-inline-1',
    keyword: 'deepseek',
    stage: 'like',
    stageLinksEnabled: true,
    stageContentEnabled: true,
    stageLikeEnabled: true,
    stageReplyEnabled: false,
    doComments: true,
    doLikes: true,
    doReply: false,
    persistComments: true,
    maxLikesPerRound: 3,
  });

  assert.equal(getOperation(script, 'comments_harvest')?.enabled, true);
  assert.equal(getOperation(script, 'comments_harvest')?.params?.doLikes, true);
  assert.deepEqual(getOperation(script, 'comments_harvest')?.params?.likeKeywords, ['deepseek']);
  assert.equal(getOperation(script, 'comments_harvest')?.params?.maxLikesPerRound, 3);
  assert.equal(getOperation(script, 'comment_like'), null);
  assert.equal(getOperation(script, 'close_detail')?.dependsOn?.[0], 'comment_match_gate');
});

it('comments_harvest result updates like stats for inline visible-comment likes', () => {
  const stats = createProfileStats({ assignedNotes: 1 });
  updateProfileStatsFromEvent(stats, {
    event: 'autoscript:operation_done',
    operationId: 'comments_harvest',
    result: {
      result: {
        collected: 12,
        expectedCommentsCount: 50,
        reachedBottom: false,
        hitCount: 4,
        likedCount: 3,
        skippedCount: 2,
        alreadyLikedSkipped: 1,
        dedupSkipped: 1,
        commentsPath: '/tmp/comments.jsonl',
        summaryPath: '/tmp/likes.summary.json',
        likeStatePath: '/tmp/.like-state.jsonl',
      },
    },
  });

  assert.equal(stats.commentsHarvestRuns, 1);
  assert.equal(stats.commentsCollected, 12);
  assert.equal(stats.commentsExpected, 50);
  assert.equal(stats.likesHitCount, 4);
  assert.equal(stats.likesNewCount, 3);
  assert.equal(stats.likesSkippedCount, 2);
  assert.equal(stats.likesAlreadyCount, 1);
  assert.equal(stats.likesDedupCount, 1);
  assert.deepEqual(stats.commentPaths, ['/tmp/comments.jsonl']);
  assert.deepEqual(stats.likeSummaryPaths, ['/tmp/likes.summary.json']);
  assert.deepEqual(stats.likeStatePaths, ['/tmp/.like-state.jsonl']);
});
