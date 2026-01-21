#!/usr/bin/env node
/**
 * SearchGate 后台节流服务
 *
 * 职责：
 *   - 控制搜索频率（默认：同一 key 每 60s 最多 5 次）
 *   - 所有搜索 Block 在真正触发“对话框搜索”前，必须先向本服务申请许可
 *
 * 接口：
 *   - POST /permit
 *       body: { key?: string, profileId?: string, windowMs?: number, maxCount?: number }
 *       返回: { ok: true, allowed: boolean, waitMs: number, windowMs, maxCount, countInWindow, key }
 *   - GET /health
 *       返回: { ok: true }
 *   - POST /shutdown
 *       优雅退出（供脚本/命令行停止服务）
 *
 * 启动：
 *   node scripts/search-gate-server.mjs
 *
 * 端口：
 *   - 默认: 7790
 *   - 可通过环境变量 WEBAUTO_SEARCH_GATE_PORT 覆盖
 */

import http from 'node:http';
import { URL } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.WEBAUTO_SEARCH_GATE_PORT || 7790);
const DEFAULT_WINDOW_MS = Number(process.env.WEBAUTO_SEARCH_GATE_WINDOW_MS || 60_000);
const DEFAULT_MAX_COUNT = Number(process.env.WEBAUTO_SEARCH_GATE_MAX_COUNT || 5);
const DEV_MAX_CONSECUTIVE_SAME_KEYWORD = Number(process.env.WEBAUTO_SEARCH_GATE_DEV_MAX_CONSECUTIVE_SAME_KEYWORD || 2);

/**
 * 每个 key 的时间窗口内搜索记录
 * key 一般为 profileId（例如 xiaohongshu_fresh）
 */
const buckets = new Map();
// 开发阶段：记录每个 key 最近允许通过的 keyword，用于防止“连续三次同关键字搜索”导致软风控
const keywordHistory = new Map();

function nowMs() {
  return Date.now();
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

  // 计算距离下一次可用的时间
  const oldest = pruned[0];
  const waitMs = Math.max(0, windowMs - (now - oldest));
  buckets.set(key, pruned);
  return {
    allowed: false,
    waitMs,
    countInWindow: pruned.length,
  };
}

function normalizeKeyword(keyword) {
  const s = typeof keyword === 'string' ? keyword : '';
  return s.trim();
}

function pruneKeywordHistory(records) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const now = nowMs();
  // 只保留最近 24h，且最多 50 条，避免内存增长
  const cutoff = now - 24 * 60 * 60 * 1000;
  const pruned = records.filter((r) => r && typeof r.ts === 'number' && r.ts >= cutoff);
  return pruned.slice(-50);
}

function getConsecutiveSameKeywordCount(records, keyword) {
  if (!Array.isArray(records) || !records.length) return 0;
  let cnt = 0;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const k = normalizeKeyword(records[i]?.keyword || '');
    if (!k) break;
    if (k !== keyword) break;
    cnt += 1;
  }
  return cnt;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, ts: nowMs() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/shutdown') {
      sendJson(res, 200, { ok: true, message: 'SearchGate shutting down' });
      // 延迟退出，确保响应写完
      setTimeout(() => {
        process.exit(0);
      }, 200);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/permit') {
      const body = await readJson(req).catch((err) => {
        sendJson(res, 400, { ok: false, error: err.message });
      });
      if (!body) return;

      const profileId = (body.profileId || body.key || 'default').toString();
      const key = profileId || 'default';
      const keyword = normalizeKeyword(body.keyword || '');
      const dev = Boolean(body.dev);
      const devTag = typeof body.devTag === 'string' ? body.devTag.trim() : '';
      const windowMs = Number(body.windowMs || DEFAULT_WINDOW_MS);
      const maxCount = Number(body.maxCount || DEFAULT_MAX_COUNT);

      // 开发阶段：禁止连续 3 次（默认阈值 2，即前两次都一样则本次拒绝）同 keyword 搜索
      if (dev && keyword) {
        const prev = pruneKeywordHistory(keywordHistory.get(key) || []);
        const consecutive = getConsecutiveSameKeywordCount(prev, keyword);
        if (consecutive >= DEV_MAX_CONSECUTIVE_SAME_KEYWORD) {
          keywordHistory.set(key, prev);
          sendJson(res, 200, {
            ok: true,
            key,
            windowMs,
            maxCount,
            allowed: false,
            waitMs: 0,
            countInWindow: (buckets.get(key) || []).length,
            reason: 'dev_consecutive_keyword_limit',
            keyword,
            consecutive,
            dev: true,
            devTag: devTag || null,
          });
          return;
        }
      }

      const result = computePermit(key, windowMs, maxCount);

      // 仅在允许时记录 keyword 历史（开发阶段）
      if (result.allowed && dev && keyword) {
        const prev = pruneKeywordHistory(keywordHistory.get(key) || []);
        prev.push({ ts: nowMs(), keyword, devTag: devTag || null });
        keywordHistory.set(key, prev);
      }

      sendJson(res, 200, {
        ok: true,
        key,
        windowMs,
        maxCount,
        allowed: result.allowed,
        waitMs: result.waitMs,
        countInWindow: result.countInWindow,
        ...(keyword ? { keyword } : {}),
        ...(dev ? { dev: true, devTag: devTag || null } : {}),
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[SearchGate] listening on http://${HOST}:${PORT} (window: ${DEFAULT_WINDOW_MS / 1000}s, max: ${DEFAULT_MAX_COUNT} searches per key)`
  );
});
