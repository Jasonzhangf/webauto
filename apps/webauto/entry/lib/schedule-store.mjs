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
    validateGenericCommand(argv, platform);
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

function validateGenericCommand(argv, platform) {
  const keyword = normalizeText(argv.keyword || argv.k);
  const profile = normalizeText(argv.profile);
  const profiles = normalizeText(argv.profiles);
  const profilepool = normalizeText(argv.profilepool);
  if (platform === 'weibo') {
    const taskType = String(argv['task-type'] || argv.taskType || '').trim();
    if (!['timeline', 'search', 'monitor'].includes(taskType)) {
      throw new Error(`weibo task requires task-type: timeline|search|monitor`);
    }
    if (taskType === 'monitor' && !argv['user-id'] && !argv.userId) {
      throw new Error('weibo monitor task requires user-id');
    }
  }
  if (!keyword && (platform !== 'weibo' || argv['task-type'] === 'search')) {
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
