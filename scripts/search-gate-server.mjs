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

const HOST = String(process.env.WEBAUTO_SEARCH_GATE_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.WEBAUTO_SEARCH_GATE_PORT || 7790);
const DEFAULT_WINDOW_MS = Number(process.env.WEBAUTO_SEARCH_GATE_WINDOW_MS || 60_000);
const DEFAULT_MAX_COUNT = Number(process.env.WEBAUTO_SEARCH_GATE_MAX_COUNT || 5);
const DEFAULT_LIKE_WINDOW_MS = Number(process.env.WEBAUTO_LIKE_GATE_WINDOW_MS || 60_000);
const DEFAULT_LIKE_MAX_COUNT = Number(process.env.WEBAUTO_LIKE_GATE_MAX_COUNT || 6);
const KEYWORD_WINDOW_MS = Number(process.env.WEBAUTO_SEARCH_GATE_KEYWORD_WINDOW_MS || 180_000);
const KEYWORD_MAX_COUNT = Number(process.env.WEBAUTO_SEARCH_GATE_KEYWORD_MAX_COUNT || 3);
const DEV_MAX_CONSECUTIVE_SAME_KEYWORD = Number(process.env.WEBAUTO_SEARCH_GATE_DEV_MAX_CONSECUTIVE_SAME_KEYWORD || 2);

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

const buckets = new Map();
const likeBuckets = new Map();
const keywordBuckets = new Map();
const keywordHistory = new Map();

function nowMs() {
  return Date.now();
}

function computeLikePermit(key, windowMs, maxCount) {
  const now = nowMs();
  const records = likeBuckets.get(key) || [];
  const threshold = now - windowMs;
  const pruned = records.filter((ts) => ts > threshold);

  if (pruned.length < maxCount) {
    pruned.push(now);
    likeBuckets.set(key, pruned);
    return {
      allowed: true,
      waitMs: 0,
      countInWindow: pruned.length,
    };
  }

  const oldest = pruned[0];
  const waitMs = Math.max(0, windowMs - (now - oldest));
  likeBuckets.set(key, pruned);
  return {
    allowed: false,
    waitMs,
    countInWindow: pruned.length,
  };
}

function computePermit(key, windowMs, maxCount) {
  const now = nowMs();
  const records = buckets.get(key) || [];
  const threshold = now - windowMs;
  const pruned = records.filter((ts) => ts > threshold);

  if (pruned.length < maxCount) {
    pruned.push(now);
    buckets.set(key, pruned);
    return {
      allowed: true,
      waitMs: 0,
      countInWindow: pruned.length,
    };
  }

  const oldest = pruned[0];
  const waitMs = Math.max(0, windowMs - (now - oldest));
  buckets.set(key, pruned);
  return {
    allowed: false,
    waitMs,
    countInWindow: pruned.length,
  };
}

function checkKeywordPermit(key, keyword, windowMs, maxCount) {
  const now = nowMs();
  const bucketKey = `${key}::${keyword}`;
  const records = keywordBuckets.get(bucketKey) || [];
  const threshold = now - windowMs;
  const pruned = records.filter((ts) => ts > threshold);

  if (pruned.length < maxCount) {
    return {
      allowed: true,
      waitMs: 0,
      countInWindow: pruned.length,
      bucketKey,
      pruned,
    };
  }

  const oldest = pruned[0];
  const waitMs = Math.max(0, windowMs - (now - oldest));
  return {
    allowed: false,
    waitMs,
    countInWindow: pruned.length,
    bucketKey,
    pruned,
  };
}

function recordKeywordPermit(bucketKey, pruned) {
  const now = nowMs();
  const updated = [...pruned, now];
  keywordBuckets.set(bucketKey, updated);
  return updated;
}

function recordKeywordHistory(key, keyword) {
  if (!key || !keyword) return 0;
  const history = keywordHistory.get(key) || [];
  const nextHistory = [keyword, ...history.filter((item) => item && item !== keyword)].slice(0, 6);
  keywordHistory.set(key, nextHistory);
  return nextHistory.filter((item) => item === keyword).length;
}

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

