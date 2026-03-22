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

export async function ensureTaskServices(argv, options = {}) {
  const rootDir = String(options.rootDir || process.cwd()).trim() || process.cwd();
  const stage = String(options.stage || '').trim();
  const envName = String(argv.env || 'prod').trim() || 'prod';
  const debugMode = envName === 'debug';
  const debugActionLogPath = String(options.debugActionLogPath || '').trim();
  const actionLogPath = debugMode
    ? (debugActionLogPath || path.join(os.homedir(), '.webauto', 'logs', `input-actions-${Date.now()}.jsonl`))
    : null;

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
    searchGate,
  };
}
