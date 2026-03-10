export function createSearchGateState() {
  return {
    buckets: new Map(),
    likeBuckets: new Map(),
    keywordBuckets: new Map(),
    keywordHistory: new Map(),
    resourceHistory: new Map(),
    detailQueues: new Map(),
  };
}

function cloneLinkPayload(link) {
  return link && typeof link === 'object' ? { ...link } : link;
}

function createLinkKey(link) {
  if (!link || typeof link !== 'object') return '';
  return String(link.noteId || link.noteUrl || link.url || link.href || '').trim();
}

function ensureDetailQueueState(state, queueKey) {
  const key = String(queueKey || 'default').trim() || 'default';
  if (!(state.detailQueues instanceof Map)) {
    state.detailQueues = new Map();
  }
  if (!state.detailQueues.has(key)) {
    state.detailQueues.set(key, {
      key,
      order: [],
      items: new Map(),
      activeByConsumer: new Map(),
      consumerByKey: new Map(),
      completed: new Map(),
      skipped: new Map(),
      updatedAt: null,
      initializedAt: null,
    });
  }
  return state.detailQueues.get(key);
}

function normalizeDetailLinks(links) {
  const rows = Array.isArray(links) ? links : [];
  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const key = createLinkKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      key,
      link: cloneLinkPayload(row),
    });
  }
  return normalized;
}

function removeOrderKey(order, key) {
  if (!Array.isArray(order) || !key) return [];
  return order.filter((item) => String(item || '').trim() !== key);
}

function resolveDetailQueueLinkKey(body = {}) {
  return String(
    body?.resourceKey
      || body?.noteId
      || body?.noteUrl
      || body?.url
      || createLinkKey(body?.link)
      || '',
  ).trim();
}

function buildDetailQueueResponse(queue, payload = {}) {
  return {
    ok: true,
    key: queue?.key || 'default',
    queueLength: Array.isArray(queue?.order) ? queue.order.length : 0,
    activeCount: queue?.activeByConsumer instanceof Map ? queue.activeByConsumer.size : 0,
    completedCount: queue?.completed instanceof Map ? queue.completed.size : 0,
    updatedAt: queue?.updatedAt || null,
    initializedAt: queue?.initializedAt || null,
    ...payload,
  };
}

function releaseConsumerAssignment(queue, consumerId = null, key = null) {
  const normalizedConsumerId = String(consumerId || '').trim();
  const normalizedKey = String(key || '').trim();
  let released = null;

  if (normalizedConsumerId && queue.activeByConsumer.has(normalizedConsumerId)) {
    released = queue.activeByConsumer.get(normalizedConsumerId) || null;
    queue.activeByConsumer.delete(normalizedConsumerId);
    if (released?.key) {
      const currentConsumer = String(queue.consumerByKey.get(released.key) || '').trim();
      if (!currentConsumer || currentConsumer === normalizedConsumerId) {
        queue.consumerByKey.delete(released.key);
      }
    }
  }

  if (!released && normalizedKey) {
    const owner = String(queue.consumerByKey.get(normalizedKey) || '').trim();
    if (owner && queue.activeByConsumer.has(owner)) {
      released = queue.activeByConsumer.get(owner) || null;
      queue.activeByConsumer.delete(owner);
    }
    if (owner || queue.consumerByKey.has(normalizedKey)) {
      queue.consumerByKey.delete(normalizedKey);
    }
  }

  return released;
}

export function initDetailLinkQueue(state, body = {}, now = Date.now()) {
  const queueKey = String(body?.key || body?.profileId || 'default').trim() || 'default';
  const queue = ensureDetailQueueState(state, queueKey);
  const normalizedLinks = normalizeDetailLinks(body?.links);
  const items = new Map();
  const order = [];
  for (const entry of normalizedLinks) {
    items.set(entry.key, entry);
    order.push(entry.key);
  }
  queue.order = order;
  queue.items = items;
  queue.activeByConsumer = new Map();
  queue.consumerByKey = new Map();
  queue.completed = new Map();
  queue.skipped = new Map();
  queue.initializedAt = new Date(now).toISOString();
  queue.updatedAt = queue.initializedAt;
  return buildDetailQueueResponse(queue, {
    action: 'init',
    changed: true,
    totalLinks: order.length,
  });
}

