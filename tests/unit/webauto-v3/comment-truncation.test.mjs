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
    ok: true,
    maxId: 'cursor-next',
    maxIdType: 0,
    rows,
    ...extra,
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
