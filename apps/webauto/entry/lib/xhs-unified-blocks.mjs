import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function nowIso() {
  return new Date().toISOString();
}

export function sleepMs(ms) {
  const waitMs = Math.max(0, Number(ms) || 0);
  if (waitMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

export function formatRunLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

export function parseIntFlag(value, fallback, min = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

export function parseNonNegativeInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export function pickRandomInt(min, max) {
  const floorMin = Math.max(0, Math.floor(Number(min) || 0));
  const floorMax = Math.max(floorMin, Math.floor(Number(max) || 0));
  if (floorMax <= floorMin) return floorMin;
  return floorMin + Math.floor(Math.random() * (floorMax - floorMin + 1));
}

export function sanitizeForPath(name, fallback = 'unknown') {
  const text = String(name || '').trim();
  if (!text) return fallback;
  const cleaned = text.replace(/[\\/:"*?<>|]+/g, '_').trim();
  return cleaned || fallback;
}

function parseLastJson(stdout = '') {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith('{') && !line.startsWith('[')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // ignore
    }
  }
  return null;
}

function runWebautoCli(args, options = {}) {
  const rootDir = String(options.rootDir || process.cwd()).trim() || process.cwd();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 120000);
  const scriptPath = path.join(rootDir, 'bin', 'webauto.mjs');
  const ret = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });
  const stdout = String(ret.stdout || '').trim();
  const stderr = String(ret.stderr || '').trim();
  return {
    ok: ret.status === 0,
    code: ret.status,
    stdout,
    stderr,
    json: parseLastJson(stdout),
  };
}

export async function ensureTaskServices(argv, options = {}) {
  const rootDir = String(options.rootDir || process.cwd()).trim() || process.cwd();
  const stage = String(options.stage || '').trim();
  const envName = String(argv.env || 'prod').trim() || 'prod';
  const debugMode = envName === 'debug';
  const debugActionLogPath = String(options.debugActionLogPath || '').trim();
  const actionLogPath = debugMode
    ? (debugActionLogPath || path.join(os.homedir(), '.webauto', 'logs', `input-actions-${Date.now()}.jsonl`))
    : null;

  let serviceReset = {
    ok: true,
    skipped: true,
    reason: 'service_reset_disabled',
    actionLogPath: null,
  };
  const enableServiceReset = parseBool(argv['service-reset'], true);
  if (enableServiceReset && stage !== 'links') {
    serviceReset = await resetTaskServices(argv, {
      rootDir,
      debugActionLogPath: actionLogPath || undefined,
    });
  } else if (stage === 'links') {
    serviceReset = {
      ok: true,
      skipped: true,
      reason: 'collect_mode_uses_camo_directly',
      actionLogPath: null,
    };
  }

  const searchGateEnabled = parseBool(argv['search-gate'], true);
  let searchGate = {
    ok: true,
    skipped: true,
    reason: 'search_gate_disabled',
  };
  if (searchGateEnabled) {
    const timeoutMs = Math.max(1000, Number(options.searchGateTimeoutMs) || 60000);
    const scriptPath = path.join(rootDir, 'runtime', 'infra', 'utils', 'scripts', 'service', 'start-search-gate.mjs');
    const ret = spawnSync(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: { ...process.env, ...(options.env || {}) },
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });
    const stdout = String(ret.stdout || '').trim();
    const stderr = String(ret.stderr || '').trim();
    if (ret.status !== 0) {
      throw new Error(`search gate start failed: ${stderr || stdout || 'unknown error'}`);
    }
    searchGate = {
      ok: true,
      skipped: false,
      stdout,
      stderr,
    };
  }

  return {
    actionLogPath,
    serviceReset,
    searchGate,
  };
}

export async function resetTaskServices(argv, options = {}) {
  const enabled = parseBool(argv['service-reset'], true);
  const rootDir = String(options.rootDir || process.cwd()).trim() || process.cwd();
  const debugActionLogPath = String(options.debugActionLogPath || '').trim();
  if (!enabled) {
    return {
      ok: true,
      skipped: true,
      reason: 'service_reset_disabled',
      actionLogPath: null,
    };
  }
  const envName = String(argv.env || 'prod').trim() || 'prod';
  const debugMode = envName === 'debug';
  const actionLogPath = debugMode
    ? (debugActionLogPath || path.join(os.homedir(), '.webauto', 'logs', `input-actions-${Date.now()}.jsonl`))
    : null;
  const serviceEnv = debugMode
    ? {
      WEBAUTO_DEBUG_ACTION_JSONL: '1',
      WEBAUTO_DEBUG_ACTION_LOG_PATH: actionLogPath,
    }
    : {};

  const stopRet = runWebautoCli(['ui', 'cli', 'stop', '--json'], {
    rootDir,
    timeoutMs: 120000,
    env: serviceEnv,
  });
  const startRet = runWebautoCli(['ui', 'cli', 'start', '--json'], {
    rootDir,
    timeoutMs: 240000,
    env: serviceEnv,
  });
  if (!startRet.ok) {
    throw new Error(`ui cli start failed: ${startRet.stderr || startRet.stdout || 'unknown error'}`);
  }

  let statusRet = null;
  let ready = false;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    statusRet = runWebautoCli(['ui', 'cli', 'status', '--json'], {
      rootDir,
      timeoutMs: 60000,
      env: serviceEnv,
    });
    ready = Boolean(statusRet?.ok && statusRet?.json?.ready === true);
    if (ready) break;
    await sleepMs(600);
  }
  if (!ready) {
    throw new Error(`ui cli status not ready after restart: ${statusRet?.stderr || statusRet?.stdout || 'unknown error'}`);
  }
  return {
    ok: true,
    skipped: false,
    actionLogPath,
    stop: stopRet,
    start: startRet,
    status: statusRet,
  };
}