export function claimDetailLink(state, body = {}, now = Date.now()) {
  const queueKey = String(body?.key || body?.profileId || 'default').trim() || 'default';
  const consumerId = String(body?.consumerId || body?.tabId || '').trim() || null;
  const queue = ensureDetailQueueState(state, queueKey);
  if (!(queue.skipped instanceof Map)) {
    queue.skipped = new Map();
  }

  if (consumerId && queue.activeByConsumer.has(consumerId)) {
    const active = queue.activeByConsumer.get(consumerId) || null;
    return buildDetailQueueResponse(queue, {
      action: 'claim',
      found: Boolean(active?.link),
      reused: true,
      consumerId,
      key: queue.key,
      linkKey: active?.key || null,
      link: cloneLinkPayload(active?.link || null),
    });
  }

  const length = Array.isArray(queue.order) ? queue.order.length : 0;
  if (length <= 0) {
    return buildDetailQueueResponse(queue, {
      action: 'claim',
      found: false,
      exhausted: true,
      consumerId,
      linkKey: null,
      link: null,
    });
  }

  for (let index = 0; index < length; index += 1) {
    const nextKey = String(queue.order.shift() || '').trim();
    if (!nextKey) continue;
    queue.order.push(nextKey);
    const entry = queue.items.get(nextKey) || null;
    if (!entry?.link) continue;
    if (queue.completed.has(nextKey)) continue;
    if (queue.skipped.has(nextKey)) continue;
    const owner = String(queue.consumerByKey.get(nextKey) || '').trim();
    if (owner && owner !== consumerId) continue;

    const claimedAt = new Date(now).toISOString();
    const active = {
      key: nextKey,
      link: cloneLinkPayload(entry.link),
      consumerId,
      claimedAt,
    };
    if (consumerId) {
      queue.activeByConsumer.set(consumerId, active);
      queue.consumerByKey.set(nextKey, consumerId);
    }
    queue.updatedAt = claimedAt;
    return buildDetailQueueResponse(queue, {
      action: 'claim',
      found: true,
      exhausted: false,
      consumerId,
      linkKey: nextKey,
      link: cloneLinkPayload(entry.link),
      claimedAt,
    });
  }

  return buildDetailQueueResponse(queue, {
    action: 'claim',
    found: false,
    exhausted: false,
    blocked: true,
    consumerId,
    linkKey: null,
    link: null,
  });
}

export function completeDetailLink(state, body = {}, now = Date.now()) {
  const queueKey = String(body?.key || body?.profileId || 'default').trim() || 'default';
  const consumerId = String(body?.consumerId || body?.tabId || '').trim() || null;
  const queue = ensureDetailQueueState(state, queueKey);
  const linkKey = resolveDetailQueueLinkKey(body);
  const released = releaseConsumerAssignment(queue, consumerId, linkKey);
  const targetKey = String(linkKey || released?.key || '').trim();
  const entry = targetKey ? queue.items.get(targetKey) || null : null;
  const removed = Boolean(targetKey && queue.items.has(targetKey));
  if (removed) {
    queue.items.delete(targetKey);
    queue.order = removeOrderKey(queue.order, targetKey);
    queue.skipped.delete(targetKey);
    queue.completed.set(targetKey, {
      completedAt: new Date(now).toISOString(),
      consumerId,
      link: cloneLinkPayload(entry?.link || released?.link || body?.link || null),
    });
    queue.updatedAt = new Date(now).toISOString();
  }
  return buildDetailQueueResponse(queue, {
    action: 'done',
    consumerId,
    removed,
    found: removed,
    linkKey: targetKey || null,
    link: cloneLinkPayload(entry?.link || released?.link || body?.link || null),
  });
}

export function releaseDetailLink(state, body = {}, now = Date.now()) {
  const queueKey = String(body?.key || body?.profileId || 'default').trim() || 'default';
  const consumerId = String(body?.consumerId || body?.tabId || '').trim() || null;
  const queue = ensureDetailQueueState(state, queueKey);
  const linkKey = resolveDetailQueueLinkKey(body);
  const released = releaseConsumerAssignment(queue, consumerId, linkKey);
  const targetKey = String(linkKey || released?.key || '').trim() || null;
  if (!(queue.skipped instanceof Map)) {
    queue.skipped = new Map();
  }
  if (targetKey) {
    const reason = String(body?.reason || '').trim() || null;
    if (body?.skip === true || reason === 'stale_closed') {
      queue.items.delete(targetKey);
      queue.order = removeOrderKey(queue.order, targetKey);
      queue.skipped.set(targetKey, {
        skippedAt: new Date(now).toISOString(),
        consumerId,
        reason: reason || 'stale_closed',
        link: cloneLinkPayload(released?.link || body?.link || null),
      });
      queue.updatedAt = new Date(now).toISOString();
      return buildDetailQueueResponse(queue, {
        action: 'release',
        consumerId,
        released: true,
        skipped: true,
        linkKey: targetKey,
        link: cloneLinkPayload(released?.link || body?.link || null),
      });
    }
  }
  queue.updatedAt = new Date(now).toISOString();
  return buildDetailQueueResponse(queue, {
    action: 'release',
    consumerId,
    released: Boolean(released || targetKey),
    linkKey: targetKey,
    link: cloneLinkPayload(released?.link || body?.link || null),
  });
}

