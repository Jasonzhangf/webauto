import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmartReplyUserPrompt, sanitizeSmartReply, mockSmartReply } from '../blocks/helpers/smartReply.js';
import { execute as generate } from '../blocks/GenerateSmartReplyBlock.js';

test('buildSmartReplyUserPrompt contains note/comment tags', () => {
  const s = buildSmartReplyUserPrompt({ note: '帖子正文', comment: '当前评论', maxChars: 20 });
  assert.ok(s.includes('<note>帖子正文</note>'));
  assert.ok(s.includes('<comment>当前评论</comment>'));
  assert.ok(s.includes('不超过 20 字'));
});

test('sanitizeSmartReply trims and enforces max chars', () => {
  const out = sanitizeSmartReply('“回复： 这个真的太好用了哈哈哈哈哈哈哈哈哈哈”', 10);
  assert.equal(Array.from(out).length <= 10, true);
  assert.equal(out.includes('回复'), false);
  assert.equal(out.includes('“'), false);
});

test('mockSmartReply returns non-empty <= maxChars', () => {
  const out = mockSmartReply('一些内容', '一些评论', 20);
  assert.ok(out.length > 0);
  assert.equal(Array.from(out).length <= 20, true);
});

test('GenerateSmartReplyBlock uses mock in dryRun mode', async () => {
  const res = await generate({ note: 'note', comment: 'comment', dryRun: true, maxChars: 20 });
  assert.equal(res.success, true);
  assert.equal(res.usedMock, true);
  assert.ok(res.reply.length > 0);
});
