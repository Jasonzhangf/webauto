import test from 'node:test';
import assert from 'node:assert/strict';

import { matchCommentTextDsl, type CommentMatchDslRule } from '../src/blocks/helpers/commentMatchDsl.js';

test('dsl require:any matches any one', () => {
  const res = matchCommentTextDsl('求链接 谢谢', { require: { op: 'any', terms: ['链接', '地址'] } });
  assert.equal(res.ok, true);
  assert.deepEqual(res.requireHits, ['链接']);
});

test('dsl require:atLeast supports any two', () => {
  const res = matchCommentTextDsl('a c', { caseSensitive: true, require: { op: 'atLeast', terms: ['a', 'b', 'c'], min: 2 } });
  assert.equal(res.ok, true);
  assert.equal(res.requireHits.length, 2);
});

test('dsl exclude rejects when matched', () => {
  const res = matchCommentTextDsl('淘宝 链接', { require: { op: 'any', terms: ['链接'] }, exclude: { op: 'any', terms: ['淘宝'] } });
  assert.equal(res.ok, false);
  assert.equal(res.rejectedBy, 'exclude');
  assert.deepEqual(res.excludeHits, ['淘宝']);
});

test('dsl supports and/or/not composition', () => {
  const rule: CommentMatchDslRule = {
    caseSensitive: true,
    require: {
      op: 'and',
      exprs: [
        { op: 'or', exprs: [{ op: 'any', terms: ['a'] }, { op: 'any', terms: ['b'] }] },
        { op: 'not', expr: { op: 'any', terms: ['x'] } },
      ],
    },
  };

  assert.equal(matchCommentTextDsl('a', rule).ok, true);
  assert.equal(matchCommentTextDsl('b', rule).ok, true);
  assert.equal(matchCommentTextDsl('x a', rule).ok, false);
});

test('dsl prefer contributes to score', () => {
  const res = matchCommentTextDsl('求链接 真的太喜欢了', {
    require: { op: 'any', terms: ['链接'] },
    prefer: { op: 'any', terms: ['喜欢', '爱了'] },
  });
  assert.equal(res.ok, true);
  assert.ok(res.score >= 100);
  assert.deepEqual(res.preferHits, ['喜欢']);
});