export function clearDetailLinkQueue(state, body = {}, now = Date.now()) {
  const queueKey = String(body?.key || body?.profileId || 'default').trim() || 'default';
  const queue = ensureDetailQueueState(state, queueKey);
  queue.order = [];
  queue.items = new Map();
  queue.activeByConsumer = new Map();
  queue.consumerByKey = new Map();
  queue.completed = new Map();
  queue.skipped = new Map();
  queue.updatedAt = new Date(now).toISOString();
  return buildDetailQueueResponse(queue, {
    action: 'clear',
    cleared: true,
  });
}

export function summarizeDetailQueues(state) {
  if (!(state?.detailQueues instanceof Map)) return [];
  return Array.from(state.detailQueues.entries()).map(([key, queue]) => ({
    key,
    queueLength: Array.isArray(queue?.order) ? queue.order.length : 0,
    activeCount: queue?.activeByConsumer instanceof Map ? queue.activeByConsumer.size : 0,
    completedCount: queue?.completed instanceof Map ? queue.completed.size : 0,
    initializedAt: queue?.initializedAt || null,
    updatedAt: queue?.updatedAt || null,
  }));
}

function normalizeKind(kind, fallback = 'search') {
  const value = String(kind || fallback).trim().toLowerCase();
  if (value === 'open' || value === 'open_detail' || value === 'open-link' || value === 'open_link') return 'open_link';
  if (value === 'like') return 'like';
  return 'search';
}

function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pruneWindow(records, now, windowMs) {
  const threshold = now - windowMs;
  return (Array.isArray(records) ? records : []).filter((ts) => Number(ts) > threshold);
}

function computeWindowPermit(bucketMap, bucketKey, windowMs, maxCount, now) {
  const pruned = pruneWindow(bucketMap.get(bucketKey) || [], now, windowMs);
  if (pruned.length < maxCount) {
    bucketMap.set(bucketKey, [...pruned, now]);
    return { allowed: true, waitMs: 0, countInWindow: pruned.length + 1 };
  }
  const oldest = Number(pruned[0] || now);
  bucketMap.set(bucketKey, pruned);
  return {
    allowed: false,
    waitMs: Math.max(0, windowMs - (now - oldest)),
    countInWindow: pruned.length,
  };
}

function checkKeywordPermit(keywordBuckets, key, keyword, windowMs, maxCount, now) {
  const bucketKey = `${key}::${keyword}`;
  const pruned = pruneWindow(keywordBuckets.get(bucketKey) || [], now, windowMs);
  if (pruned.length < maxCount) {
    return { allowed: true, waitMs: 0, countInWindow: pruned.length, bucketKey, pruned };
  }
  const oldest = Number(pruned[0] || now);
  return {
    allowed: false,
    waitMs: Math.max(0, windowMs - (now - oldest)),
    countInWindow: pruned.length,
    bucketKey,
    pruned,
  };
}

function recordKeywordPermit(keywordBuckets, bucketKey, pruned, now) {
  const updated = [...(Array.isArray(pruned) ? pruned : []), now];
  keywordBuckets.set(bucketKey, updated);
  return updated;
}

function recordKeywordHistory(keywordHistory, key, keyword) {
  if (!key || !keyword) return 0;
  const history = keywordHistory.get(key) || [];
  const nextHistory = [keyword, ...history.filter((item) => item && item !== keyword)].slice(0, 6);
  keywordHistory.set(key, nextHistory);
  return nextHistory.filter((item) => item === keyword).length;
}

function countTrailingSame(history, resourceKey) {
  let count = 0;
  for (const item of history) {
    if (item !== resourceKey) break;
    count += 1;
  }
  return count;
}

function checkConsecutiveResourcePermit(resourceHistory, bucketKey, resourceKey, maxConsecutiveSame) {
  if (!resourceKey || maxConsecutiveSame <= 0) {
    return { allowed: true, consecutiveCount: 0 };
  }
  const history = Array.isArray(resourceHistory.get(bucketKey)) ? resourceHistory.get(bucketKey) : [];
  const consecutiveCount = countTrailingSame(history, resourceKey);
  if (consecutiveCount >= maxConsecutiveSame) {
    return { allowed: false, consecutiveCount };
  }
  return { allowed: true, consecutiveCount };
}

