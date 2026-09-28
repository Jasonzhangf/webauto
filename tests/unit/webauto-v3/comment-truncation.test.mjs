import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readComments,
  readPostWithComments,
} from '../../../apps/webauto/weibo-v3/api-reader.mjs';

const MID = 'AbC123';
const STATUS = { data: { id: MID, text: 'body', user: { id: 1, screen_name: 'author' } } };

function pagePayload(rows, extra = {}) {
  return {
    maxId: 'cursor-next',
    maxIdType: 0,
    rows,
    ...extra,
    ok: extra.ok ?? true,
  };
}

function blocked(error) {
  return { __error: error, value: null };
}

test('a truncated comment walk keeps collected pages and reports why it stopped', async () => {
  let pages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate() {
      pages += 1;
      if (pages === 1) {
        return pagePayload([
          { id: 'c1', text: 'first', total_number: 0 },
          { id: 'c2', text: 'second', total_number: 0 },
        ]);
      }
      return blocked('NetworkError when attempting to fetch resource.');
    },
  };

  const result = await readComments(browser, MID, {
    retryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(pages, 3);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'c1');
  assert.equal(result[1].id, 'c2');
  assert.equal(result.tailReason, 'page_blocked:NetworkError when attempting to fetch resource.');
});

test('a refused comment API that never serves a single page reports api_unavailable', async () => {
  let pages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate() {
      pages += 1;
      return blocked('NetworkError when attempting to fetch resource.');
    },
  };

  const result = await readComments(browser, MID, {
    retryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(pages, 2);
  assert.equal(result.length, 0);
  assert.equal(result.tailReason, 'api_unavailable');
});

test('readComments reports api_not_ok when the endpoint answers without the success flag', async () => {
  // The first page succeeds and sets a cursor. The follow-up page is served,
  // but the endpoint answers without ok -- the classic rate-limit shape. The
  // reader must stop and say so instead of looping on the same page.
  let pages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate() {
      pages += 1;
      return pages === 1
        ? pagePayload([{ id: 'c1', text: 'first', total_number: 0 }], { maxId: 'cursor-1' })
        : pagePayload([], { ok: 0 });
    },
  };

  const result = await readComments(browser, MID, {
    retryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(pages, 2);
  assert.equal(result.length, 1);
  assert.equal(result.tailReason, 'api_not_ok');
});

test('readPostWithComments reports the truncation without polluting the comment list', async () => {
  let pages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate() {
      pages += 1;
      if (pages === 1) {
        return pagePayload([{ id: 'c1', text: 'first', total_number: 0 }]);
      }
      return blocked('NetworkError when attempting to fetch resource.');
    },
  };

  const result = await readPostWithComments(browser, MID, {
    expandAllReplies: false,
    commentRetryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(result.commentTailReason, 'page_blocked:NetworkError when attempting to fetch resource.');
  assert.equal(result.comments.length, 1);
  assert.equal('tailReason' in result.comments, false);
  assert.equal(result.status.mid, MID);
});

test('readComments retries a refused page before reporting the block', async () => {
  let firstPageTries = 0;
  let laterPageTries = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate(script) {
      if (!String(script).includes('max_id=')) {
        firstPageTries += 1;
        // The first attempt is refused; the retry is served and moves the cursor.
        return firstPageTries === 1
          ? blocked('blocked on the first try')
          : pagePayload([{ id: 'c1', text: 'first', total_number: 0 }], { maxId: 'cursor-1' });
      }
      laterPageTries += 1;
      return blocked('No more comments.');
    },
  };

  const result = await readComments(browser, MID, {
    attempts: 2,
    retryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(firstPageTries, 2, 'the refused first page must be retried before stopping');
  assert.equal(laterPageTries, 2, 'a refused later page must be retried as well');
  assert.equal(result.length, 1);
  assert.equal(result.tailReason, 'page_blocked:No more comments.');
});

test('readComments reports no_more_pages when the cursor never moves', async () => {
  let pages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate() {
      pages += 1;
      return pagePayload([{ id: 'c1', text: 'first', total_number: 0 }], {
        maxId: null,
      });
    },
  };

  const result = await readComments(browser, MID, {
    retryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(pages, 1);
  assert.equal(result.length, 1);
  assert.equal(result.tailReason, 'no_more_pages');
});

test('a cursor that stops producing new comments ends the walk instead of looping', async () => {
  let pages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate() {
      pages += 1;
      if (pages === 1) {
        return pagePayload([{ id: 'c1', text: 'first', total_number: 0 }], { maxId: 'cursor-1' });
      }
      // The host honours the cursor move but returns the same contents again,
      // so the walk would repeat them until maxPages without a progress check.
      return pagePayload([{ id: 'c1', text: 'first', total_number: 0 }], { maxId: 'cursor-2' });
    },
  };

  const result = await readComments(browser, MID, {
    maxPages: 200,
    retryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(pages, 2);
  assert.equal(result.length, 1);
  assert.equal(result.tailReason, 'no_progress');
});

test('a refused reply endpoint is reported per comment instead of failing the post', async () => {
  // hotFlowChild answers non-JSON for a cid. That refusal comes back as an
  // __error-bearing object (transport intact), so it must be reported on the
  // comment -- not thrown away with the collected status and comments, and not
  // labelled a complete reply set.
  let replyTries = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate(script) {
      if (!String(script).includes('hotFlowChild')) {
        return pagePayload([{ id: 'c1', text: 'first', total_number: 2 }], { maxId: null });
      }
      replyTries += 1;
      return blocked('SyntaxError: JSON.parse: unexpected character');
    },
  };

  const result = await readPostWithComments(browser, MID, {
    commentRetryDelayMs: 0,
    replyRetryDelayMs: 0,
    minPageIntervalMs: 0,
  });

  assert.equal(result.commentTailReason, 'no_more_pages');
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].replies.length, 0);
  assert.equal(result.comments[0].replyTailReason, 'api_unavailable');
  assert.equal(replyTries, 2, 'the refused reply page must be retried once');
  assert.equal('replyTailReason' in result.comments[0].replies, false);
});

test('a reply walk that repeats the same rows ends instead of looping', async () => {
  // hotFlowChild can honour a cursor move and still hand back the same reply
  // twice, which would otherwise repeat until maxPages. The walk must stop.
  let replyPages = 0;
  const browser = {
    async fetchJson() {
      return STATUS;
    },
    async evaluate(script) {
      if (!String(script).includes('hotFlowChild')) {
        return pagePayload([{ id: 'c1', text: 'first', total_number: 2 }], { maxId: null });
      }
      replyPages += 1;
      return pagePayload(
        [{ id: 'r1', text: 'reply', user: { screen_name: 'replier' } }],
        { maxId: replyPages === 1 ? 'cursor-1' : 'cursor-2' },
      );
    },
  };

  const result = await readPostWithComments(browser, MID, {
    minPageIntervalMs: 0,
    commentRetryDelayMs: 0,
    replyRetryDelayMs: 0,
  });

  assert.equal(replyPages, 2, 'must stop on a stalled reply cursor, not walk maxPages');
  assert.equal(result.comments[0].replies.length, 1);
  assert.equal(result.comments[0].replyTailReason, undefined, 'a stalled walk is not a refusal');
});
