import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface ServiceProcessLoggerOptions {
  serviceName: string;
  /**
   * When true, mirror console output to `~/.webauto/logs/<service>.log`.
   * Defaults to `process.stdout.isTTY || process.stderr.isTTY` to avoid
   * duplicating logs when a parent process is already piping stdout/stderr.
   */
  teeConsoleToFile?: boolean;
}

export interface ServiceProcessLogger {
  logEvent: (event: string, data?: Record<string, unknown>) => void;
}

const INSTALLED = new Set<string>();

function ensureLogDir(): string {
  const dir = path.join(os.homedir(), '.webauto', 'logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

function safeAppend(filePath: string, line: string): void {
  try {
    fs.appendFileSync(filePath, line);
  } catch {
    // ignore
  }
}

function formatError(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const anyErr = err as any;
  return {
    name: typeof anyErr.name === 'string' ? anyErr.name : undefined,
    message: typeof anyErr.message === 'string' ? anyErr.message : String(err),
    stack: typeof anyErr.stack === 'string' ? anyErr.stack : undefined,
    code: typeof anyErr.code === 'string' ? anyErr.code : undefined,
  };
}

function createConsoleTee(logFile: string): void {
  const kWrapped = Symbol.for('webauto.consoleTeeWrapped');
  const g: any = globalThis as any;
  if (g[kWrapped]) return;
  g[kWrapped] = true;

  const originals: Record<LogLevel, (...args: any[]) => void> = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const wrap = (level: LogLevel) => {
    return (...args: any[]) => {
      const ts = new Date().toISOString();
      const msg = args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ');
      safeAppend(logFile, `[${ts}] [${level.toUpperCase()}] ${msg}\n`);
      originals[level](...args);
    };
  };

  console.log = wrap('log') as any;
  console.info = wrap('info') as any;
  console.warn = wrap('warn') as any;
  console.error = wrap('error') as any;
}

export function installServiceProcessLogger(
  opts: ServiceProcessLoggerOptions,
): ServiceProcessLogger {
  const serviceName = String(opts.serviceName || '').trim();
  const id = `service:${serviceName}`;
  if (!serviceName) return { logEvent: () => {} };
  if (INSTALLED.has(id)) return { logEvent: () => {} };
  INSTALLED.add(id);

  const logDir = ensureLogDir();
  const crashFile = path.join(logDir, `${serviceName}.crash.jsonl`);
  const consoleLogFile = path.join(logDir, `${serviceName}.log`);

  const tee =
    typeof opts.teeConsoleToFile === 'boolean'
      ? opts.teeConsoleToFile
      : !!(process.stdout.isTTY || process.stderr.isTTY);
  if (tee) createConsoleTee(consoleLogFile);

  const base = {
    service: serviceName,
    pid: process.pid,
    node: process.version,
  };

  const logEvent = (event: string, data: Record<string, unknown> = {}) => {
    safeAppend(
      crashFile,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        ...base,
        event,
        ...data,
      })}\n`,
    );
  };

  logEvent('process_start', {
    argv: process.argv,
    cwd: process.cwd(),
    ppid: process.ppid,
    stdoutIsTTY: !!process.stdout.isTTY,
    stderrIsTTY: !!process.stderr.isTTY,
  });

  process.on('uncaughtException', (err) => {
    logEvent('uncaughtException', { error: formatError(err) });
    // Keep the process alive for post-mortem visibility, but mark non-zero.
    process.exitCode = 1;
  });

  process.on('unhandledRejection', (reason) => {
    logEvent('unhandledRejection', { reason: formatError(reason) });
    process.exitCode = 1;
  });

  const tapSignal = (signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => {
    const hadExisting = process.listenerCount(signal) > 0;
    const handler = () => {
      logEvent('signal', { signal });
      process.off(signal, handler);
      // If we were the only listener, re-send the signal so Node's default behavior applies.
      if (!hadExisting) {
        try {
          process.kill(process.pid, signal);
        } catch {
          // ignore
        }
      }
    };
    process.on(signal, handler);
  };

  tapSignal('SIGINT');
  tapSignal('SIGTERM');
  tapSignal('SIGHUP');

  process.on('beforeExit', (code) => logEvent('beforeExit', { code }));
  process.on('exit', (code) => logEvent('exit', { code }));

  return { logEvent };
}