function recordResourceHistory(resourceHistory, bucketKey, resourceKey) {
  if (!resourceKey) return [];
  const history = Array.isArray(resourceHistory.get(bucketKey)) ? resourceHistory.get(bucketKey) : [];
  const nextHistory = [resourceKey, ...history].slice(0, 12);
  resourceHistory.set(bucketKey, nextHistory);
  return nextHistory;
}

export function buildPermitResponse({
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
  kind,
  resourceKey,
  consecutiveCount,
  sameResourceMaxConsecutive,
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
    kind: kind || 'search',
    resourceKey: resourceKey || null,
    consecutiveCount: Math.max(0, Number(consecutiveCount || 0) || 0),
    sameResourceMaxConsecutive: Math.max(0, Number(sameResourceMaxConsecutive || 0) || 0),
    dev: dev === true,
    devTag: devTag || null,
  };
}

export function evaluateSearchGatePermit(state, body = {}, config = {}, now = Date.now()) {
  const rawKey = body?.key || body?.profileId || 'default';
  const key = String(rawKey || 'default').trim() || 'default';
  const kind = normalizeKind(body?.kind, body?.like === true ? 'like' : 'search');
  const keyword = body?.keyword ? String(body.keyword).trim() : '';
  const resourceKey = String(body?.resourceKey || (kind === 'search' ? keyword : '') || '').trim();
  const dev = body?.dev === true;
  const devTag = body?.devTag ? String(body.devTag) : null;
  const bucketKey = `${kind}::${key}`;

  const windowDefaults = {
    search: normalizePositiveNumber(config.defaultWindowMs, 60_000),
    open_link: normalizePositiveNumber(config.defaultOpenWindowMs, 120_000),
    like: normalizePositiveNumber(config.defaultLikeWindowMs, 60_000),
  };
  const maxDefaults = {
    search: normalizePositiveNumber(config.defaultMaxCount, 5),
    open_link: normalizePositiveNumber(config.defaultOpenMaxCount, 20),
    like: normalizePositiveNumber(config.defaultLikeMaxCount, 6),
  };

  const windowMs = normalizePositiveNumber(body?.windowMs, windowDefaults[kind] || windowDefaults.search);
  const maxCount = normalizePositiveNumber(body?.maxCount, maxDefaults[kind] || maxDefaults.search);
  const sameResourceMaxConsecutive = normalizePositiveNumber(
    body?.sameResourceMaxConsecutive,
    normalizePositiveNumber(config.defaultSameResourceMaxConsecutive, 2),
  );
  const denyOnConsecutiveSame = body?.denyOnConsecutiveSame !== false && Boolean(resourceKey);

  if (kind === 'like') {
    const permit = computeWindowPermit(state.likeBuckets, bucketKey, windowMs, maxCount, now);
    return buildPermitResponse({
      key,
      keyword,
      kind,
      resourceKey,
      windowMs,
      maxCount,
      ...permit,
      dev,
      devTag,
      sameResourceMaxConsecutive,
    });
  }

  if (kind === 'search' && keyword) {
    const keywordWindowMs = normalizePositiveNumber(config.keywordWindowMs, 180_000);
    const keywordMaxCount = normalizePositiveNumber(config.keywordMaxCount, 3);
    const keywordPermit = checkKeywordPermit(state.keywordBuckets, key, keyword, keywordWindowMs, keywordMaxCount, now);
    if (!keywordPermit.allowed) {
      return buildPermitResponse({
        key,
        keyword,
        kind,
        resourceKey,
        windowMs: keywordWindowMs,
        maxCount: keywordMaxCount,
        allowed: false,
        waitMs: keywordPermit.waitMs,
        countInWindow: keywordPermit.countInWindow,
        reason: 'keyword_rate_limit',
        deny: 'keyword_rate_limit',
        dev,
        devTag,
        sameResourceMaxConsecutive,
      });
    }
    recordKeywordPermit(state.keywordBuckets, keywordPermit.bucketKey, keywordPermit.pruned, now);

    if (dev) {
      const consecutive = recordKeywordHistory(state.keywordHistory, key, keyword);
      const devMaxConsecutiveSameKeyword = normalizePositiveNumber(config.devMaxConsecutiveSameKeyword, 2);
      if (consecutive > devMaxConsecutiveSameKeyword) {
        return buildPermitResponse({
          key,
          keyword,
          kind,
          resourceKey,
          windowMs,
          maxCount,
          allowed: false,
          waitMs: 0,
          countInWindow: consecutive,
          reason: 'dev_consecutive_keyword_limit',
          deny: 'dev_consecutive_keyword_limit',
          dev,
          devTag,
          consecutiveCount: consecutive,
          sameResourceMaxConsecutive: devMaxConsecutiveSameKeyword,
        });
      }
    }
  }

  if (denyOnConsecutiveSame) {
    const consecutivePermit = checkConsecutiveResourcePermit(state.resourceHistory, bucketKey, resourceKey, sameResourceMaxConsecutive);
    if (!consecutivePermit.allowed) {
      return buildPermitResponse({
        key,
        keyword,
        kind,
        resourceKey,
        windowMs,
        maxCount,
        allowed: false,
        waitMs: 0,
        countInWindow: consecutivePermit.consecutiveCount,
        reason: 'consecutive_same_resource_limit',
        deny: 'consecutive_same_resource_limit',
        dev,
        devTag,
        consecutiveCount: consecutivePermit.consecutiveCount,
        sameResourceMaxConsecutive,
      });
    }
  }

  const permit = kind === 'open_link'
    ? (() => {
      const pruned = pruneWindow(state.buckets.get(bucketKey) || [], now, windowMs);
      state.buckets.set(bucketKey, pruned);
      if (pruned.length < maxCount) {
        return { allowed: true, waitMs: 0, countInWindow: pruned.length };
      }
      const oldest = Number(pruned[0] || now);
      return {
        allowed: false,
        waitMs: Math.max(0, windowMs - (now - oldest)),
        countInWindow: pruned.length,
      };
    })()
    : computeWindowPermit(state.buckets, bucketKey, windowMs, maxCount, now);
  if (kind !== 'open_link' && permit.allowed && denyOnConsecutiveSame) {
    recordResourceHistory(state.resourceHistory, bucketKey, resourceKey);
  }
  return buildPermitResponse({
    key,
    keyword,
    kind,
    resourceKey,
    windowMs,
    maxCount,
    ...permit,
    dev,
    devTag,
    sameResourceMaxConsecutive,
  });
}

