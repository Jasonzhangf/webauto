import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INDEX_FILE = 'index.json';
const DEFAULT_COMMAND_TYPE = 'xhs-unified';
const SUPPORTED_COMMAND_TYPES = [
  'xhs-unified',
  'weibo-timeline',
  'weibo-search',
  'weibo-monitor',
  '1688-search',
];
const DEFAULT_INTERVAL_MINUTES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const POLICY_FILE = 'policy.json';
const LOCKS_DIR = 'locks';
const DAEMON_LEASE_FILE = 'daemon-lease.json';
const CLAIM_MUTEX_FILE = 'claim-mutex.json';
const TASK_CLAIMS_DIR = 'task-claims';
const RESOURCE_CLAIMS_DIR = 'resource-claims';
const DEFAULT_TASK_LEASE_MS = 30 * 60 * 1000;
const DEFAULT_DAEMON_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_SCHEDULER_POLICY = Object.freeze({
  maxConcurrency: 1,
  maxConcurrencyByPlatform: {},
  resourceMutex: {
    enabled: true,
    dimensions: ['account', 'profile'],
    allowCrossPlatformSameAccount: false,
  },
});

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return fallback;
  if (text === '1' || text === 'true' || text === 'yes') return true;
  if (text === '0' || text === 'false' || text === 'no') return false;
  return fallback;
}

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function normalizeMaxRuns(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return null;
  return Math.max(1, Math.floor(n));
}

function resolvePortableRoot() {
  const root = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  return root ? path.join(root, '.webauto') : '';
}

function resolveWebautoRoot() {
  const portableRoot = resolvePortableRoot();
  if (portableRoot) return portableRoot;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto');
}

export function resolveSchedulesRoot() {
  const explicit = String(process.env.WEBAUTO_PATHS_SCHEDULES || '').trim();
  if (explicit) return explicit;
  return path.join(resolveWebautoRoot(), 'schedules');
}

function resolveIndexPath() {
  return path.join(resolveSchedulesRoot(), INDEX_FILE);
}

function resolvePolicyPath() {
  return path.join(resolveSchedulesRoot(), POLICY_FILE);
}

function resolveLocksRoot() {
  return path.join(resolveSchedulesRoot(), LOCKS_DIR);
}

function resolveDaemonLeasePath() {
  return path.join(resolveLocksRoot(), DAEMON_LEASE_FILE);
}

function resolveClaimMutexPath() {
  return path.join(resolveLocksRoot(), CLAIM_MUTEX_FILE);
}

function resolveTaskClaimsRoot() {
  return path.join(resolveLocksRoot(), TASK_CLAIMS_DIR);
}

function resolveResourceClaimsRoot() {
  return path.join(resolveLocksRoot(), RESOURCE_CLAIMS_DIR);
}

function encodeLockKey(value) {
  const raw = Buffer.from(String(value || ''), 'utf8').toString('base64');
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') || 'empty';
}

function resolveTaskClaimPath(taskId) {
  return path.join(resolveTaskClaimsRoot(), `${encodeLockKey(taskId)}.json`);
}

function resolveResourceClaimPath(resourceKey) {
  return path.join(resolveResourceClaimsRoot(), `${encodeLockKey(resourceKey)}.json`);
}

function parseIsoTs(value) {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : null;
}

function buildLeasePayload({ ownerId, runToken = null, leaseMs, meta = {}, nowMs = Date.now() }) {
  const ttl = Math.max(1_000, Math.floor(Number(leaseMs) || DEFAULT_TASK_LEASE_MS));
  const iso = new Date(nowMs).toISOString();
  return {
    ownerId: String(ownerId || ''),
    runToken: normalizeText(runToken),
    createdAt: iso,
    updatedAt: iso,
    expiresAt: new Date(nowMs + ttl).toISOString(),
    ...meta,
  };
}

