import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCommentRow,
  normalizePost,
  normalizeStatus,
  postIdFromUrl,
  stripHtml,
} from '../../../apps/webauto/weibo-v3/extract.mjs';

test('weibo extractors preserve the existing business shape', () => {
  assert.equal(postIdFromUrl('https://m.weibo.cn/detail/AbC123?x=1'), 'AbC123');
  assert.equal(postIdFromUrl('https://weibo.com/123/AbC123'), 'AbC123');
  assert.equal(stripHtml('<p>hello&nbsp;<b>world</b></p>'), 'hello world');

  const post = normalizePost({
    mid: 'AbC123',
    url: 'https://m.weibo.cn/detail/AbC123',
    author: 'flypig',
    text: 'hello',
  }, { userId: '1639529981' });
  assert.equal(post.id, 'AbC123');
  assert.equal(post.authorId, '1639529981');
  assert.equal(post.content, 'hello');

  const comment = normalizeCommentRow({
    id: 99,
    text: '<b>reply</b>',
    created_at: 'now',
    like_count: 3,
    total_number: 2,
    user: { id: 7, screen_name: 'user' },
  });
  assert.equal(comment.id, '99');
  assert.equal(comment.text, 'reply');
  assert.equal(comment.replyCount, 2);
});

test('weibo status media projection handles images and video', () => {
  const status = normalizeStatus({
    id: '42',
    text: '<span>body</span>',
    user: { id: 1, screen_name: 'author' },
    pics: [{ pid: 'p1', large: { url: 'https://img/large.jpg' } }],
    page_info: {
      object_type: 'video',
      media_info: { stream_url: 'https://video/low.mp4', stream_url_hd: 'https://video/hd.mp4' },
    },
  }, '42');
  assert.equal(status.content, 'body');
  assert.equal(status.images[0].url, 'https://img/large.jpg');
  assert.equal(status.video.streamUrlHd, 'https://video/hd.mp4');
});