export function confirmSearchGateUsage(state, body = {}, config = {}, now = Date.now()) {
  const rawKey = body?.key || body?.profileId || 'default';
  const key = String(rawKey || 'default').trim() || 'default';
  const kind = normalizeKind(body?.kind, body?.like === true ? 'like' : 'search');
  const keyword = body?.keyword ? String(body.keyword).trim() : '';
  const resourceKey = String(body?.resourceKey || (kind === 'search' ? keyword : '') || '').trim();
  const bucketKey = `${kind}::${key}`;

  const windowDefaults = {
    search: normalizePositiveNumber(config.defaultWindowMs, 60_000),
    open_link: normalizePositiveNumber(config.defaultOpenWindowMs, 120_000),
    like: normalizePositiveNumber(config.defaultLikeWindowMs, 60_000),
  };
  const maxDefaults = {
    search: normalizePositiveNumber(config.defaultMaxCount, 5),
    open_link: normalizePositiveNumber(config.defaultOpenMaxCount, 20),
    like: normalizePositiveNumber(config.defaultLikeMaxCount, 6),
  };
  const windowMs = normalizePositiveNumber(body?.windowMs, windowDefaults[kind] || windowDefaults.search);
  const maxCount = normalizePositiveNumber(body?.maxCount, maxDefaults[kind] || maxDefaults.search);
  const sameResourceMaxConsecutive = normalizePositiveNumber(
    body?.sameResourceMaxConsecutive,
    normalizePositiveNumber(config.defaultSameResourceMaxConsecutive, 2),
  );

  if (kind !== 'open_link') {
    return buildPermitResponse({
      key,
      keyword,
      kind,
      resourceKey,
      windowMs,
      maxCount,
      allowed: true,
      waitMs: 0,
      countInWindow: 0,
      reason: 'confirm_not_required',
      sameResourceMaxConsecutive,
    });
  }

  const pruned = pruneWindow(state.buckets.get(bucketKey) || [], now, windowMs);
  const nextBucket = [...pruned, now];
  state.buckets.set(bucketKey, nextBucket);
  recordResourceHistory(state.resourceHistory, bucketKey, resourceKey);
  return buildPermitResponse({
    key,
    keyword,
    kind,
    resourceKey,
    windowMs,
    maxCount,
    allowed: true,
    waitMs: 0,
    countInWindow: nextBucket.length,
    reason: 'confirmed',
    sameResourceMaxConsecutive,
  });
}
