import test from 'node:test';
import assert from 'node:assert/strict';

import { compileLikeRules, matchLikeText } from './Phase3InteractBlock.js';

test('compileLikeRules parses plain token and brace syntax', () => {
  const rules = compileLikeRules(['求链接', '{工作服 + 定制}', '{求链接 - 已买}', '{坏格式}']);
  assert.equal(rules.length, 4);
  assert.deepEqual(rules[0], { kind: 'contains', include: '求链接', raw: '求链接' });
  assert.deepEqual(rules[1], { kind: 'and', includeA: '工作服', includeB: '定制', raw: '{工作服 + 定制}' });
  assert.deepEqual(rules[2], { kind: 'include_without', include: '求链接', exclude: '已买', raw: '{求链接 - 已买}' });
  assert.deepEqual(rules[3], { kind: 'contains', include: '{坏格式}', raw: '{坏格式}' });
});

test('matchLikeText supports any-hit across mixed rule list', () => {
  const rules = compileLikeRules(['{求链接 + 工作服}', '{求链接 - 已买}', '操底']);

  const andHit = matchLikeText('大佬 求链接 工作服 有吗', rules);
  assert.equal(andHit.ok, true);
  assert.equal(andHit.matchedRule, '{求链接 + 工作服}');

  const minusHit = matchLikeText('求链接，顺便问下尺码', rules);
  assert.equal(minusHit.ok, true);
  assert.equal(minusHit.matchedRule, '{求链接 - 已买}');

  const plainHit = matchLikeText('今天准备操底', rules);
  assert.equal(plainHit.ok, true);
  assert.equal(plainHit.matchedRule, '操底');

  const miss = matchLikeText('已买了，不需要链接', rules);
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, 'no_rule_match');
});
