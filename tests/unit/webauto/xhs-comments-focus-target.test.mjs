import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCommentFocusTarget } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs';

describe('xhs comment focus target resolution', () => {
  it('prefers a visible comment over the scroll container', () => {
    const result = resolveCommentFocusTarget({
      visibleComment: {
        selector: '.comment-item',
        center: { x: 120, y: 260 },
        rect: { left: 80, top: 220, width: 280, height: 72 },
      },
      commentTotal: {
        selector: '.total',
        center: { x: 140, y: 180 },
      },
      commentScroll: {
        selector: '.note-scroller',
        center: { x: 420, y: 200 },
      },
    });

    assert.equal(result?.source, 'visible_comment');
    assert.equal(result?.selector, '.comment-item');
    assert.deepEqual(result?.center, { x: 120, y: 260 });
  });

  it('falls back to comment total before the whole scroll container', () => {
    const result = resolveCommentFocusTarget({
      visibleComment: null,
      commentTotal: {
        selector: '.total',
        center: { x: 140, y: 180 },
      },
      commentScroll: {
        selector: '.note-scroller',
        center: { x: 420, y: 200 },
      },
    });

    assert.equal(result?.source, 'comment_total');
    assert.equal(result?.selector, '.total');
  });

  it('uses the scroll container only when no safer focus target exists', () => {
    const result = resolveCommentFocusTarget({
      visibleComment: null,
      commentTotal: null,
      commentScroll: {
        selector: '.note-scroller',
        center: { x: 420, y: 200 },
      },
    });

    assert.equal(result?.source, 'comment_scroll');
    assert.equal(result?.selector, '.note-scroller');
  });
});
