// Weibo API reads executed inside the logged-in browser origin.
// Comments use the mobile endpoints because the desktop detail page has no
// load-more control and exposes only the first page.

import {
  normalizeCommentRow,
  normalizeReplyRow,
  normalizeStatus,
} from './extract.mjs';

// A fetch the host rejects (rate limit, blocked cursor parameter, or a
// cross-compartment error) is serialized here so it reaches the caller as
// data. Without this, the rejection escapes browser.evaluate's catch as an
// un-deserializable value and fails the whole detail flow, including the
// status payload that was already collected.
function guardPageScript(script) {
  return `Promise.resolve(${script})
    .then((value) => ({ __error: null, value }))
    .catch((error) => ({ __error: String(error?.message || error), value: null }))`;
}

function commentPageScript(url) {
  return guardPageScript(`fetch(${JSON.stringify(url)}, { credentials: 'include' })
    .then((response) => response.json())
    .then((payload) => {
      const data = payload.data || {};
      return {
        ok: payload.ok === 1,
        maxId: data.max_id || null,
        maxIdType: data.max_id_type || 0,
        rows: (data.data || []).map((row) => ({
          id: row.id,
          text: row.text || '',
          created_at: row.created_at,
          like_count: row.like_count || 0,
          source: row.source,
          floor_number: row.floor_number,
          total_number: row.total_number || 0,
          user_id: row.user?.id || null,
          user_name: row.user?.screen_name || null,
        })),
      };
    })`);
}

function replyPageScript(url, referer) {
  return guardPageScript(`fetch(${JSON.stringify(url)}, {
    credentials: 'include',
    headers: { Referer: ${JSON.stringify(referer)} },
  })
    .then((response) => response.json())
    .then((payload) => {
      const data = payload.data || {};
      const rows = Array.isArray(data) ? data : (data.data || []);
      return {
        ok: payload.ok === 1,
        maxId: Array.isArray(data) ? null : (data.max_id || null),
        rows: rows.map((row) => ({
          id: row.id,
          text: row.text || '',
          created_at: row.created_at,
          like_count: row.like_count || 0,
          reply_original_text: row.reply_original_text || null,
          user_id: row.user?.id || null,
          user_name: row.user?.screen_name || null,
        })),
      };
    })`);
}

// Bounded retry for a rejected comment/reply page. A cursor request can be
// rejected after a short burst and served again once that state clears, so one
// bounded retry pass is worth taking before stopping the walk.
//
// Two different failures are kept apart:
//   * browser.evaluate REJECTING (transport threw) propagates unchanged, so a
//     reply failure still fails the flow instead of becoming a partial result;
//   * a page the host refused inside the page context comes back as an
//     __error-bearing object and is treated as a rejected attempt.
async function fetchPage(browser, script, attempts, retryDelayMs) {
  const tries = Math.max(1, attempts);
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const result = await browser.evaluate(script);
    if (!isGuardedResult(result)) return { payload: result, reason: null };
    if (result.__error === null) return { payload: result.value, reason: null };
    lastError = result.__error;
    if (attempt < tries) await sleep(Math.max(0, Number(retryDelayMs)) * attempt);
  }
  return { payload: null, reason: lastError || 'request_rejected' };
}

// Only an object that came through guardPageScript carries __error. A plain
// page result (ok/maxId/rows) never does, so injecting a mock evaluate that
// returns the bare shape keeps working.
function isGuardedResult(result) {
  return result !== null && typeof result === 'object' && !Array.isArray(result) && '__error' in result;
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function readStatus(browser, mid) {
  const payload = await browser.fetchJson(`https://m.weibo.cn/statuses/show?id=${encodeURIComponent(mid)}`);
  const data = payload?.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`status API returned no data for ${mid}`);
  }
  return normalizeStatus(data, mid);
}

