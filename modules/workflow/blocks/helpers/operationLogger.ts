import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface OperationLogEntry {
  kind: string;
  action?: string;
  sessionId?: string;
  context?: string;
  reason?: string;
  payload?: Record<string, any> | null;
  result?: Record<string, any> | null;
  target?: Record<string, any> | null;
  meta?: Record<string, any> | null;
  opId?: number;
}

export interface ErrorLogEntry {
  kind: string;
  action?: string;
  sessionId?: string;
  context?: string;
  reason?: string;
  error?: string;
  payload?: Record<string, any> | null;
  meta?: Record<string, any> | null;
  opId?: number;
}

const LOG_ROOT = path.join(os.homedir(), '.webauto', 'logs');
const OPS_LOG_FILE = path.join(LOG_ROOT, 'ops.jsonl');
const ERR_LOG_FILE = path.join(LOG_ROOT, 'ops-errors.jsonl');
const MAX_RECENT = 50;

let seq = 0;
const recentOps: Array<Record<string, any>> = [];
let logReady = false;

function ensureLogDir(): void {
  if (logReady) return;
  try {
    fs.mkdirSync(LOG_ROOT, { recursive: true });
  } catch {
    // ignore
  }
  logReady = true;
}

function nextId(): number {
  seq += 1;
  return seq;
}

function truncateString(value: string, maxLen = 400): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}...[len=${value.length}]`;
}

function shouldOmitKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes('script') ||
    k.includes('html') ||
    k.includes('cookie') ||
    k.includes('buffer') ||
    k.includes('base64') ||
    k.includes('screenshot') ||
    k.includes('image')
  );
}

function summarizeValue(value: any, depth = 0): any {
  if (depth > 3) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const len = value.length;
    if (len === 0) return [];
    if (len <= 5) return value.map((v) => summarizeValue(v, depth + 1));
    return {
      _type: 'array',
      length: len,
      sample: value.slice(0, 2).map((v) => summarizeValue(v, depth + 1)),
    };
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    const keys = Object.keys(value);
    let count = 0;
    for (const key of keys) {
      if (count >= 20) break;
      count += 1;
      if (shouldOmitKey(key)) {
        out[key] = '[omitted]';
        continue;
      }
      out[key] = summarizeValue(value[key], depth + 1);
    }
    if (keys.length > count) out._more = keys.length - count;
    return out;
  }
  return String(value);
}

function summarizeRecent(entry: Record<string, any>): Record<string, any> {
  return {
    opId: entry.opId,
    kind: entry.kind,
    action: entry.action,
    sessionId: entry.sessionId,
    context: entry.context,
    reason: entry.reason,
  };
}

function pushRecent(entry: Record<string, any>): void {
  recentOps.push(entry);
  if (recentOps.length > MAX_RECENT) {
    recentOps.splice(0, recentOps.length - MAX_RECENT);
  }
}

export function logOperation(entry: OperationLogEntry): number {
  ensureLogDir();
  const opId = entry.opId ?? nextId();
  const record = {
    ts: new Date().toISOString(),
    opId,
    kind: entry.kind,
    action: entry.action || null,
    sessionId: entry.sessionId || null,
    context: entry.context || null,
    reason: entry.reason || null,
    payload: entry.payload ? summarizeValue(entry.payload) : null,
    result: entry.result ? summarizeValue(entry.result) : null,
    target: entry.target ? summarizeValue(entry.target) : null,
    meta: entry.meta ? summarizeValue(entry.meta) : null,
  };
  try {
    fs.appendFileSync(OPS_LOG_FILE, `${JSON.stringify(record)}\n`);
  } catch {
    // ignore
  }
  pushRecent(record);
  return opId;
}

export function logError(entry: ErrorLogEntry): number {
  ensureLogDir();
  const opId = entry.opId ?? nextId();
  const record = {
    ts: new Date().toISOString(),
    opId,
    kind: entry.kind,
    action: entry.action || null,
    sessionId: entry.sessionId || null,
    context: entry.context || null,
    reason: entry.reason || null,
    error: entry.error || null,
    payload: entry.payload ? summarizeValue(entry.payload) : null,
    meta: entry.meta ? summarizeValue(entry.meta) : null,
    recent: recentOps.map(summarizeRecent),
  };
  try {
    fs.appendFileSync(ERR_LOG_FILE, `${JSON.stringify(record)}\n`);
  } catch {
    // ignore
  }
  return opId;
}

export function logControllerActionStart(
  action: string,
  payload: any,
  meta: Record<string, any> = {},
): number {
  const sessionId = payload?.profileId || payload?.profile || payload?.sessionId || null;
  const reason =
    payload?.reason ||
    payload?.context ||
    payload?.operationId ||
    payload?.actionId ||
    null;
  const target = payload?.containerId
    ? {
        containerId: payload.containerId,
        operationId: payload?.operationId || null,
        index: payload?.index ?? null,
      }
    : payload?.x !== undefined && payload?.y !== undefined
      ? { x: payload.x, y: payload.y }
      : payload?.coordinates
        ? { coordinates: payload.coordinates }
        : null;
  return logOperation({
    kind: 'controller_action',
    action,
    sessionId,
    reason,
    target,
    payload,
    meta,
  });
}

export function logControllerActionResult(
  opId: number,
  action: string,
  result: any,
  meta: Record<string, any> = {},
): void {
  logOperation({
    kind: 'controller_result',
    action,
    opId,
    result,
    meta,
  });
}

export function logControllerActionError(
  opId: number,
  action: string,
  error: unknown,
  payload: any,
  meta: Record<string, any> = {},
): void {
  const err = error instanceof Error ? error.message : String(error);
  logError({
    kind: 'controller_error',
    action,
    opId,
    error: err,
    payload,
    meta,
  });
}
