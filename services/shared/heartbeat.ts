import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface HeartbeatWatchOptions {
  serviceName: string;
  filePath?: string;
  staleMs?: number;
  intervalMs?: number;
}

export interface HeartbeatWriterOptions {
  filePath?: string;
  intervalMs?: number;
  staleMs?: number;
  initialStatus?: string;
}

function resolveNumber(value: any, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function resolveHeartbeatFile(filePath?: string): string {
  if (filePath && String(filePath).trim()) return String(filePath).trim();
  if (process.env.WEBAUTO_HEARTBEAT_FILE) return String(process.env.WEBAUTO_HEARTBEAT_FILE).trim();
  return path.join(os.homedir(), '.webauto', 'run', 'xhs-heartbeat.json');
}

function readHeartbeat(filePath: string): { ts?: string; status?: string } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      ts: typeof data.ts === 'string' ? data.ts : undefined,
      status: typeof data.status === 'string' ? data.status : undefined,
    };
  } catch {
    return null;
  }
}

export function startHeartbeatWatcher(options: HeartbeatWatchOptions): () => void {
  const filePath = options.filePath || process.env.WEBAUTO_HEARTBEAT_FILE;
  if (!filePath) return () => {};

  const staleMs = resolveNumber(options.staleMs ?? process.env.WEBAUTO_HEARTBEAT_STALE_MS, 45_000);
  const intervalMs = resolveNumber(options.intervalMs ?? process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS, Math.max(2000, Math.floor(staleMs / 3)));
  const serviceName = options.serviceName || 'service';
  const startAt = Date.now();

  const timer = setInterval(() => {
    let ts = 0;
    let status = '';

    const payload = readHeartbeat(filePath);
    if (payload) {
      status = String(payload.status || '');
      ts = payload.ts ? Date.parse(payload.ts) : 0;
    }

    if (!ts) {
      try {
        const stat = fs.statSync(filePath);
        ts = Number(stat.mtimeMs || 0);
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          if (Date.now() - startAt > staleMs) {
            console.warn(`[heartbeat] ${serviceName} exit: heartbeat file missing (${filePath})`);
            process.exit(0);
          }
        }
        return;
      }
    }

    if (status === 'stopped') {
      console.warn(`[heartbeat] ${serviceName} exit: main process stopped`);
      process.exit(0);
    }

    const age = Date.now() - ts;
    if (age > staleMs) {
      console.warn(`[heartbeat] ${serviceName} exit: heartbeat stale ${age}ms > ${staleMs}ms`);
      process.exit(0);
    }
  }, intervalMs);

  timer.unref();
  return () => clearInterval(timer);
}

export function startHeartbeatWriter(options: HeartbeatWriterOptions = {}) {
  const filePath = resolveHeartbeatFile(options.filePath);
  const intervalMs = resolveNumber(
    options.intervalMs ?? process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS,
    5000,
  );
  const staleMs = resolveNumber(
    options.staleMs ?? process.env.WEBAUTO_HEARTBEAT_STALE_MS,
    45_000,
  );
  let status = String(options.initialStatus || 'running');

  process.env.WEBAUTO_HEARTBEAT_FILE = filePath;
  process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS = String(intervalMs);
  process.env.WEBAUTO_HEARTBEAT_STALE_MS = String(staleMs);

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {
    // ignore dir creation failure
  }

  const write = (nextStatus?: string) => {
    if (nextStatus) status = String(nextStatus);
    const payload = {
      pid: process.pid,
      ts: new Date().toISOString(),
      status,
    };
    try {
      fs.writeFileSync(filePath, JSON.stringify(payload));
    } catch {
      // ignore heartbeat write failures
    }
  };

  write(status);
  const timer = setInterval(() => write(), intervalMs);
  timer.unref();

  const stop = () => {
    write('stopped');
    clearInterval(timer);
  };

  process.on('exit', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const setStatus = (nextStatus: string) => {
    write(nextStatus || 'running');
  };

  return { stop, filePath, intervalMs, staleMs, setStatus };
}
