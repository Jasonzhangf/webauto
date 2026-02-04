/**
 * 日志系统模块
 *
 * 功能：
 * - 初始化运行日志（控制台 + 文件）
 * - 事件追踪（JSONL 格式）
 * - 清理旧日志
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let runContext = null;

export function createRunId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

export function safeStringify(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack || v.message || String(v);
  try {
    return JSON.stringify(v);
  } catch {
    try {
      return String(v);
    } catch {
      return '[unstringifiable]';
    }
  }
}

function formatConsoleArgs(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      return safeStringify(a);
    })
    .join(' ');
}

export async function cleanupOldRunArtifacts(baseDir, logMode = 'single') {
  if (logMode !== 'single') return;
  try {
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    const removeTargets = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const name = e.name;
      if (/^run\.[0-9]{8}-[0-9]{6}-[a-z0-9]{6}\.log$/i.test(name)) removeTargets.push(name);
      if (/^run-events\.[0-9]{8}-[0-9]{6}-[a-z0-9]{6}\.jsonl$/i.test(name)) removeTargets.push(name);
      if (/^summary\.comments\.[0-9]{8}-[0-9]{6}-[a-z0-9]{6}\.(md|jsonl)$/i.test(name)) removeTargets.push(name);
      if (/^daemon\.[0-9]{4}-[0-9]{2}-[0-9]{2}t/i.test(name) && name.endsWith('.log')) removeTargets.push(name);
    }
    for (const name of removeTargets) {
      try {
        await fs.promises.unlink(path.join(baseDir, name));
      } catch {
        // ignore
      }
    }
    if (removeTargets.length > 0) {
      console.log(`[Logger] cleanup-logs: removed=${removeTargets.length}`);
    }
  } catch {
    // ignore
  }
}

export function initRunLogging({ env, keyword, logMode = 'single', baseDir: customBaseDir, noWrite = false } = {}) {
  if (!env) throw new Error('initRunLogging: env is required');
  if (!keyword) throw new Error('initRunLogging: keyword is required');

  const baseDir = customBaseDir || getKeywordBaseDir(env, keyword);
  const runId = createRunId();

  if (noWrite) {
    // dry-run: avoid any file IO
    runContext = {
      runId,
      env,
      keyword,
      baseDir,
      logPath: null,
      eventsPath: null,
      startedAtMs: Date.now(),
      emitEvent: () => {},
      close: () => {},
    };
    console.log(`[Logger] runId=${runId} (no-write)`);
    return runContext;
  }

  const logPath =
    logMode === 'rotate' ? path.join(baseDir, `run.${runId}.log`) : path.join(baseDir, 'run.log');
  const eventsPath =
    logMode === 'rotate'
      ? path.join(baseDir, `run-events.${runId}.jsonl`)
      : path.join(baseDir, 'run-events.jsonl');

  fs.mkdirSync(baseDir, { recursive: true });
  cleanupOldRunArtifacts(baseDir, logMode).catch(() => {});

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const eventStream = fs.createWriteStream(eventsPath, { flags: 'a' });

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
  };

  const writeLine = (level, args) => {
    const line = `${new Date().toISOString()} [${level}] ${formatConsoleArgs(args)}\n`;
    try {
      logStream.write(line);
    } catch {
      // ignore
    }
  };

  console.log = (...args) => {
    original.log(...args);
    writeLine('INFO', args);
  };
  console.warn = (...args) => {
    original.warn(...args);
    writeLine('WARN', args);
  };
  console.error = (...args) => {
    original.error(...args);
    writeLine('ERROR', args);
  };
  console.info = (...args) => {
    original.info(...args);
    writeLine('INFO', args);
  };

  if (logMode === 'single') {
    try {
      logStream.write(`\n===== RUN_START ${new Date().toISOString()} runId=${runId} =====\n`);
      eventStream.write(
        `${JSON.stringify({ ts: new Date().toISOString(), runId, type: 'run_start_marker', env, keyword })}\n`,
      );
    } catch {
      // ignore
    }
  }

  const emitEvent = (type, data = {}) => {
    const payload = {
      ts: new Date().toISOString(),
      runId,
      type,
      env,
      keyword,
      ...data,
    };
    try {
      eventStream.write(`${JSON.stringify(payload)}\n`);
    } catch {
      // ignore
    }
  };

  runContext = {
    runId,
    env,
    keyword,
    baseDir,
    logPath,
    eventsPath,
    startedAtMs: Date.now(),
    emitEvent,
    close: () => {
      try {
        logStream.end();
      } catch {}
      try {
        eventStream.end();
      } catch {}
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
      console.info = original.info;
    },
  };

  emitEvent('run_start', { logPath, eventsPath });

  process.on('uncaughtException', (err) => {
    try {
      emitEvent('uncaught_exception', { error: safeStringify(err) });
    } catch {}
  });
  process.on('unhandledRejection', (reason) => {
    try {
      emitEvent('unhandled_rejection', { error: safeStringify(reason) });
    } catch {}
  });
  process.on('exit', (code) => {
    try {
      emitEvent('run_exit', { code });
    } catch {}
    try {
      runContext?.close?.();
    } catch {}
  });

  console.log(`[Logger] runId=${runId}`);
  console.log(`[Logger] log=${logPath}`);
  console.log(`[Logger] events=${eventsPath}`);
  return runContext;
}

export function emitRunEvent(type, data = {}) {
  if (runContext && typeof runContext.emitEvent === 'function') {
    runContext.emitEvent(type, data);
  }
}

export function getRunContext() {
  return runContext;
}

export function closeRunLogging() {
  if (runContext && typeof runContext.close === 'function') {
    runContext.close();
  }
  runContext = null;
}

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function getKeywordBaseDir(env, keyword) {
  const downloadDir = resolveDownloadRoot();
  return path.join(downloadDir, 'xiaohongshu', env, keyword);
}