function isLeaseExpired(payload, nowMs = Date.now()) {
  const expiryTs = parseIsoTs(payload?.expiresAt);
  return !Number.isFinite(expiryTs) || expiryTs <= nowMs;
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function readLease(filePath) {
  return readJson(filePath, null);
}

function writeLease(filePath, payload) {
  writeJson(filePath, payload);
}

function tryCreateLease(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'wx');
    fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return { ok: true, lease: payload };
  } catch (error) {
    if (error?.code === 'EEXIST') return { ok: false, reason: 'exists' };
    throw error;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

function leaseOwnedBy(payload, ownerId, runToken = null) {
  if (!payload || String(payload.ownerId || '') !== String(ownerId || '')) return false;
  if (runToken === null || runToken === undefined || runToken === '') return true;
  return String(payload.runToken || '') === String(runToken || '');
}

function acquireLease(filePath, { ownerId, runToken = null, leaseMs, meta = {}, nowMs = Date.now() }) {
  const nextLease = buildLeasePayload({ ownerId, runToken, leaseMs, meta, nowMs });
  const created = tryCreateLease(filePath, nextLease);
  if (created.ok) {
    return { ok: true, acquired: true, renewed: false, lease: created.lease };
  }

  const existing = readLease(filePath);
  if (leaseOwnedBy(existing, ownerId, runToken)) {
    const renewed = {
      ...existing,
      ...nextLease,
      createdAt: existing?.createdAt || nextLease.createdAt,
    };
    writeLease(filePath, renewed);
    return { ok: true, acquired: false, renewed: true, lease: renewed };
  }

  if (!isLeaseExpired(existing, nowMs)) {
    return { ok: false, reason: 'busy', lease: existing };
  }

  safeUnlink(filePath);
  const reclaimed = tryCreateLease(filePath, nextLease);
  if (reclaimed.ok) {
    return { ok: true, acquired: true, renewed: false, lease: reclaimed.lease, reclaimed: true };
  }
  return { ok: false, reason: 'busy', lease: readLease(filePath) };
}

function renewLease(filePath, { ownerId, runToken = null, leaseMs, nowMs = Date.now() }) {
  const existing = readLease(filePath);
  if (!existing) return { ok: false, reason: 'missing' };
  if (!leaseOwnedBy(existing, ownerId, runToken)) return { ok: false, reason: 'owner_mismatch', lease: existing };
  const nextLease = {
    ...existing,
    updatedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + Math.max(1_000, Math.floor(Number(leaseMs) || DEFAULT_TASK_LEASE_MS))).toISOString(),
  };
  writeLease(filePath, nextLease);
  return { ok: true, lease: nextLease };
}

function releaseLease(filePath, { ownerId, runToken = null }) {
  const existing = readLease(filePath);
  if (!existing) return { ok: true, released: false, reason: 'missing' };
  if (!leaseOwnedBy(existing, ownerId, runToken)) return { ok: false, released: false, reason: 'owner_mismatch', lease: existing };
  safeUnlink(filePath);
  return { ok: true, released: true, lease: existing };
}

function listActiveLeases(rootDir, nowMs = Date.now()) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const leases = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const fullPath = path.join(rootDir, entry.name);
    const payload = readLease(fullPath);
    if (!payload || isLeaseExpired(payload, nowMs)) {
      safeUnlink(fullPath);
      continue;
    }
    leases.push({ path: fullPath, lease: payload });
  }
  return leases;
}

function normalizeDimensions(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of input) {
    const value = String(item || '').trim().toLowerCase();
    if (!value) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function normalizeConcurrencyMap(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const name = String(key || '').trim().toLowerCase();
    if (!name) continue;
    const count = Number(value);
    if (Number.isFinite(count) && count > 0) out[name] = Math.floor(count);
  }
  return out;
}

function extractTaskPlatform(task) {
  const commandType = String(task?.commandType || DEFAULT_COMMAND_TYPE).trim();
  const platform = commandType.split('-')[0];
  return String(platform || 'unknown').toLowerCase();
}

function extractTaskIdentity(task) {
  const argv = task?.commandArgv && typeof task.commandArgv === 'object' ? task.commandArgv : {};
  return {
    platform: extractTaskPlatform(task),
    profile: normalizeText(argv.profile),
    account: normalizeText(argv.accountId ?? argv['account-id'] ?? argv.account ?? argv.uid ?? argv.userId ?? argv['user-id']),
  };
}

function buildResourceKeys(task, policy) {
  const mutex = policy?.resourceMutex || {};
  if (mutex.enabled === false) return [];
  const dimensions = normalizeDimensions(mutex.dimensions || DEFAULT_SCHEDULER_POLICY.resourceMutex.dimensions);
  const identity = extractTaskIdentity(task);
  const keys = [];
  for (const dimension of dimensions) {
    if (dimension === 'profile' && identity.profile) {
      keys.push(`profile:${identity.profile}`);
      continue;
    }
    if (dimension === 'account' && identity.account) {
      if (mutex.allowCrossPlatformSameAccount === true && identity.platform) {
        keys.push(`account:${identity.account}:platform:${identity.platform}`);
      } else {
        keys.push(`account:${identity.account}`);
      }
    }
  }
  return [...new Set(keys)].sort();
}

