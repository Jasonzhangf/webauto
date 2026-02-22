#!/usr/bin/env node
import minimist from 'minimist';
import fs from 'node:fs';
import {
  acquireScheduleDaemonLease,
  addScheduleTask,
  claimScheduleTask,
  exportScheduleTasks,
  getScheduleTask,
  getSchedulerPolicy,
  importScheduleTasks,
  listDueScheduleTasks,
  listScheduleTasks,
  markScheduleTaskResult,
  normalizeSchedulerPolicy,
  releaseScheduleDaemonLease,
  releaseScheduleTaskClaim,
  removeScheduleTask,
  renewScheduleDaemonLease,
  renewScheduleTaskClaim,
  setSchedulerPolicy,
  resolveSchedulesRoot,
  updateScheduleTask,
} from './lib/schedule-store.mjs';
import { listAccountProfiles } from './lib/account-store.mjs';

let xhsRunnerPromise = null;
let weiboRunnerPromise = null;

async function getXhsRunner() {
  if (!xhsRunnerPromise) {
    xhsRunnerPromise = import('./xhs-unified.mjs').then((mod) => mod.runUnified);
  }
  return xhsRunnerPromise;
}

async function getWeiboRunner() {
  if (!weiboRunnerPromise) {
    weiboRunnerPromise = import('./weibo-unified.mjs').then((mod) => mod.runWeiboUnified);
  }
  return weiboRunnerPromise;
}

function output(payload, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return fallback;
  if (text === '1' || text === 'true' || text === 'yes') return true;
  if (text === '0' || text === 'false' || text === 'no') return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.floor(num));
}

function parseJson(text, fallback = {}) {
  if (text === undefined || text === null || text === '') return fallback;
  const raw = String(text);
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function normalizePlatformByCommandType(commandType) {
  const value = String(commandType || '').trim().toLowerCase();
  if (value.startsWith('weibo')) return 'weibo';
  if (value.startsWith('1688')) return '1688';
  return 'xiaohongshu';
}

function hasProfileArg(argv = {}) {
  return Boolean(
    String(argv?.profile || '').trim()
    || String(argv?.profiles || '').trim()
    || String(argv?.profilepool || '').trim(),
  );
}

function pickAutoProfile(platform) {
  const rows = listAccountProfiles({ platform }).profiles || [];
  const validRows = rows
    .filter((row) => row?.valid === true && String(row?.accountId || '').trim())
    .sort((a, b) => {
      const ta = Date.parse(String(a?.updatedAt || '')) || 0;
      const tb = Date.parse(String(b?.updatedAt || '')) || 0;
      if (tb !== ta) return tb - ta;
      return String(a?.profileId || '').localeCompare(String(b?.profileId || ''));
    });
  return String(validRows[0]?.profileId || '').trim();
}

function ensureProfileArgForTask(commandType, commandArgv = {}) {
  const argv = commandArgv && typeof commandArgv === 'object' ? { ...commandArgv } : {};
  if (hasProfileArg(argv)) return argv;
  const platform = normalizePlatformByCommandType(commandType);
  const profile = pickAutoProfile(platform);
  if (!profile) {
    throw new Error(`missing profile/profiles/profilepool and no valid account for platform=${platform}`);
  }
  argv.profile = profile;
  return argv;
}

function safeReadJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseJson(raw, {});
}

