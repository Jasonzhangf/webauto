#!/usr/bin/env node
import minimist from 'minimist';
import fs from 'node:fs';
import {
  addScheduleTask,
  exportScheduleTasks,
  getScheduleTask,
  importScheduleTasks,
  listDueScheduleTasks,
  listScheduleTasks,
  markScheduleTaskResult,
  removeScheduleTask,
  resolveSchedulesRoot,
  updateScheduleTask,
} from './lib/schedule-store.mjs';
import { runUnified } from './xhs-unified.mjs';

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
  return JSON.parse(String(text));
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

async function executeTask(task) {
  const startedAt = Date.now();
  try {
    const result = await runUnified(task.commandArgv || {});
    const durationMs = Date.now() - startedAt;
    const runResult = markScheduleTaskResult(task.id, {
      status: 'success',
      durationMs,
      runId: result?.runId || null,
      finishedAt: new Date().toISOString(),
    });
    return {
      ok: true,
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
      taskId: task.id,
      name: task.name,
      durationMs,
      error: message,
      runResult,
    };
  }
}

async function runDue(limit) {
  const dueTasks = listDueScheduleTasks(limit);
  const results = [];
  for (const task of dueTasks) {
    const item = await executeTask(task);
    results.push(item);
  }
  return {
    count: dueTasks.length,
    success: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
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
  --command-type xhs-unified
  --argv-json <json>         透传给 xhs-unified 的参数对象

Common xhs argv shortcuts (optional):
  --profile <id> --profiles <a,b> --profilepool <prefix>
  --keyword <kw> --max-notes <n> --env <debug|prod>
  --do-comments <bool> --do-likes <bool> --like-keywords <csv>
  --dry-run <bool> --no-dry-run
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

async function cmdRun(taskId, jsonMode) {
  const task = getScheduleTask(taskId);
  const result = await executeTask(task);
  output({ ok: result.ok, result }, jsonMode);
  if (!result.ok) process.exitCode = 1;
}

async function cmdRunDue(argv, jsonMode) {
  const limit = parsePositiveInt(argv.limit, 20);
  const result = await runDue(limit);
  const ok = result.failed === 0;
  output({ ok, ...result }, jsonMode);
  if (!ok) process.exitCode = 1;
}

async function cmdDaemon(argv, jsonMode) {
  const intervalSec = parsePositiveInt(argv['interval-sec'], 30);
  const limit = parsePositiveInt(argv.limit, 20);
  const runOnce = argv.once === true;
  if (runOnce) {
    const onceResult = await runDue(limit);
    const ok = onceResult.failed === 0;
    output({ ok, mode: 'once', intervalSec, ...onceResult }, jsonMode);
    if (!ok) process.exitCode = 1;
    return;
  }
  output({
    ok: true,
    mode: 'daemon',
    root: resolveSchedulesRoot(),
    intervalSec,
    limit,
    startedAt: new Date().toISOString(),
  }, jsonMode);
  const tick = async () => {
    const result = await runDue(limit);
    const line = {
      ts: new Date().toISOString(),
      event: 'schedule.tick',
      intervalSec,
      limit,
      dueCount: result.count,
      success: result.success,
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
  if (cmd === 'run') return cmdRun(arg1, jsonMode);
  if (cmd === 'run-due') return cmdRunDue(argv, jsonMode);
  if (cmd === 'daemon') return cmdDaemon(argv, jsonMode);

  throw new Error(`unknown schedule command: ${cmd}`);
}

main().catch((error) => {
  const message = error?.message || String(error);
  console.error(message);
  process.exit(1);
});