export function normalizeSchedulerPolicy(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};
  const mutexInput = source.resourceMutex && typeof source.resourceMutex === 'object'
    ? source.resourceMutex
    : {};
  const dimensions = normalizeDimensions(mutexInput.dimensions || DEFAULT_SCHEDULER_POLICY.resourceMutex.dimensions);
  const maxConcurrency = normalizePositiveInt(
    source.maxConcurrency ?? source.maxGlobalConcurrency,
    DEFAULT_SCHEDULER_POLICY.maxConcurrency,
  );
  return {
    maxConcurrency,
    maxConcurrencyByPlatform: normalizeConcurrencyMap(source.maxConcurrencyByPlatform),
    resourceMutex: {
      enabled: normalizeBoolean(mutexInput.enabled, DEFAULT_SCHEDULER_POLICY.resourceMutex.enabled),
      dimensions: dimensions.length > 0 ? dimensions : [...DEFAULT_SCHEDULER_POLICY.resourceMutex.dimensions],
      allowCrossPlatformSameAccount: normalizeBoolean(
        mutexInput.allowCrossPlatformSameAccount,
        DEFAULT_SCHEDULER_POLICY.resourceMutex.allowCrossPlatformSameAccount,
      ),
    },
  };
}

export function getSchedulerPolicy() {
  const envRaw = normalizeText(process.env.WEBAUTO_SCHEDULE_POLICY_JSON);
  if (envRaw) {
    try {
      return normalizeSchedulerPolicy(JSON.parse(envRaw));
    } catch {
      return normalizeSchedulerPolicy(DEFAULT_SCHEDULER_POLICY);
    }
  }
  return normalizeSchedulerPolicy(readJson(resolvePolicyPath(), DEFAULT_SCHEDULER_POLICY));
}

export function setSchedulerPolicy(input = {}) {
  const policy = normalizeSchedulerPolicy(input);
  writeJson(resolvePolicyPath(), policy);
  return policy;
}

function checkConcurrencyAllowance(task, policy, nowMs = Date.now()) {
  const active = listActiveLeases(resolveTaskClaimsRoot(), nowMs).map((item) => item.lease);
  const globalLimit = normalizePositiveInt(policy?.maxConcurrency, DEFAULT_SCHEDULER_POLICY.maxConcurrency);
  if (active.length >= globalLimit) {
    return { ok: false, reason: 'max_concurrency', activeCount: active.length, limit: globalLimit };
  }
  const platformLimits = normalizeConcurrencyMap(policy?.maxConcurrencyByPlatform);
  const platform = extractTaskPlatform(task);
  const limit = Number(platformLimits[platform] || 0);
  if (limit > 0) {
    const used = active.filter((lease) => String(lease?.platform || '').trim().toLowerCase() === platform).length;
    if (used >= limit) {
      return {
        ok: false,
        reason: 'platform_max_concurrency',
        platform,
        activeCount: used,
        limit,
      };
    }
  }
  return { ok: true };
}

function loadIndex() {
  const fallback = {
    version: 1,
    nextSeq: 1,
    updatedAt: null,
    tasks: [],
  };
  const raw = readJson(resolveIndexPath(), fallback);
  const tasks = Array.isArray(raw?.tasks) ? raw.tasks.filter((task) => normalizeText(task?.id)) : [];
  const maxSeq = tasks.reduce((acc, task) => Math.max(acc, Number(task?.seq) || 0), 0);
  const nextSeq = Number.isFinite(Number(raw?.nextSeq)) && Number(raw?.nextSeq) > maxSeq
    ? Number(raw.nextSeq)
    : maxSeq + 1;
  return {
    version: 1,
    nextSeq,
    updatedAt: raw?.updatedAt || null,
    tasks,
  };
}

function saveIndex(index) {
  const payload = {
    version: 1,
    nextSeq: Number(index?.nextSeq) || 1,
    updatedAt: nowIso(),
    tasks: Array.isArray(index?.tasks) ? index.tasks : [],
  };
  writeJson(resolveIndexPath(), payload);
  return payload;
}

function formatSeq(seq) {
  return String(seq).padStart(4, '0');
}

function normalizeScheduleType(value) {
  const text = String(value || 'interval').trim().toLowerCase();
  if (text === 'once') return 'once';
  if (text === 'daily') return 'daily';
  if (text === 'weekly') return 'weekly';
  return 'interval';
}