function safeWriteJsonFile(filePath, payload) {
  fs.mkdirSync(requirePathDir(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function requirePathDir(filePath) {
  const path = String(filePath || '').trim();
  if (!path) throw new Error('file path is required');
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx > 0 ? path.slice(0, idx) : '.';
}

function pickArgvValue(argv, key) {
  if (Object.prototype.hasOwnProperty.call(argv, key)) return argv[key];
  return undefined;
}

function buildCommandArgv(argv) {
  const payload = parseJson(argv['argv-json'], {});
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('--argv-json must be object JSON');
  }
  const out = { ...payload };
  const keys = [
    'profile',
    'profiles',
    'profilepool',
    'keyword',
    'k',
    'max-notes',
    'target',
    'total-notes',
    'total-target',
    'parallel',
    'concurrency',
    'plan-only',
    'tab-count',
    'throttle',
    'note-interval',
    'env',
    'output-root',
    'dry-run',
    'do-comments',
    'persist-comments',
    'do-likes',
    'like-keywords',
    'max-likes',
    'match-mode',
    'match-min-hits',
    'match-keywords',
    'do-reply',
    'reply-text',
    'do-ocr',
    'ocr-command',
    'input-mode',
    'headless',
    'task-type',
    'taskType',
    'user-id',
    'userId',
  ];
  for (const key of keys) {
    const value = pickArgvValue(argv, key);
    if (value !== undefined) out[key] = value;
  }
  if (argv['no-dry-run'] === true) out['dry-run'] = false;
  return out;
}

function parseTaskInput(argv, mode = 'add') {
  const scheduleType = String(argv['schedule-type'] || argv.type || (mode === 'add' ? 'interval' : '')).trim();
  const intervalMinutes = argv['interval-minutes'] ?? argv['every-minutes'];
  const runAt = argv['run-at'] ?? argv.at;
  const maxRuns = argv['max-runs'] ?? argv.maxRuns;
  const enabled = argv.enabled;
  const commandType = String(argv['command-type'] || 'xhs-unified').trim();
  const commandArgv = buildCommandArgv(argv);
  if (commandType.startsWith('weibo-')) {
    const explicitTaskType = String(commandArgv['task-type'] || commandArgv.taskType || '').trim();
    if (!explicitTaskType) {
      if (commandType === 'weibo-search') commandArgv['task-type'] = 'search';
      else if (commandType === 'weibo-monitor') commandArgv['task-type'] = 'monitor';
      else commandArgv['task-type'] = 'timeline';
    }
  }
  const patch = {
    name: argv.name,
    scheduleType: scheduleType || undefined,
    intervalMinutes,
    runAt,
    maxRuns,
    enabled: enabled === undefined ? undefined : parseBoolean(enabled, true),
    commandType,
    commandArgv,
  };
  return patch;
}

function createOwnerId(prefix = 'schedule') {
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function parseLeaseMs(value, fallbackMs) {
  if (value === undefined || value === null || value === '') return fallbackMs;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackMs;
  return Math.max(1_000, Math.floor(seconds * 1000));
}

function mergePolicy(base, override) {
  const left = base && typeof base === 'object' ? base : {};
  const right = override && typeof override === 'object' ? override : {};
  return {
    ...left,
    ...right,
    maxConcurrencyByPlatform: {
      ...(left.maxConcurrencyByPlatform || {}),
      ...(right.maxConcurrencyByPlatform || {}),
    },
    resourceMutex: {
      ...(left.resourceMutex || {}),
      ...(right.resourceMutex || {}),
    },
  };
}

function resolveRuntimePolicy(argv = {}) {
  const basePolicy = getSchedulerPolicy();
  const policyOverride = argv['policy-json'] !== undefined
    ? parseJson(argv['policy-json'], {})
    : {};
  const merged = mergePolicy(basePolicy, policyOverride);
  const concurrencyOverride = parsePositiveInt(argv['max-concurrency'] ?? argv.concurrency, Number(merged.maxConcurrency || 1));
  merged.maxConcurrency = concurrencyOverride;
  return normalizeSchedulerPolicy(merged);
}

async function withConsoleSilenced(enabled, fn) {
  if (!enabled) return fn();
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.info = originalInfo;
    console.error = originalError;
  }
}

async function executeTask(task, options = {}) {
  const ownerId = String(options.ownerId || '').trim() || createOwnerId('runner');
  const runToken = createOwnerId('claim');
  const taskLeaseMs = parseLeaseMs(options.taskLeaseSec, 30 * 60 * 1000);
  const policy = options.policy && typeof options.policy === 'object'
    ? options.policy
    : resolveRuntimePolicy({});
  const claim = claimScheduleTask(task, {
    ownerId,
    runToken,
    leaseMs: taskLeaseMs,
    policy,
  });
  if (!claim.ok) {
    return {
      ok: false,
      skipped: true,
      taskId: task?.id || null,
      name: task?.name || null,
      reason: claim.reason || 'claim_failed',
      details: claim.details || null,
    };
  }

  const heartbeatMs = Math.max(5_000, Math.floor(taskLeaseMs / 3));
  const heartbeat = setInterval(() => {
    renewScheduleTaskClaim(task.id, { ownerId, runToken, leaseMs: taskLeaseMs });
  }, heartbeatMs);
  heartbeat.unref?.();
  const startedAt = Date.now();
  const quietExecutors = options.quietExecutors === true;
  try {
    const commandType = String(task?.commandType || 'xhs-unified').trim();
    const commandArgv = ensureProfileArgForTask(commandType, task?.commandArgv || {});
    const result = await withConsoleSilenced(quietExecutors, async () => {
      if (commandType === 'xhs-unified') {
        const runUnified = await getXhsRunner();
        return runUnified(commandArgv);
      }
      if (commandType.startsWith('weibo-')) {
        const runWeiboUnified = await getWeiboRunner();
        return runWeiboUnified(commandArgv);
      }
      if (commandType === '1688-search') {
        throw new Error(`executor_not_implemented: ${commandType}`);
      }
      throw new Error(`unsupported commandType at executeTask: ${commandType}`);
    });
    const durationMs = Date.now() - startedAt;
    const runResult = markScheduleTaskResult(task.id, {
      status: 'success',
      durationMs,
      runId: result?.runId || null,
      finishedAt: new Date().toISOString(),
    });
    return {
      ok: true,
      skipped: false,
      taskId: task.id,
      name: task.name,
      durationMs,
      runResult,
      result: {
        summaryPath: result?.summaryPath || null,
        planOnly: result?.planOnly === true,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error?.message || String(error);
    const runResult = markScheduleTaskResult(task.id, {
      status: 'failed',
      error: message,
      durationMs,
      finishedAt: new Date().toISOString(),
    });
    return {
      ok: false,
      skipped: false,
      taskId: task.id,
      name: task.name,
      durationMs,
      error: message,
      runResult,
    };
  } finally {
    clearInterval(heartbeat);
    releaseScheduleTaskClaim(task.id, { ownerId, runToken });
  }
}

async function runDue(limit, options = {}) {
  const dueTasks = listDueScheduleTasks(limit);
  const maxConcurrency = Math.max(1, Math.min(
    Number(options?.policy?.maxConcurrency) || 1,
    dueTasks.length || 1,
  ));
  const queue = [...dueTasks];
  const results = [];
  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      const item = await executeTask(task, options);
      results.push(item);
    }
  }
  await Promise.all(Array.from({ length: maxConcurrency }, () => worker()));
  return {
    count: dueTasks.length,
    success: results.filter((item) => item.ok).length,
    skipped: results.filter((item) => item.skipped === true).length,
    failed: results.filter((item) => !item.ok && item.skipped !== true).length,
    results,
  };
}

function printHelp() {
  console.log(`webauto schedule

Usage:
  webauto schedule --help
  webauto schedule list [--json]
  webauto schedule get <taskId> [--json]
  webauto schedule add [options]
  webauto schedule update <taskId> [options]
  webauto schedule delete <taskId> [--json]
  webauto schedule import [--file <path> | --payload-json <json>] [--mode merge|replace] [--json]
  webauto schedule export [taskId] [--file <path>] [--json]
  webauto schedule policy [--json]
  webauto schedule policy set [--file <path> | --payload-json <json>] [--json]
  webauto schedule run <taskId> [--json]
  webauto schedule run-due [--limit <n>] [--json]
  webauto schedule daemon [--interval-sec <n>] [--limit <n>] [--once] [--json]

Task Options:
  --name <text>
  --enabled <true|false>
  --schedule-type interval|once|daily|weekly
  --interval-minutes <n>     interval 模式每次触发间隔分钟
  --run-at <iso>             once/daily/weekly 模式锚点时间（ISO）
  --max-runs <n>             最大执行次数（>0；为空=不限）
  --command-type xhs-unified|weibo-timeline|weibo-search|weibo-monitor|1688-search
  --argv-json <json>         透传给任务执行器的参数对象
  --max-concurrency <n>      调度并发上限（默认来自 policy）
  --task-lease-sec <n>       单任务 claim lease 秒数（默认 1800）
  --daemon-lease-sec <n>     daemon lease 秒数（默认 120）
  --policy-json <json>       运行时策略覆盖（不落盘）

Common xhs argv shortcuts (optional):
  --profile <id> --profiles <a,b> --profilepool <prefix>
  --keyword <kw> --max-notes <n> --env <debug|prod>
  --do-comments <bool> --do-likes <bool> --like-keywords <csv>
  --dry-run <bool> --no-dry-run

Common weibo argv shortcuts (optional):
  --task-type <timeline|search|monitor>
  --user-id <id>             monitor 任务必填
`);
}

async function cmdList(argv, jsonMode) {
  const result = listScheduleTasks();
  output({ ok: true, ...result }, jsonMode);
}

async function cmdGet(taskId, jsonMode) {
  const task = getScheduleTask(taskId);
  output({ ok: true, task }, jsonMode);
}

async function cmdAdd(argv, jsonMode) {
  const input = parseTaskInput(argv, 'add');
  const task = addScheduleTask(input);
  output({ ok: true, task }, jsonMode);
}

async function cmdUpdate(taskId, argv, jsonMode) {
  const patch = parseTaskInput(argv, 'update');
  const task = updateScheduleTask(taskId, patch);
  output({ ok: true, task }, jsonMode);
}

async function cmdDelete(taskId, jsonMode) {
  const removed = removeScheduleTask(taskId);
  output({ ok: true, removed }, jsonMode);
}

async function cmdImport(argv, jsonMode) {
  const mode = String(argv.mode || 'merge').trim().toLowerCase();
  const payloadText = argv['payload-json'];
  const filePath = argv.file;
  if (!payloadText && !filePath) {
    throw new Error('import requires --file or --payload-json');
  }
  const payload = payloadText ? parseJson(payloadText, {}) : safeReadJsonFile(String(filePath || ''));
  const result = importScheduleTasks(payload, { mode });
  output({ ok: true, ...result }, jsonMode);
}

async function cmdExport(taskId, argv, jsonMode) {
  const payload = exportScheduleTasks(taskId || null);
  const filePath = String(argv.file || '').trim();
  if (filePath) {
    safeWriteJsonFile(filePath, payload);
    output({ ok: true, filePath, count: payload.count }, jsonMode);
    return;
  }
  output({ ok: true, ...payload }, jsonMode);
}

async function cmdPolicy(arg1, argv, jsonMode) {
  const action = String(arg1 || '').trim().toLowerCase();
  if (!action || action === 'get' || action === 'show') {
    output({ ok: true, policy: getSchedulerPolicy() }, jsonMode);
    return;
  }
  if (action === 'set') {
    const payloadText = argv['payload-json'];
    const filePath = argv.file;
    if (!payloadText && !filePath) {
      throw new Error('policy set requires --file or --payload-json');
    }
    const payload = payloadText ? parseJson(payloadText, {}) : safeReadJsonFile(String(filePath || ''));
    const policy = setSchedulerPolicy(payload);
    output({ ok: true, policy }, jsonMode);
    return;
  }
  throw new Error(`unknown policy command: ${action}`);
}

async function cmdRun(taskId, argv, jsonMode) {
  const task = getScheduleTask(taskId);
  const policy = resolveRuntimePolicy(argv);
  const result = await executeTask(task, {
    quietExecutors: jsonMode,
    ownerId: createOwnerId('run'),
    taskLeaseSec: argv['task-lease-sec'],
    policy,
  });
  output({ ok: result.ok, result }, jsonMode);
  if (!result.ok || result.skipped) process.exitCode = 1;
}

async function cmdRunDue(argv, jsonMode) {
  const limit = parsePositiveInt(argv.limit, 20);
  const policy = resolveRuntimePolicy(argv);
  const result = await runDue(limit, {
    quietExecutors: jsonMode,
    ownerId: createOwnerId('run-due'),
    taskLeaseSec: argv['task-lease-sec'],
    policy,
  });
  const ok = result.failed === 0;
  output({ ok, ...result }, jsonMode);
  if (!ok) process.exitCode = 1;
}

async function cmdDaemon(argv, jsonMode) {
  const intervalSec = parsePositiveInt(argv['interval-sec'], 30);
  const limit = parsePositiveInt(argv.limit, 20);
  const runOnce = argv.once === true;
  if (runOnce) {
    const policy = resolveRuntimePolicy(argv);
    const onceResult = await runDue(limit, {
      quietExecutors: jsonMode,
      ownerId: createOwnerId('daemon-once'),
      taskLeaseSec: argv['task-lease-sec'],
      policy,
    });
    const ok = onceResult.failed === 0;
    output({ ok, mode: 'once', intervalSec, ...onceResult }, jsonMode);
    if (!ok) process.exitCode = 1;
    return;
  }
  const ownerId = createOwnerId('daemon');
  const daemonLeaseMs = parseLeaseMs(argv['daemon-lease-sec'], 2 * 60 * 1000);
  const daemonLease = acquireScheduleDaemonLease({
    ownerId,
    leaseMs: daemonLeaseMs,
  });
  if (!daemonLease.ok) {
    output({
      ok: false,
      mode: 'daemon',
      error: 'daemon_lease_busy',
      lease: daemonLease.lease || null,
    }, jsonMode);
    process.exitCode = 1;
    return;
  }
  const policy = resolveRuntimePolicy(argv);
  output({
    ok: true,
    mode: 'daemon',
    root: resolveSchedulesRoot(),
    intervalSec,
    limit,
    ownerId,
    policy,
    startedAt: new Date().toISOString(),
  }, jsonMode);
  const leaseHeartbeatMs = Math.max(5_000, Math.floor(daemonLeaseMs / 3));
  const leaseHeartbeat = setInterval(() => {
    renewScheduleDaemonLease({ ownerId, leaseMs: daemonLeaseMs });
  }, leaseHeartbeatMs);
  leaseHeartbeat.unref?.();
  const tick = async () => {
    const result = await runDue(limit, {
      quietExecutors: jsonMode,
      ownerId,
      taskLeaseSec: argv['task-lease-sec'],
      policy,
    });
    const line = {
      ts: new Date().toISOString(),
      event: 'schedule.tick',
      intervalSec,
      limit,
      dueCount: result.count,
      success: result.success,
      skipped: result.skipped,
      failed: result.failed,
      taskIds: result.results.map((item) => item.taskId),
    };
    console.log(JSON.stringify(line));
  };
  await tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalSec * 1000);
  const shutdown = () => {
    clearInterval(timer);
    clearInterval(leaseHeartbeat);
    releaseScheduleDaemonLease({ ownerId });
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'schedule.stopped',
    }));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'json', 'once'],
    alias: { h: 'help' },
  });
  const cmd = String(argv._[0] || '').trim();
  const arg1 = String(argv._[1] || '').trim();
  const jsonMode = argv.json === true;

  if (!cmd || cmd === 'help' || argv.help) {
    printHelp();
    return;
  }

  if (cmd === 'list') return cmdList(argv, jsonMode);
  if (cmd === 'get') return cmdGet(arg1, jsonMode);
  if (cmd === 'add') return cmdAdd(argv, jsonMode);
  if (cmd === 'update') return cmdUpdate(arg1, argv, jsonMode);
  if (cmd === 'delete' || cmd === 'remove' || cmd === 'rm') return cmdDelete(arg1, jsonMode);
  if (cmd === 'import') return cmdImport(argv, jsonMode);
  if (cmd === 'export') return cmdExport(arg1, argv, jsonMode);
  if (cmd === 'policy') return cmdPolicy(arg1, argv, jsonMode);
  if (cmd === 'run') return cmdRun(arg1, argv, jsonMode);
  if (cmd === 'run-due') return cmdRunDue(argv, jsonMode);
  if (cmd === 'daemon') return cmdDaemon(argv, jsonMode);

  throw new Error(`unknown schedule command: ${cmd}`);
}

main().catch((error) => {
  const message = error?.message || String(error);
  console.error(message);
  process.exit(1);
});