export async function readComments(browser, mid, {
  limit = 0,
  maxPages = 200,
  minPageIntervalMs = 250,
  attempts = 2,
  retryDelayMs = 3000,
} = {}) {
  const out = [];
  const seen = new Set();
  let maxId = null;
  let maxIdType = 0;
  // Fallback label for a walk that consumed every allowed page without the
  // limit or the cursor terminating it first.
  let tailReason = 'pages_exhausted';

  for (let page = 0; page < maxPages; page++) {
    const pageStartedAt = Date.now();
    const base = `https://m.weibo.cn/comments/hotflow?id=${encodeURIComponent(mid)}&mid=${encodeURIComponent(mid)}`;
    const url = maxId
      ? `${base}&max_id=${encodeURIComponent(maxId)}&max_id_type=${encodeURIComponent(maxIdType)}`
      : `${base}&max_id_type=0`;
    const { payload, reason } = await fetchPage(browser, commentPageScript(url), attempts, retryDelayMs);

    if (!payload) {
      // Rejected after the bounded retry. Pages already collected stay usable;
      // the walk stops and reports why instead of failing the reader.
      tailReason = page === 0 ? 'api_unavailable' : `page_blocked:${reason || 'request_rejected'}`;
      break;
    }
    if (!payload.ok) {
      if (page === 0) {
        throw new Error(`comment API failed for ${mid} at page 1`);
      }
      tailReason = 'api_not_ok';
      break;
    }

    // Whether this iteration added anything the reader did not already have.
    let progress = false;
    for (const row of payload.rows || []) {
      const comment = normalizeCommentRow(row);
      if (!comment.id || seen.has(comment.id)) continue;
      seen.add(comment.id);
      out.push(comment);
      progress = true;
      if (limit > 0 && out.length >= limit) return setTailReason(out, 'limit_reached');
    }

    if (!progress && out.length > 0) {
      // The cursor moved but the page held no new comments. This is a stall
      // rather than a refusal: the walk would otherwise repeat the same
      // contents until maxPages. Stop while keeping what was collected.
      tailReason = 'no_progress';
      break;
    }

    const nextId = payload.maxId ? String(payload.maxId) : null;
    if (!nextId || nextId === String(maxId)) {
      tailReason = out.length > 0 ? 'no_more_pages' : 'api_unavailable';
      break;
    }
    maxId = nextId;
    maxIdType = payload.maxIdType || 0;
    // Readiness for the next page is the resolved response itself: the loop
    // only advances because a payload proved ok and moved maxId. What remains
    // is only request pacing, so it is a bounded minimum interval checked
    // against the time this page already took; a slow response consumes it and
    // a ready next page is requested immediately.
    await paceBeforeNextPage(pageStartedAt, minPageIntervalMs);
  }
  return setTailReason(out, tailReason);
}

function setTailReason(list, reason) {
  // Implementation detail consumed only by readPostWithComments, which moves it
  // onto the result object. Callers must not rely on seeing it on the array.
  list.tailReason = reason;
  return list;
}

// Minimum interval between comments API pages. This is not a readiness wait:
// the caller already proved readiness by validating the response, so the
// elapsed budget is deducted and nothing is awaited when pacing is disabled or
// already satisfied.
async function paceBeforeNextPage(startedAt, minIntervalMs) {
  const remaining = Number(minIntervalMs) - (Date.now() - startedAt);
  if (!(remaining > 0)) return;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}

export async function readReplies(browser, mid, comment, {
  limit = 0,
  maxPages = 200,
  attempts = 2,
  retryDelayMs = 3000,
} = {}) {
  if (!comment?.replyCount) return [];
  const out = [];
  const seen = new Set();
  let maxId = null;
  const referer = `https://m.weibo.cn/detail/${mid}`;

  for (let page = 0; page < maxPages; page++) {
    const base = `https://m.weibo.cn/comments/hotFlowChild?cid=${encodeURIComponent(comment.id)}`;
    const url = maxId
      ? `${base}&max_id=${encodeURIComponent(maxId)}&max_id_type=0`
      : `${base}&max_id=0&max_id_type=0`;
    const { payload } = await fetchPage(browser, replyPageScript(url, referer), attempts, retryDelayMs);
    if (!payload || !payload.ok) {
      // Replies are optional enrichment, but a rejected reply API must not be
      // reported as an empty-but-complete reply set.
      throw new Error(`reply API failed for ${comment.id}`);
    }
    for (const row of payload.rows || []) {
      const reply = normalizeReplyRow(row);
      if (!reply.id || seen.has(reply.id)) continue;
      seen.add(reply.id);
      out.push(reply);
      if (limit > 0 && out.length >= limit) return out;
    }
    const nextId = payload.maxId ? String(payload.maxId) : null;
    if (!nextId || nextId === String(maxId)) break;
    maxId = nextId;
  }
  return out;
}

export async function readPostWithComments(browser, mid, options = {}) {
  const status = await readStatus(browser, mid);
  const comments = await readComments(browser, mid, {
    limit: options.commentLimit || 0,
    maxPages: options.commentPages || 200,
    minPageIntervalMs: options.minPageIntervalMs ?? 250,
    attempts: options.commentAttempts ?? 2,
    retryDelayMs: options.commentRetryDelayMs ?? 3000,
  });
  // readComments attaches its stop reason on the list. Carry it out on the
  // object instead of as an array property so callers can report the
  // truncation without reading a magic field.
  const tailReason = comments.tailReason || 'limit_reached';
  const commentList = Array.from(comments);
  delete commentList.tailReason;
  if (options.expandAllReplies !== false) {
    for (const comment of commentList) {
      comment.replies = await readReplies(browser, mid, comment, {
        limit: options.repliesPerComment ?? 0,
        maxPages: options.replyPages || 200,
        attempts: options.replyAttempts ?? 2,
        retryDelayMs: options.replyRetryDelayMs ?? 3000,
      });
    }
  }
  return { status, comments: commentList, commentTailReason: tailReason };
}
