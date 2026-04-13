#!/usr/bin/env node
/**
 * SearchGate 后台节流服务
 *
 * 职责:
 *   - 控制搜索频率（默认：同一 key 60s 最多 5 次）
 *   - 所有搜索 Block 在触发“对话框搜索”前，必须先向本服务申请许可
 *
 * 接口:
 *   - POST /permit
 *       body: { key?, profileId?, windowMs?, maxCount?, keyword? }
 *       返回: { ok, allowed, waitMs, retryAfterMs, reason?, deny?, windowMs, maxCount, countInWindow, key, keyword? }
 *   - GET /health
 *   - GET /stats
 *   - POST /shutdown
 */

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import {
  createSearchGateState,
  evaluateSearchGatePermit,
  confirmSearchGateUsage,
  initDetailLinkQueue,
  claimDetailLink,
  completeDetailLink,
  releaseDetailLink,
  clearDetailLinkQueue,
  summarizeDetailQueues,
  recordSeen,
  checkSeen,
  summarizeSeenRecords,
  loadSeenRecords,
} from '../runtime/infra/utils/search-gate-core.mjs';

const HOST = String(process.env.WEBAUTO_SEARCH_GATE_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.WEBAUTO_SEARCH_GATE_PORT || 7790);
const DEFAULT_WINDOW_MS = Number(process.env.WEBAUTO_SEARCH_GATE_WINDOW_MS || 60_000);
const DEFAULT_MAX_COUNT = Number(process.env.WEBAUTO_SEARCH_GATE_MAX_COUNT || 5);
const DEFAULT_LIKE_WINDOW_MS = Number(process.env.WEBAUTO_LIKE_GATE_WINDOW_MS || 60_000);
const DEFAULT_LIKE_MAX_COUNT = Number(process.env.WEBAUTO_LIKE_GATE_MAX_COUNT || 6);
const DEFAULT_OPEN_WINDOW_MS = Number(process.env.WEBAUTO_OPEN_GATE_WINDOW_MS || 180_000);
const DEFAULT_OPEN_MAX_COUNT = Number(process.env.WEBAUTO_OPEN_GATE_MAX_COUNT || 12);
const KEYWORD_WINDOW_MS = Number(process.env.WEBAUTO_SEARCH_GATE_KEYWORD_WINDOW_MS || 180_000);
const KEYWORD_MAX_COUNT = Number(process.env.WEBAUTO_SEARCH_GATE_KEYWORD_MAX_COUNT || 3);
const DEV_MAX_CONSECUTIVE_SAME_KEYWORD = Number(process.env.WEBAUTO_SEARCH_GATE_DEV_MAX_CONSECUTIVE_SAME_KEYWORD || 2);
const DEFAULT_SAME_RESOURCE_MAX_CONSECUTIVE = Number(process.env.WEBAUTO_GATE_SAME_RESOURCE_MAX_CONSECUTIVE || 2);

function startHeartbeatWatcher() {
  const filePath = process.env.WEBAUTO_HEARTBEAT_FILE;
  if (!filePath) return () => {};
  const staleMs = Number(process.env.WEBAUTO_HEARTBEAT_STALE_MS || 45_000);
  const intervalMs = Number(process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS || Math.max(2000, Math.floor(staleMs / 3)));
  const startAt = Date.now();

  const timer = setInterval(() => {
    let ts = 0;
    let status = '';

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(raw);
      if (payload && typeof payload === 'object') {
        status = typeof payload.status === 'string' ? payload.status : '';
        ts = payload.ts ? Date.parse(payload.ts) : 0;
      }
    } catch (err) {
      if (err?.code === 'ENOENT') {
        if (Date.now() - startAt > staleMs) {
          console.warn(`[SearchGate] heartbeat missing: ${filePath}`);
          process.exit(0);
        }
      }
      return;
    }

    if (status === 'stopped') {
      console.warn('[SearchGate] heartbeat stopped, exiting');
      process.exit(0);
    }

    if (!ts) {
      try {
        const stat = fs.statSync(filePath);
        ts = Number(stat.mtimeMs || 0);
      } catch {
        return;
      }
    }

    const age = Date.now() - ts;
    if (age > staleMs) {
      console.warn(`[SearchGate] heartbeat stale ${age}ms > ${staleMs}ms`);
      process.exit(0);
    }
  }, intervalMs);

  timer.unref();
  return () => clearInterval(timer);
}

