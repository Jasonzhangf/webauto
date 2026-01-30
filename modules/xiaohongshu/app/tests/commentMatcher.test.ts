import test from 'node:test';
import assert from 'node:assert/strict';

import { matchCommentText } from '../src/blocks/helpers/commentMatcher.js';

test('matchCommentText supports any-of (default min=1)', () => {
  const res = matchCommentText('这个评论里有 链接 和别的内容', { any: ['链接', '地址'] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.anyHits, ['链接']);
});

test('matchCommentText supports minAnyMatches (any two keywords)', () => {
  const res = matchCommentText('a... c...', { any: ['a', 'b', 'c'], minAnyMatches: 2, caseSensitive: true });
  assert.equal(res.ok, true);
  assert.equal(res.anyCount, 2);
  assert.deepEqual(res.anyHits, ['a', 'c']);
});

test('matchCommentText supports must + any together', () => {
  const ok = matchCommentText('工作服 这家有链接', { must: ['工作服'], any: ['链接'] });
  assert.equal(ok.ok, true);

  const badMust = matchCommentText('这家有链接', { must: ['工作服'], any: ['链接'] });
  assert.equal(badMust.ok, false);
  assert.equal(badMust.rejectedBy, 'must');

  const badAny = matchCommentText('工作服 这家不错', { must: ['工作服'], any: ['链接'] });
  assert.equal(badAny.ok, false);
  assert.equal(badAny.rejectedBy, 'any');
});

test('matchCommentText supports mustNot exclusion', () => {
  const ok = matchCommentText('可以私信发链接', { any: ['链接'], mustNot: ['淘宝'] });
  assert.equal(ok.ok, true);

  const bad = matchCommentText('淘宝 链接在这', { any: ['链接'], mustNot: ['淘宝'] });
  assert.equal(bad.ok, false);
  assert.equal(bad.rejectedBy, 'mustNot');
});

test('matchCommentText defaults to case-insensitive', () => {
  const res = matchCommentText('Hello LINK', { any: ['link'] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.anyHits, ['link']);
});