function normalizeCommandArgv(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function validateCommand(task) {
  const commandType = String(task.commandType || DEFAULT_COMMAND_TYPE).trim();
  if (!SUPPORTED_COMMAND_TYPES.includes(commandType)) {
    throw new Error(`unsupported commandType: ${commandType}. Supported: ${SUPPORTED_COMMAND_TYPES.join(', ')}`);
  }
  const argv = task.commandArgv && typeof task.commandArgv === 'object' ? task.commandArgv : {};
  const platform = commandType.split('-')[0];
  if (platform === 'xhs') {
    validateXhsCommand(argv);
  } else if (platform === 'weibo' || platform === '1688') {
    validateGenericCommand(argv, platform, commandType);
  }
}

function validateXhsCommand(argv) {
  const keyword = normalizeText(argv.keyword || argv.k);
  const profile = normalizeText(argv.profile);
  const profiles = normalizeText(argv.profiles);
  const profilepool = normalizeText(argv.profilepool);
  if (!keyword) throw new Error('task command argv missing keyword');
  if (!profile && !profiles && !profilepool) {
    throw new Error('task command argv missing profile/profiles/profilepool');
  }
}

function validateGenericCommand(argv, platform, commandType = '') {
  const keyword = normalizeText(argv.keyword || argv.k);
  const profile = normalizeText(argv.profile);
  const profiles = normalizeText(argv.profiles);
  const profilepool = normalizeText(argv.profilepool);
  let weiboTaskType = '';
  if (platform === 'weibo') {
    weiboTaskType = String(argv['task-type'] || argv.taskType || '').trim();
    if (!weiboTaskType && commandType === 'weibo-timeline') weiboTaskType = 'timeline';
    if (!weiboTaskType && commandType === 'weibo-search') weiboTaskType = 'search';
    if (!weiboTaskType && commandType === 'weibo-monitor') weiboTaskType = 'monitor';
    if (!['timeline', 'search', 'monitor'].includes(weiboTaskType)) {
      throw new Error(`weibo task requires task-type: timeline|search|monitor`);
    }
    const userId = normalizeText(argv['user-id'] || argv.userId);
    if (weiboTaskType === 'monitor' && !userId) {
      throw new Error('weibo monitor task requires user-id');
    }
  }
  if (!keyword && (platform !== 'weibo' || weiboTaskType === 'search')) {
    throw new Error('task command argv missing keyword');
  }
  if (!profile && !profiles && !profilepool) {
    throw new Error('task command argv missing profile/profiles/profilepool');
  }
}

function normalizeScheduleFields(input = {}, fallback = {}) {
  const scheduleType = normalizeScheduleType(
    input.scheduleType
      ?? input.type
      ?? fallback.scheduleType
      ?? fallback.type
      ?? 'interval',
  );
  const intervalMinutes = normalizePositiveInt(
    input.intervalMinutes
      ?? input.everyMinutes
      ?? fallback.intervalMinutes
      ?? fallback.everyMinutes
      ?? DEFAULT_INTERVAL_MINUTES,
    DEFAULT_INTERVAL_MINUTES,
  );
  const runAt = normalizeText(input.runAt ?? input.at ?? fallback.runAt ?? fallback.at);
  if (scheduleType === 'once' || scheduleType === 'daily' || scheduleType === 'weekly') {
    if (!runAt) throw new Error(`schedule runAt is required for ${scheduleType} task`);
    const ts = Date.parse(runAt);
    if (!Number.isFinite(ts)) throw new Error('schedule runAt must be valid ISO datetime');
  }
  return {
    scheduleType,
    intervalMinutes,
    runAt: scheduleType === 'once' || scheduleType === 'daily' || scheduleType === 'weekly'
      ? new Date(runAt).toISOString()
      : null,
  };
}

function nextAnchoredRunAt(anchorIso, periodMs, fromTime = Date.now(), afterRun = false) {
  const anchorTs = Date.parse(String(anchorIso || ''));
  if (!Number.isFinite(anchorTs)) return null;
  if (!Number.isFinite(periodMs) || periodMs <= 0) return null;
  if (!afterRun && anchorTs >= fromTime) return new Date(anchorTs).toISOString();
  const delta = Math.max(0, fromTime - anchorTs);
  let steps = Math.floor(delta / periodMs);
  if (afterRun || anchorTs + (steps * periodMs) <= fromTime) steps += 1;
  const nextTs = anchorTs + (steps * periodMs);
  return new Date(nextTs).toISOString();
}

function nextRunAt(task, fromTime = Date.now(), afterRun = false) {
  const enabled = task.enabled !== false;
  if (!enabled) return null;
  const maxRuns = normalizeMaxRuns(task.maxRuns, null);
  const runCount = Number(task.runCount) || 0;
  if (maxRuns && runCount >= maxRuns) return null;
  if (task.scheduleType === 'once') {
    if (afterRun) return null;
    return task.runAt || null;
  }
  if (task.scheduleType === 'daily') {
    return nextAnchoredRunAt(task.runAt, DAY_MS, fromTime, afterRun);
  }
  if (task.scheduleType === 'weekly') {
    return nextAnchoredRunAt(task.runAt, 7 * DAY_MS, fromTime, afterRun);
  }
  const intervalMinutes = normalizePositiveInt(task.intervalMinutes, DEFAULT_INTERVAL_MINUTES);
  return new Date(fromTime + (intervalMinutes * 60 * 1000)).toISOString();
}

function normalizeTaskRecord(raw = {}) {
  const task = {
    id: normalizeText(raw.id),
    seq: Number(raw.seq) || 0,
    name: normalizeText(raw.name),
    enabled: normalizeBoolean(raw.enabled, true),
    scheduleType: normalizeScheduleType(raw.scheduleType ?? raw.type),
    intervalMinutes: normalizePositiveInt(raw.intervalMinutes ?? raw.everyMinutes, DEFAULT_INTERVAL_MINUTES),
    runAt: normalizeText(raw.runAt ?? raw.at),
    maxRuns: normalizeMaxRuns(raw.maxRuns ?? raw.max_runs ?? raw.maxRunsCount, null),
    nextRunAt: normalizeText(raw.nextRunAt),
    commandType: normalizeText(raw.commandType) || DEFAULT_COMMAND_TYPE,
    commandArgv: normalizeCommandArgv(raw.commandArgv),
    createdAt: normalizeText(raw.createdAt),
    updatedAt: normalizeText(raw.updatedAt),
    lastRunAt: normalizeText(raw.lastRunAt),
    lastStatus: normalizeText(raw.lastStatus),
    lastError: normalizeText(raw.lastError),
    lastRunId: normalizeText(raw.lastRunId),
    lastDurationMs: Number(raw.lastDurationMs) || null,
    runCount: Number(raw.runCount) || 0,
    failCount: Number(raw.failCount) || 0,
  };
  if (!task.id) return null;
  if (!task.name) task.name = task.id;
  if (task.scheduleType === 'once' || task.scheduleType === 'daily' || task.scheduleType === 'weekly') {
    if (!task.runAt) return null;
    const ts = Date.parse(task.runAt);
    if (!Number.isFinite(ts)) return null;
    task.runAt = new Date(task.runAt).toISOString();
  } else {
    task.runAt = null;
  }
  if (task.maxRuns && task.runCount >= task.maxRuns) {
    task.enabled = false;
  }
  return task;
}

function ensureTask(id, index) {
  const task = index.tasks.find((item) => item.id === id) || null;
  if (!task) throw new Error(`task not found: ${id}`);
  return task;
}

function sortedTasks(tasks) {
  return [...tasks].sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
}

function sanitizeTaskForOutput(task) {
  return { ...task, commandArgv: { ...(task.commandArgv || {}) } };
}

export function listScheduleTasks() {
  const index = loadIndex();
  const tasks = sortedTasks(index.tasks.map(normalizeTaskRecord).filter(Boolean));
  return {
    root: resolveSchedulesRoot(),
    count: tasks.length,
    tasks: tasks.map(sanitizeTaskForOutput),
  };
}

export function getScheduleTask(id) {
  const index = loadIndex();
  const target = ensureTask(String(id || '').trim(), index);
  const task = normalizeTaskRecord(target);
  if (!task) throw new Error(`invalid task: ${id}`);
  return sanitizeTaskForOutput(task);
}

export function acquireScheduleDaemonLease(options = {}) {
  const ownerId = normalizeText(options.ownerId) || `daemon-${process.pid}`;
  const leaseMs = normalizePositiveInt(options.leaseMs, DEFAULT_DAEMON_LEASE_MS);
  const payload = acquireLease(resolveDaemonLeasePath(), {
    ownerId,
    leaseMs,
    meta: {
      kind: 'schedule-daemon',
      pid: process.pid,
    },
  });
  if (!payload.ok) {
    return { ok: false, reason: payload.reason, lease: payload.lease };
  }
  return { ok: true, ownerId, leaseMs, lease: payload.lease };
}

export function renewScheduleDaemonLease(options = {}) {
  const ownerId = normalizeText(options.ownerId) || `daemon-${process.pid}`;
  const leaseMs = normalizePositiveInt(options.leaseMs, DEFAULT_DAEMON_LEASE_MS);
  return renewLease(resolveDaemonLeasePath(), { ownerId, leaseMs });
}

export function releaseScheduleDaemonLease(options = {}) {
  const ownerId = normalizeText(options.ownerId) || `daemon-${process.pid}`;
  return releaseLease(resolveDaemonLeasePath(), { ownerId });
}

function releaseResourceClaims(resourceKeys, ownerId, runToken = null) {
  const outcomes = [];
  for (const key of resourceKeys) {
    const lockPath = resolveResourceClaimPath(key);
    outcomes.push({
      resourceKey: key,
      ...releaseLease(lockPath, { ownerId, runToken }),
    });
  }
  return outcomes;
}

export function claimScheduleTask(task, options = {}) {
  const normalizedTask = normalizeTaskRecord(task);
  if (!normalizedTask?.id) throw new Error('claim requires task with id');
  const ownerId = normalizeText(options.ownerId) || `runner-${process.pid}`;
  const runToken = normalizeText(options.runToken) || `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const leaseMs = normalizePositiveInt(options.leaseMs, DEFAULT_TASK_LEASE_MS);
  const policy = normalizeSchedulerPolicy(options.policy || getSchedulerPolicy());
  const mutex = acquireLease(resolveClaimMutexPath(), {
    ownerId,
    runToken,
    leaseMs: Math.min(leaseMs, 5_000),
    meta: {
      kind: 'schedule-claim-mutex',
      pid: process.pid,
    },
  });
  if (!mutex.ok) {
    return { ok: false, claimed: false, reason: 'claim_mutex_busy', lease: mutex.lease };
  }
  try {
    const concurrency = checkConcurrencyAllowance(normalizedTask, policy, Date.now());
    if (!concurrency.ok) {
      return { ok: false, claimed: false, reason: concurrency.reason, details: concurrency };
    }
    const platform = extractTaskPlatform(normalizedTask);
    const resourceKeys = buildResourceKeys(normalizedTask, policy);
    const taskLock = acquireLease(resolveTaskClaimPath(normalizedTask.id), {
      ownerId,
      runToken,
      leaseMs,
      meta: {
        kind: 'schedule-task',
        taskId: normalizedTask.id,
        platform,
        resourceKeys,
        pid: process.pid,
      },
    });
    if (!taskLock.ok) {
      return { ok: false, claimed: false, reason: 'task_busy', lease: taskLock.lease };
    }
    const claimedResourceKeys = [];
    for (const resourceKey of resourceKeys) {
      const resourceLock = acquireLease(resolveResourceClaimPath(resourceKey), {
        ownerId,
        runToken,
        leaseMs,
        meta: {
          kind: 'schedule-resource',
          taskId: normalizedTask.id,
          resourceKey,
          platform,
          pid: process.pid,
        },
      });
      if (!resourceLock.ok) {
        releaseResourceClaims(claimedResourceKeys, ownerId, runToken);
        releaseLease(resolveTaskClaimPath(normalizedTask.id), { ownerId, runToken });
        return {
          ok: false,
          claimed: false,
          reason: 'resource_busy',
          resourceKey,
          lease: resourceLock.lease,
        };
      }
      claimedResourceKeys.push(resourceKey);
    }
    return {
      ok: true,
      claimed: true,
      taskId: normalizedTask.id,
      ownerId,
      runToken,
      leaseMs,
      platform,
      resourceKeys: claimedResourceKeys,
      policy,
    };
  } finally {
    releaseLease(resolveClaimMutexPath(), { ownerId, runToken });
  }
}

export function renewScheduleTaskClaim(taskId, options = {}) {
  const id = String(taskId || '').trim();
  if (!id) throw new Error('task id is required');
  const ownerId = normalizeText(options.ownerId) || `runner-${process.pid}`;
  const runToken = normalizeText(options.runToken) || null;
  const leaseMs = normalizePositiveInt(options.leaseMs, DEFAULT_TASK_LEASE_MS);
  const taskPath = resolveTaskClaimPath(id);
  const head = renewLease(taskPath, { ownerId, runToken, leaseMs });
  if (!head.ok) return head;
  const claim = readLease(taskPath);
  const resourceKeys = Array.isArray(claim?.resourceKeys) ? claim.resourceKeys : [];
  for (const key of resourceKeys) {
    const ret = renewLease(resolveResourceClaimPath(key), { ownerId, runToken, leaseMs });
    if (!ret.ok) {
      return {
        ok: false,
        reason: 'resource_renew_failed',
        resourceKey: key,
      };
    }
  }
  return { ok: true, taskId: id, lease: readLease(taskPath) };
}

export function releaseScheduleTaskClaim(taskId, options = {}) {
  const id = String(taskId || '').trim();
  if (!id) throw new Error('task id is required');
  const ownerId = normalizeText(options.ownerId) || `runner-${process.pid}`;
  const runToken = normalizeText(options.runToken) || null;
  const taskPath = resolveTaskClaimPath(id);
  const claim = readLease(taskPath);
  const resourceKeys = Array.isArray(claim?.resourceKeys) ? claim.resourceKeys : [];
  const resources = releaseResourceClaims(resourceKeys, ownerId, runToken);
  const taskLock = releaseLease(taskPath, { ownerId, runToken });
  return {
    ok: taskLock.ok,
    taskId: id,
    taskLock,
    resources,
  };
}

export function addScheduleTask(input = {}) {
  const index = loadIndex();
  const seq = Number(index.nextSeq) || 1;
  const id = normalizeText(input.id) || `sched-${formatSeq(seq)}`;
  if (index.tasks.some((item) => item.id === id)) {
    throw new Error(`task id already exists: ${id}`);
  }

  const schedule = normalizeScheduleFields(input);
  const commandType = normalizeText(input.commandType) || DEFAULT_COMMAND_TYPE;
  const commandArgv = normalizeCommandArgv(input.commandArgv);
  const enabled = normalizeBoolean(input.enabled, true);
  const maxRuns = normalizeMaxRuns(input.maxRuns, null);
  const now = nowIso();
  const task = {
    id,
    seq,
    name: normalizeText(input.name) || id,
    enabled,
    scheduleType: schedule.scheduleType,
    intervalMinutes: schedule.intervalMinutes,
    runAt: schedule.runAt,
    maxRuns,
    nextRunAt: nextRunAt({
      enabled,
      scheduleType: schedule.scheduleType,
      intervalMinutes: schedule.intervalMinutes,
      runAt: schedule.runAt,
      maxRuns,
      runCount: 0,
    }),
    commandType,
    commandArgv,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    lastRunId: null,
    lastDurationMs: null,
    runCount: 0,
    failCount: 0,
  };

  validateCommand(task);

  index.tasks.push(task);
  index.nextSeq = seq + 1;
  saveIndex(index);
  return sanitizeTaskForOutput(task);
}

export function updateScheduleTask(id, patch = {}) {
  const index = loadIndex();
  const target = ensureTask(String(id || '').trim(), index);
  const before = normalizeTaskRecord(target);
  if (!before) throw new Error(`invalid task: ${id}`);

  const schedule = normalizeScheduleFields({
    scheduleType: patch.scheduleType ?? patch.type ?? before.scheduleType,
    intervalMinutes: patch.intervalMinutes ?? patch.everyMinutes ?? before.intervalMinutes,
    runAt: patch.runAt ?? patch.at ?? before.runAt,
  });

  const enabled = patch.enabled === undefined ? before.enabled : normalizeBoolean(patch.enabled, before.enabled);
  const commandType = patch.commandType === undefined ? before.commandType : (normalizeText(patch.commandType) || before.commandType);
  const commandArgv = patch.commandArgv === undefined ? before.commandArgv : normalizeCommandArgv(patch.commandArgv);
  const maxRuns = patch.maxRuns === undefined ? before.maxRuns : normalizeMaxRuns(patch.maxRuns, before.maxRuns);

  const task = {
    ...before,
    name: patch.name === undefined ? before.name : (normalizeText(patch.name) || before.name),
    enabled,
    scheduleType: schedule.scheduleType,
    intervalMinutes: schedule.intervalMinutes,
    runAt: schedule.runAt,
    maxRuns,
    commandType,
    commandArgv,
    updatedAt: nowIso(),
  };
  task.nextRunAt = nextRunAt(task, Date.now(), false);
  if (task.maxRuns && task.runCount >= task.maxRuns) {
    task.enabled = false;
    task.nextRunAt = null;
  }

  validateCommand(task);

  const idx = index.tasks.findIndex((item) => item.id === before.id);
  if (idx < 0) throw new Error(`task not found: ${id}`);
  index.tasks[idx] = task;
  saveIndex(index);
  return sanitizeTaskForOutput(task);
}

export function removeScheduleTask(id) {
  const index = loadIndex();
  const value = String(id || '').trim();
  if (!value) throw new Error('task id is required');
  const idx = index.tasks.findIndex((item) => item.id === value);
  if (idx < 0) throw new Error(`task not found: ${value}`);
  const [removed] = index.tasks.splice(idx, 1);
  saveIndex(index);
  return sanitizeTaskForOutput(removed);
}

export function listDueScheduleTasks(limit = 20, nowMs = Date.now()) {
  const index = loadIndex();
  const tasks = index.tasks
    .map(normalizeTaskRecord)
    .filter(Boolean)
    .filter((task) => task.enabled === true && normalizeText(task.nextRunAt))
    .filter((task) => {
      const ts = Date.parse(String(task.nextRunAt || ''));
      return Number.isFinite(ts) && ts <= nowMs;
    })
    .sort((a, b) => Date.parse(String(a.nextRunAt || '')) - Date.parse(String(b.nextRunAt || '')));
  const sliced = Number.isFinite(Number(limit)) ? tasks.slice(0, Math.max(1, Number(limit))) : tasks;
  return sliced.map(sanitizeTaskForOutput);
}

export function markScheduleTaskResult(id, result = {}) {
  const index = loadIndex();
  const target = ensureTask(String(id || '').trim(), index);
  const task = normalizeTaskRecord(target);
  if (!task) throw new Error(`invalid task: ${id}`);

  const status = String(result.status || 'failed').trim().toLowerCase() === 'success' ? 'success' : 'failed';
  const finishedAt = normalizeText(result.finishedAt) || nowIso();
  task.lastRunAt = finishedAt;
  task.lastStatus = status;
  task.lastError = status === 'failed' ? (normalizeText(result.error) || 'unknown_error') : null;
  task.lastRunId = normalizeText(result.runId);
  task.lastDurationMs = Number.isFinite(Number(result.durationMs)) ? Number(result.durationMs) : null;
  task.runCount = (Number(task.runCount) || 0) + 1;
  if (status !== 'success') task.failCount = (Number(task.failCount) || 0) + 1;

  const fromMs = Number.isFinite(Date.parse(finishedAt)) ? Date.parse(finishedAt) : Date.now();
  task.nextRunAt = nextRunAt(task, fromMs, true);
  if (task.scheduleType === 'once') {
    task.enabled = false;
  }
  if (task.maxRuns && task.runCount >= task.maxRuns) {
    task.enabled = false;
    task.nextRunAt = null;
  }
  task.updatedAt = nowIso();

  const idx = index.tasks.findIndex((item) => item.id === task.id);
  if (idx < 0) throw new Error(`task not found: ${id}`);
  index.tasks[idx] = task;
  saveIndex(index);
  return sanitizeTaskForOutput(task);
}

function normalizeImportedTask(raw = {}, fallbackSeq = 1) {
  const schedule = normalizeScheduleFields(raw, raw);
  const now = nowIso();
  const task = {
    id: normalizeText(raw.id) || null,
    seq: Number(raw.seq) || fallbackSeq,
    name: normalizeText(raw.name) || null,
    enabled: normalizeBoolean(raw.enabled, true),
    scheduleType: schedule.scheduleType,
    intervalMinutes: schedule.intervalMinutes,
    runAt: schedule.runAt,
    maxRuns: normalizeMaxRuns(raw.maxRuns ?? raw.max_runs ?? raw.maxRunsCount, null),
    nextRunAt: normalizeText(raw.nextRunAt),
    commandType: normalizeText(raw.commandType) || DEFAULT_COMMAND_TYPE,
    commandArgv: normalizeCommandArgv(raw.commandArgv ?? raw.argv),
    createdAt: normalizeText(raw.createdAt) || now,
    updatedAt: now,
    lastRunAt: normalizeText(raw.lastRunAt),
    lastStatus: normalizeText(raw.lastStatus),
    lastError: normalizeText(raw.lastError),
    lastRunId: normalizeText(raw.lastRunId),
    lastDurationMs: Number.isFinite(Number(raw.lastDurationMs)) ? Number(raw.lastDurationMs) : null,
    runCount: Number(raw.runCount) || 0,
    failCount: Number(raw.failCount) || 0,
  };
  task.name = task.name || task.id || `sched-${formatSeq(task.seq)}`;
  if (!task.nextRunAt) task.nextRunAt = nextRunAt(task);
  validateCommand(task);
  return task;
}

export function importScheduleTasks(payload, options = {}) {
  const mode = String(options.mode || 'merge').trim().toLowerCase();
  const replace = mode === 'replace';
  const incomingRaw = Array.isArray(payload?.tasks)
    ? payload.tasks
    : Array.isArray(payload)
      ? payload
      : (payload && typeof payload === 'object')
        ? [payload]
        : [];
  if (incomingRaw.length === 0) throw new Error('import payload has no tasks');

  const index = loadIndex();
  if (replace) index.tasks = [];

  const upserted = [];
  for (let i = 0; i < incomingRaw.length; i += 1) {
    const normalized = normalizeImportedTask(incomingRaw[i], (Number(index.nextSeq) || 1) + i);
    const existingIdx = normalized.id
      ? index.tasks.findIndex((item) => item.id === normalized.id)
      : -1;
    if (existingIdx >= 0) {
      const existing = normalizeTaskRecord(index.tasks[existingIdx]);
      if (!existing) continue;
      const merged = {
        ...existing,
        ...normalized,
        id: existing.id,
        seq: existing.seq,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      };
      index.tasks[existingIdx] = merged;
      upserted.push(sanitizeTaskForOutput(merged));
      continue;
    }
    const seq = Number(index.nextSeq) || 1;
    const id = normalized.id || `sched-${formatSeq(seq)}`;
    const task = {
      ...normalized,
      id,
      seq,
      name: normalized.name || id,
      createdAt: normalized.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    if (!task.nextRunAt) task.nextRunAt = nextRunAt(task);
    index.tasks.push(task);
    index.nextSeq = seq + 1;
    upserted.push(sanitizeTaskForOutput(task));
  }

  saveIndex(index);
  return {
    mode: replace ? 'replace' : 'merge',
    count: upserted.length,
    tasks: upserted,
  };
}

export function exportScheduleTasks(id = null) {
  const list = listScheduleTasks();
  if (id) {
    const task = list.tasks.find((item) => item.id === String(id || '').trim());
    if (!task) throw new Error(`task not found: ${id}`);
    return {
      version: 1,
      exportedAt: nowIso(),
      count: 1,
      tasks: [task],
    };
  }
  return {
    version: 1,
    exportedAt: nowIso(),
    count: list.tasks.length,
    tasks: list.tasks,
  };
}