if (String(process.env.WEBAUTO_SEARCH_GATE_DISABLE_HEARTBEAT || '').trim() !== '1') {
  startHeartbeatWatcher();
} else {
  console.warn('[SearchGate] heartbeat watcher disabled via WEBAUTO_SEARCH_GATE_DISABLE_HEARTBEAT=1');
}

const gateState = createSearchGateState();
// Load persistent seen records on startup
loadSeenRecords(gateState);

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      return json(res, 200, {
        ok: true,
        buckets: Array.from(gateState.buckets.entries()),
        likeBuckets: Array.from(gateState.likeBuckets.entries()),
        keywordBuckets: Array.from(gateState.keywordBuckets.entries()),
        keywordHistory: Array.from(gateState.keywordHistory.entries()),
        resourceHistory: Array.from(gateState.resourceHistory.entries()),
        detailQueues: summarizeDetailQueues(gateState),
        seenRecords: summarizeSeenRecords(gateState),
      });
    }
    if (req.method === 'POST' && url.pathname === '/shutdown') {
      json(res, 200, { ok: true });
      setTimeout(() => process.exit(0), 200);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/confirm') {
      const body = await parseBody(req);
      const response = confirmSearchGateUsage(gateState, body || {}, {
        defaultWindowMs: DEFAULT_WINDOW_MS,
        defaultMaxCount: DEFAULT_MAX_COUNT,
        defaultLikeWindowMs: DEFAULT_LIKE_WINDOW_MS,
        defaultLikeMaxCount: DEFAULT_LIKE_MAX_COUNT,
        defaultOpenWindowMs: DEFAULT_OPEN_WINDOW_MS,
        defaultOpenMaxCount: DEFAULT_OPEN_MAX_COUNT,
        keywordWindowMs: KEYWORD_WINDOW_MS,
        keywordMaxCount: KEYWORD_MAX_COUNT,
        devMaxConsecutiveSameKeyword: DEV_MAX_CONSECUTIVE_SAME_KEYWORD,
        defaultSameResourceMaxConsecutive: DEFAULT_SAME_RESOURCE_MAX_CONSECUTIVE,
      });
      console.log('[SearchGate] confirm', JSON.stringify({ key: response.key, kind: response.kind, resourceKey: response.resourceKey, reason: response.reason, countInWindow: response.countInWindow }));
      return json(res, 200, response);
    }

    if (req.method === 'POST' && url.pathname === '/detail-links/init') {
      const body = await parseBody(req);
      const response = initDetailLinkQueue(gateState, body || {});
      console.log('[SearchGate] detail-links init', JSON.stringify({ key: response.key, totalLinks: response.totalLinks, queueLength: response.queueLength }));
      return json(res, 200, response);
    }

    if (req.method === 'POST' && url.pathname === '/detail-links/next') {
      const body = await parseBody(req);
      const response = claimDetailLink(gateState, body || {});
      console.log('[SearchGate] detail-links next', JSON.stringify({ key: response.key, consumerId: body?.consumerId || null, found: response.found, exhausted: response.exhausted, blocked: response.blocked, linkKey: response.linkKey || null }));
      return json(res, 200, response);
    }

    if (req.method === 'POST' && url.pathname === '/detail-links/done') {
      const body = await parseBody(req);
      const response = completeDetailLink(gateState, body || {});
      console.log('[SearchGate] detail-links done', JSON.stringify({ key: response.key, consumerId: body?.consumerId || null, removed: response.removed, linkKey: response.linkKey || null }));
      return json(res, 200, response);
    }

    if (req.method === 'POST' && url.pathname === '/detail-links/release') {
      const body = await parseBody(req);
      const response = releaseDetailLink(gateState, body || {});
      console.log('[SearchGate] detail-links release', JSON.stringify({ key: response.key, consumerId: body?.consumerId || null, released: response.released, linkKey: response.linkKey || null }));
      return json(res, 200, response);
    }

    if (req.method === 'POST' && url.pathname === '/detail-links/clear') {
      const body = await parseBody(req);
      const response = clearDetailLinkQueue(gateState, body || {});
      console.log('[SearchGate] detail-links clear', JSON.stringify({ key: response.key, cleared: response.cleared }));
      return json(res, 200, response);
    }

    // Producer Dedup APIs (Server-Side Seen Records)
    if (req.method === 'POST' && url.pathname === '/detail-links/record-seen') {
      const body = await parseBody(req);
      const response = recordSeen(gateState, body || {});
      console.log('[SearchGate] detail-links record-seen', JSON.stringify({ noteId: response.noteId, alreadySeen: response.alreadySeen }));
      return json(res, 200, response);
    }

    if (req.method === 'POST' && url.pathname === '/detail-links/check-seen') {
      const body = await parseBody(req);
      const response = checkSeen(gateState, body || {});
      console.log('[SearchGate] detail-links check-seen', JSON.stringify({ seenCount: response.seenCount, unseenCount: response.unseenCount }));
      return json(res, 200, response);
    }

    if (req.method !== 'POST' || url.pathname !== '/permit') {
      return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    }

    const body = await parseBody(req);
    const rawKey = body?.key || body?.profileId || 'default';
    const key = String(rawKey || 'default');
    const response = evaluateSearchGatePermit(gateState, body || {}, {
      defaultWindowMs: DEFAULT_WINDOW_MS,
      defaultMaxCount: DEFAULT_MAX_COUNT,
      defaultLikeWindowMs: DEFAULT_LIKE_WINDOW_MS,
      defaultLikeMaxCount: DEFAULT_LIKE_MAX_COUNT,
      defaultOpenWindowMs: DEFAULT_OPEN_WINDOW_MS,
      defaultOpenMaxCount: DEFAULT_OPEN_MAX_COUNT,
      keywordWindowMs: KEYWORD_WINDOW_MS,
      keywordMaxCount: KEYWORD_MAX_COUNT,
      devMaxConsecutiveSameKeyword: DEV_MAX_CONSECUTIVE_SAME_KEYWORD,
      defaultSameResourceMaxConsecutive: DEFAULT_SAME_RESOURCE_MAX_CONSECUTIVE,
    });
    console.log('[SearchGate] permit', JSON.stringify({ key, kind: response.kind, resourceKey: response.resourceKey, allowed: response.allowed, reason: response.reason, waitMs: response.waitMs, countInWindow: response.countInWindow, consecutiveCount: response.consecutiveCount, sameResourceMaxConsecutive: response.sameResourceMaxConsecutive, keyword: response.keyword, dev: response.dev, devTag: response.devTag }));
    return json(res, 200, response);
  } catch (err) {
    console.error('[SearchGate] error', err?.message || String(err));
    return json(res, 500, { ok: false, error: 'INTERNAL_ERROR' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[SearchGate] listening on http://${HOST}:${PORT} (search window: ${DEFAULT_WINDOW_MS / 1000}s/${DEFAULT_MAX_COUNT}, open window: ${DEFAULT_OPEN_WINDOW_MS / 1000}s/${DEFAULT_OPEN_MAX_COUNT}, keyword window: ${KEYWORD_WINDOW_MS / 1000}s/${KEYWORD_MAX_COUNT}, same resource max consecutive: ${DEFAULT_SAME_RESOURCE_MAX_CONSECUTIVE + 1}th denied)`);
});
