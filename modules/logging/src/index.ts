import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface LogSourceOptions {
  file?: string;
  source?: string;
  session?: string;
}

export interface StreamOptions extends LogSourceOptions {
  maxLines?: number;
}

export interface StreamResult {
  file: string;
  lines: string[];
}

const HOME_LOG_ROOT = path.join(os.homedir(), '.webauto', 'logs');
export const DEBUG_LOG_FILE = path.join(HOME_LOG_ROOT, 'debug.jsonl');
const DEFAULT_SOURCES: Record<string, string> = {
  browser: path.join(HOME_LOG_ROOT, 'browser.log'),
  service: path.join(HOME_LOG_ROOT, 'service.log'),
  orchestrator: path.join(HOME_LOG_ROOT, 'orchestrator.log'),
};

let debugReady = false;

function isDebugEnabled(): boolean {
  return process.env.DEBUG === '1' || process.env.debug === '1';
}

function ensureDebugLogDir(): void {
  if (debugReady) return;
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG_FILE), { recursive: true });
    debugReady = true;
  } catch {
    // ignore
  }
}

export function logDebug(module: string, event: string, data: Record<string, any> = {}): void {
  if (!isDebugEnabled()) return;
  ensureDebugLogDir();
  const entry = {
    ts: Date.now(),
    level: 'debug',
    module,
    event,
    data,
  };
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, `${JSON.stringify(entry)}\n`);
  } catch {
    // ignore
  }
}


export function resolveLogFile(options: LogSourceOptions): string {
  if (options.file) {
    return path.resolve(options.file);
  }
  if (options.session) {
    return path.join(HOME_LOG_ROOT, `session-${options.session}.log`);
  }
  if (options.source && DEFAULT_SOURCES[options.source]) {
    return DEFAULT_SOURCES[options.source];
  }
  return DEFAULT_SOURCES.browser;
}

export async function streamLog(options: StreamOptions = {}): Promise<StreamResult> {
  const file = resolveLogFile(options);
  const maxLines = options.maxLines ?? 200;
  const lines = await readTailLines(file, maxLines);
  return { file, lines };
}

export async function flushLog(options: LogSourceOptions = {}, truncate = false): Promise<StreamResult> {
  const file = resolveLogFile(options);
  const lines = await readTailLines(file, Number.MAX_SAFE_INTEGER);
  if (truncate) {
    await fs.promises
      .truncate(file, 0)
      .catch(() => Promise.resolve());
 }
 return { file, lines };
}

async function readTailLines(file: string, maxLines: number): Promise<string[]> {
  try {
    const content = await fs.promises.readFile(file, 'utf-8');
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length <= maxLines) {
      return lines;
    }
    return lines.slice(-maxLines);
  } catch (err: any) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return [];
    }
    throw err;
  }
}
