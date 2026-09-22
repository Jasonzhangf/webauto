// Weibo API reads executed inside the logged-in browser origin.
// Comments use the mobile endpoints because the desktop detail page has no
// load-more control and exposes only the first page.

import {
  normalizeCommentRow,
  normalizeReplyRow,
  normalizeStatus,
} from './extract.mjs';

function commentPageScript(url) {
  return `fetch(${JSON.stringify(url)}, { credentials: 'include' })
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
    })`;
}

function replyPageScript(url, referer) {
  return `fetch(${JSON.stringify(url)}, {
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
    })`;
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
} = {}) {
  const out = [];
  const seen = new Set();
  let maxId = null;
  let maxIdType = 0;

  for (let page = 0; page < maxPages; page++) {
    const pageStartedAt = Date.now();
    const base = `https://m.weibo.cn/comments/hotflow?id=${encodeURIComponent(mid)}&mid=${encodeURIComponent(mid)}`;
    const url = maxId
      ? `${base}&max_id=${encodeURIComponent(maxId)}&max_id_type=${encodeURIComponent(maxIdType)}`
      : `${base}&max_id_type=0`;
    const payload = await browser.evaluate(commentPageScript(url));
    if (!payload?.ok) {
      throw new Error(`comment API failed for ${mid} at page ${page + 1}`);
    }
    for (const row of payload.rows || []) {
      const comment = normalizeCommentRow(row);
      if (!comment.id || seen.has(comment.id)) continue;
      seen.add(comment.id);
      out.push(comment);
      if (limit > 0 && out.length >= limit) return out;
    }
    const nextId = payload.maxId ? String(payload.maxId) : null;
    if (!nextId || nextId === String(maxId)) break;
    maxId = nextId;
    maxIdType = payload.maxIdType || 0;
    // Readiness for the next page is the resolved response itself: the loop
    // only advances because a payload proved ok and moved maxId. What remains
    // is only request pacing, so it is a bounded minimum interval checked
    // against the time this page already took; a slow response consumes it and
    // a ready next page is requested immediately.
    await paceBeforeNextPage(pageStartedAt, minPageIntervalMs);
  }
  return out;
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
    const payload = await browser.evaluate(replyPageScript(url, referer));
    if (!payload?.ok) {
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
  });
  if (options.expandAllReplies !== false) {
    for (const comment of comments) {
      comment.replies = await readReplies(browser, mid, comment, {
        limit: options.repliesPerComment ?? 0,
        maxPages: options.replyPages || 200,
      });
    }
  }
  return { status, comments };
}
