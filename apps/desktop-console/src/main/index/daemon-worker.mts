import net from 'node:net';
import { app } from 'electron';
import { appendDesktopLifecycle } from './lifecycle.mts';

export type DaemonWorkerConfig = {
  socketPath: string;
  workerId: string;
  token: string;
  intervalMs: number;
  missLimit: number;
  timeoutMs: number;
};

let daemonWorkerHeartbeatTimer: NodeJS.Timeout | null = null;
let daemonWorkerMisses = 0;
let daemonWorkerStopping = false;
let daemonWorkerExitSent = false;
let appExitReasonHint = 'before_quit';

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function resolveDaemonWorkerConfig(env: NodeJS.ProcessEnv = process.env): DaemonWorkerConfig | null {
  const socketPath = String(env.WEBAUTO_DAEMON_SOCKET || '').trim();
  const workerId = String(env.WEBAUTO_DAEMON_WORKER_ID || '').trim();
  const token = String(env.WEBAUTO_DAEMON_WORKER_TOKEN || '').trim();
  if (!socketPath || !workerId || !token) return null;
  const intervalMs = parsePositiveInt(env.WEBAUTO_DAEMON_HEARTBEAT_INTERVAL_MS, 30_000);
  const missLimit = parsePositiveInt(env.WEBAUTO_DAEMON_HEARTBEAT_MISS_LIMIT, 5);
  const timeoutMs = Math.min(8_000, Math.max(1_500, Math.floor(intervalMs * 0.6)));
  return { socketPath, workerId, token, intervalMs, missLimit, timeoutMs };
}

export function createDaemonWorker(config: DaemonWorkerConfig | null) {
  const daemonWorkerConfig = config;

  const daemonSocketRequest = (payload: Record<string, any>, timeoutMs: number): Promise<Record<string, any>> => {
    if (!daemonWorkerConfig?.socketPath) return Promise.reject(new Error('daemon_worker_not_configured'));
    return new Promise((resolve, reject) => {
      const client = net.createConnection(daemonWorkerConfig.socketPath);
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null;
        client.destroy(new Error(`daemon_request_timeout_${timeoutMs}ms`));
      }, timeoutMs);
      let buffer = '';
      client.on('error', (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      });
      client.on('connect', () => {
        client.write(`${JSON.stringify(payload)}\n`);
      });
      client.on('data', (chunk) => {
        buffer += String(chunk || '');
        const idx = buffer.indexOf('\n');
        if (idx < 0) return;
        const line = buffer.slice(0, idx).trim();
        if (timer) clearTimeout(timer);
        try {
          resolve(JSON.parse(line || '{}'));
        } catch (error) {
          reject(error);
        } finally {
          client.end();
        }
      });
      client.on('close', () => {
        if (timer) clearTimeout(timer);
        timer = null;
      });
    });
  };

  const sendDaemonWorkerExit = async (source = 'desktop-main') => {
    if (!daemonWorkerConfig || daemonWorkerExitSent) return;
    daemonWorkerExitSent = true;
    try {
      await daemonSocketRequest({
        method: 'worker.exit',
        params: {
          workerId: daemonWorkerConfig.workerId,
          token: daemonWorkerConfig.token,
          pid: process.pid,
          source,
          ts: new Date().toISOString(),
        },
      }, daemonWorkerConfig.timeoutMs);
    } catch {
      // daemon may already be down
    }
  };

  const requestDaemonLinkedExit = async (reason: string, waitForCleanup: (hint: string) => Promise<void>) => {
    if (daemonWorkerStopping) return;
    daemonWorkerStopping = true;
    appExitReasonHint = `daemon:${reason}`;
    await appendDesktopLifecycle('daemon_worker_exit_requested', { reason });
    await waitForCleanup(`daemon:${reason}`);
    app.quit();
  };

  const startDaemonWorkerHeartbeat = (waitForCleanup: (hint: string) => Promise<void>) => {
    if (!daemonWorkerConfig || daemonWorkerHeartbeatTimer) return;
    const emitHeartbeat = async (source = 'interval') => {
      if (!daemonWorkerConfig || daemonWorkerStopping) return;
      try {
        const ret = await daemonSocketRequest({
          method: 'worker.heartbeat',
          params: {
            workerId: daemonWorkerConfig.workerId,
            token: daemonWorkerConfig.token,
            pid: process.pid,
            source: `desktop-main:${source}`,
            ts: new Date().toISOString(),
          },
        }, daemonWorkerConfig.timeoutMs);
        if (ret?.ok) {
          daemonWorkerMisses = 0;
          if (ret.shuttingDown === true) {
            await requestDaemonLinkedExit('daemon_shutting_down', waitForCleanup);
          }
          return;
        }
        daemonWorkerMisses += 1;
      } catch {
        daemonWorkerMisses += 1;
      }
      if (daemonWorkerMisses >= daemonWorkerConfig.missLimit) {
        await requestDaemonLinkedExit('daemon_heartbeat_lost', waitForCleanup);
      }
    };

    void emitHeartbeat('init');
    daemonWorkerHeartbeatTimer = setInterval(() => {
      void emitHeartbeat('tick');
    }, daemonWorkerConfig.intervalMs);
    daemonWorkerHeartbeatTimer.unref();
  };

  const stopDaemonWorkerHeartbeat = (reason = 'stop') => {
    if (daemonWorkerHeartbeatTimer) {
      clearInterval(daemonWorkerHeartbeatTimer);
      daemonWorkerHeartbeatTimer = null;
    }
    if (!daemonWorkerConfig) return;
    void sendDaemonWorkerExit(`desktop:${reason}`);
  };

  return {
    startDaemonWorkerHeartbeat,
    stopDaemonWorkerHeartbeat,
    getExitReason: () => appExitReasonHint,
  };
}