function buildPermitResponse({
  key,
  keyword,
  windowMs,
  maxCount,
  allowed,
  waitMs,
  countInWindow,
  reason,
  deny,
  dev,
  devTag,
}) {
  return {
    ok: true,
    allowed: Boolean(allowed),
    waitMs: Math.max(0, Number(waitMs) || 0),
    retryAfterMs: Math.max(0, Number(waitMs) || 0),
    reason: reason || null,
    deny: deny || null,
    windowMs,
    maxCount,
    countInWindow: Number(countInWindow || 0),
    key,
    keyword: keyword || null,
    dev: dev === true,
    devTag: devTag || null,
  };
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
        buckets: Array.from(buckets.entries()),
        keywordHistory: Array.from(keywordHistory.entries()),
      });
    }
    if (req.method === 'POST' && url.pathname === '/shutdown') {
      json(res, 200, { ok: true });
      setTimeout(() => process.exit(0), 200);
      return;
    }

    if (req.method !== 'POST' || url.pathname !== '/permit') {
      return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    }

    const body = await parseBody(req);
    const rawKey = body?.key || body?.profileId || 'default';
    const key = String(rawKey || 'default');
    const keyword = body?.keyword ? String(body.keyword).trim() : '';
    const windowMs = Number(body?.windowMs || DEFAULT_WINDOW_MS);
    const maxCount = Number(body?.maxCount || DEFAULT_MAX_COUNT);
    const likeGate = body?.like === true;
    const dev = body?.dev === true;
    const devTag = body?.devTag ? String(body.devTag) : null;

    if (likeGate) {
      const permit = computeLikePermit(key, windowMs || DEFAULT_LIKE_WINDOW_MS, maxCount || DEFAULT_LIKE_MAX_COUNT);
      const response = buildPermitResponse({
        key,
        keyword,
        windowMs: windowMs || DEFAULT_LIKE_WINDOW_MS,
        maxCount: maxCount || DEFAULT_LIKE_MAX_COUNT,
        ...permit,
      });
      console.log('[SearchGate] permit', JSON.stringify({ key, allowed: response.allowed, reason: null, waitMs: response.waitMs, countInWindow: response.countInWindow, dev, devTag }));
      return json(res, 200, response);
    }

    if (keyword) {
      const keywordPermit = checkKeywordPermit(key, keyword, KEYWORD_WINDOW_MS, KEYWORD_MAX_COUNT);
      if (!keywordPermit.allowed) {
        const response = buildPermitResponse({
          key,
          keyword,
          windowMs: KEYWORD_WINDOW_MS,
          maxCount: KEYWORD_MAX_COUNT,
          allowed: false,
          waitMs: keywordPermit.waitMs,
          countInWindow: keywordPermit.countInWindow,
          reason: 'keyword_rate_limit',
          deny: 'keyword_rate_limit',
          dev,
          devTag,
        });
        console.log('[SearchGate] permit', JSON.stringify({ key, allowed: false, reason: 'keyword_rate_limit', waitMs: response.waitMs, countInWindow: response.countInWindow, keyword, dev, devTag }));
        return json(res, 200, response);
      }
      recordKeywordPermit(keywordPermit.bucketKey, keywordPermit.pruned);

      if (dev) {
        const consecutive = recordKeywordHistory(key, keyword);
        if (consecutive > DEV_MAX_CONSECUTIVE_SAME_KEYWORD) {
          const response = buildPermitResponse({
            key,
            keyword,
            windowMs,
            maxCount,
            allowed: false,
            waitMs: 0,
            countInWindow: consecutive,
            reason: 'dev_consecutive_keyword_limit',
            deny: 'dev_consecutive_keyword_limit',
            dev,
            devTag,
          });
          console.log('[SearchGate] permit', JSON.stringify({ key, allowed: false, reason: 'dev_consecutive_keyword_limit', keyword, consecutive, dev, devTag }));
          return json(res, 200, response);
        }
      }
    }

    const permit = computePermit(key, windowMs, maxCount);
    const response = buildPermitResponse({
      key,
      keyword,
      windowMs,
      maxCount,
      ...permit,
      dev,
      devTag,
    });
    console.log('[SearchGate] permit', JSON.stringify({ key, allowed: response.allowed, reason: response.reason, waitMs: response.waitMs, countInWindow: response.countInWindow, keyword, dev, devTag }));
    return json(res, 200, response);
  } catch (err) {
    console.error('[SearchGate] error', err?.message || String(err));
    return json(res, 500, { ok: false, error: 'INTERNAL_ERROR' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[SearchGate] listening on http://${HOST}:${PORT} (window: ${DEFAULT_WINDOW_MS / 1000}s, max: ${DEFAULT_MAX_COUNT} searches per key, keyword window: ${KEYWORD_WINDOW_MS / 1000}s, keyword max: ${KEYWORD_MAX_COUNT})`);
});
