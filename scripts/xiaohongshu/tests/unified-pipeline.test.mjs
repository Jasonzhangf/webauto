import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFlag,
  buildOperationPlan,
  commentMatches,
  matchHarvestedComments,
} from '../lib/unified-pipeline.mjs';

test('parseFlag handles string booleans', () => {
  assert.equal(parseFlag('true', false), true);
  assert.equal(parseFlag('false', true), false);
  assert.equal(parseFlag('1', false), true);
  assert.equal(parseFlag('0', true), false);
});

test('buildOperationPlan keeps ordered tasks and next_note tail', () => {
  const plan = buildOperationPlan({
    doHomepage: true,
    doImages: true,
    doComments: true,
    doLikes: true,
    doReply: true,
  });
  assert.deepEqual(plan, [
    'detail_harvest',
    'comments_harvest',
    'comment_match_gate',
    'comment_like',
    'comment_reply',
    'next_note',
  ]);
});



test('buildOperationPlan merges comments+likes into single comment_like op', () => {
  const plan = buildOperationPlan({
    doHomepage: false,
    doImages: false,
    doComments: true,
    doLikes: true,
    doReply: false,
  });
  assert.deepEqual(plan, ['comment_like', 'next_note']);
});

test('buildOperationPlan allows like-only flow without comments harvest', () => {
  const plan = buildOperationPlan({
    doHomepage: false,
    doImages: false,
    doComments: false,
    doLikes: true,
    doReply: false,
  });
  assert.deepEqual(plan, ['comment_like', 'next_note']);
});

test('commentMatches supports any/atLeast/all', () => {
  assert.equal(commentMatches('操底马上上链接', ['操底', '上链接'], 'any', 1).ok, true);
  assert.equal(commentMatches('操底马上上链接', ['操底', '上链接'], 'atLeast', 2).ok, true);
  assert.equal(commentMatches('操底马上', ['操底', '上链接'], 'all', 1).ok, false);
});

test('matchHarvestedComments filters to matched rows', () => {
  const rows = [
    { userId: 'u1', content: '操底机会来了 上链接' },
    { userId: 'u2', content: '纯路过' },
  ];
  const matched = matchHarvestedComments(rows, ['操底', '上链接'], 'atLeast', 2);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].userId, 'u1');
});
