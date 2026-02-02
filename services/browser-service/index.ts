import http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { SessionManager, CreateSessionPayload, SESSION_CLOSED_EVENT } from './SessionManager.js';
import { BrowserWsServer } from './ws-server.js';
import { RemoteMessageBusClient } from '../../libs/operations-framework/src/event-driven/RemoteMessageBusClient.js';
import { BrowserMessageHandler } from './BrowserMessageHandler.js';
import { logDebug } from '../../modules/logging/src/index.js';
import { installServiceProcessLogger } from '../shared/serviceProcessLogger.js';
import { startHeartbeatWriter } from '../shared/heartbeat.js';

type CommandPayload = { action: string; args?: any };

interface BrowserServiceOptions {
  host?: string;
  port?: number;
  enableWs?: boolean;
  wsPort?: number;
  wsHost?: string;
  busUrl?: string;
}

const clients = new Set<ServerResponse>();
const autoLoops = new Map<string, NodeJS.Timeout>();

function readNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getDisplayMetrics() {
  const envWidth = readNumber(process.env.WEBAUTO_SCREEN_WIDTH);
  const envHeight = readNumber(process.env.WEBAUTO_SCREEN_HEIGHT);
  if (envWidth && envHeight) {
    return { width: envWidth, height: envHeight, source: 'env' };
  }
  if (os.platform() !== 'win32') return null;
  try {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$screen=[System.Windows.Forms.Screen]::PrimaryScreen;',
      '$b=$screen.Bounds;',
      '$w=$screen.WorkingArea;',
      '$video=Get-CimInstance Win32_VideoController | Select-Object -First 1;',
      '$nw=$null;$nh=$null;',
      'if ($video) { $nw=$video.CurrentHorizontalResolution; $nh=$video.CurrentVerticalResolution }',
      '$o=[pscustomobject]@{width=$b.Width;height=$b.Height;workWidth=$w.Width;workHeight=$w.Height;nativeWidth=$nw;nativeHeight=$nh};',
      '$o | ConvertTo-Json -Compress',
    ].join(' ');
    const res = spawnSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (res.status !== 0 || !res.stdout) return null;
    const payload = JSON.parse(res.stdout.trim());
    const nativeWidth = readNumber(payload?.nativeWidth);
    const nativeHeight = readNumber(payload?.nativeHeight);
    const width = readNumber(payload?.width) || nativeWidth || null;
    const height = readNumber(payload?.height) || nativeHeight || null;
    const workWidth = readNumber(payload?.workWidth);
    const workHeight = readNumber(payload?.workHeight);
    if (!width || !height) return null;
    return {
      width,
      height,
      ...(workWidth ? { workWidth } : {}),
      ...(workHeight ? { workHeight } : {}),
      ...(nativeWidth ? { nativeWidth } : {}),
      ...(nativeHeight ? { nativeHeight } : {}),
      source: 'win32',
    };
  } catch {
    return null;
  }
}

export async function startBrowserService(opts: BrowserServiceOptions = {}) {
  const { logEvent } = installServiceProcessLogger({ serviceName: 'browser-service' });
  const host = opts.host || '127.0.0.1';
  const port = Number(opts.port || 7704);
  const sessionManager = new SessionManager();
  const enableWs = opts.enableWs ?? process.env.BROWSER_SERVICE_DISABLE_WS !== '1';
  const wsHost = opts.wsHost || '127.0.0.1';
  const wsPort = Number(opts.wsPort || 8765);
  const autoExit = process.env.BROWSER_SERVICE_AUTO_EXIT === '1';
  const busUrl = opts.busUrl || process.env.WEBAUTO_BUS_URL || 'ws://127.0.0.1:7701/bus';
  const heartbeat = startHeartbeatWriter({ initialStatus: 'idle' });
  let heartbeatStatus: 'idle' | 'running' | 'stopped' = 'idle';
  let hasActiveSession = false;

  const setHeartbeatStatus = (next: 'idle' | 'running' | 'stopped') => {
    if (heartbeatStatus === next) return;
    heartbeatStatus = next;
    heartbeat.setStatus(next);
  };

  const markSessionStarted = () => {
    hasActiveSession = true;
    setHeartbeatStatus('running');
  };

  const markAllSessionsClosed = () => {
    if (!hasActiveSession) return;
    setHeartbeatStatus('stopped');
  };

  logDebug('browser-service', 'start', { host, port, wsHost, wsPort, enableWs, autoExit, busUrl });

  // IMPORTANT: declare before server starts accepting requests (avoid TDZ crash).
  let wsServer: BrowserWsServer | null = null;

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        });
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      if (url.pathname === '/command' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const payload: CommandPayload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            const result = await handleCommand(payload, sessionManager, wsServer, { onSessionStart: markSessionStarted });
            res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.body));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    })().catch((err) => {
      logEvent('http.request.error', {
        method: req?.method,
        url: req?.url,
        error: { message: err?.message || String(err), stack: err?.stack },
      });
      try {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Internal Server Error' }));
      } catch {
        // ignore
      }
    });
  });

  server.listen(port, host, () => {
    console.log(`BrowserService listening on http://${host}:${port}`);
  });

  if (enableWs) {
    wsServer = new BrowserWsServer({ host: wsHost, port: wsPort, sessionManager });
    try {
      await wsServer.start();
    } catch (err) {
      console.warn('[browser-service] failed to start WebSocket server:', (err as Error).message);
    }
  }

  // Connect to message bus
  let messageBusClient: RemoteMessageBusClient | null = null;
  let messageHandler: BrowserMessageHandler | null = null;

  if (busUrl) {
    messageBusClient = new RemoteMessageBusClient(busUrl);
    try {
      await messageBusClient.connect();
      messageHandler = new BrowserMessageHandler(messageBusClient, sessionManager);
      await messageHandler.start();
      console.log('[browser-service] Connected to message bus');
    } catch (err) {
      console.warn('[browser-service] Failed to connect to message bus:', (err as Error).message);
    }
  }

  const stopWsServer = async () => {
    if (!wsServer) return;
    await wsServer.stop().catch(() => {});
  };

  const shutdown = async () => {
    heartbeat.stop();
    server.close();
    clients.forEach((client) => client.end());
    autoLoops.forEach((timer) => clearInterval(timer));
    await stopWsServer();
    if (messageHandler) {
      // Clean up message handler if needed
    }
    await sessionManager.shutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on(SESSION_CLOSED_EVENT as any, () => {
    if (!managerIsIdle(sessionManager)) return;
    markAllSessionsClosed();
    if (autoExit || hasActiveSession) {
      shutdown().finally(() => process.exit(0));
    }
  });
}

function managerIsIdle(manager: SessionManager) {
  return manager.listSessions().length === 0;
}

async function handleCommand(
  payload: CommandPayload,
  manager: SessionManager,
  wsServer: BrowserWsServer | null,
  options: { onSessionStart?: () => void } = {},
) {
  const action = payload.action;
  const args = payload.args ?? (payload as any);

  switch (action) {
    case 'start': {
      const opts: CreateSessionPayload = {
        profileId: args.profileId || 'default',
        sessionName: args.profileId || 'default',
        headless: !!args.headless,
        initialUrl: args.url,
        engine: args.engine || 'camoufox',
        fingerprintPlatform: args.fingerprintPlatform || null,
        // Optional: pid of the owning script process.
        ...(args.ownerPid ? { ownerPid: args.ownerPid } : {}),
      };
      const res = await manager.createSession(opts);
      options.onSessionStart?.();
      broadcast('browser:started', { profileId: opts.profileId, sessionId: res.sessionId });
      return { ok: true, body: { ok: true, sessionId: res.sessionId, profileId: opts.profileId } };
    }
    case 'goto': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      await session.goto(args.url);
      broadcast('page:navigated', { profileId, url: args.url });
      return { ok: true, body: { ok: true } };
    }
    case 'getCookies': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const cookies = await session.getCookies();
      return { ok: true, body: { ok: true, cookies } };
    }
    case 'saveCookies': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      if (!args.path) throw new Error('path required');
      const result = await session.saveCookiesToFile(args.path);
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'saveCookiesIfStable': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      if (!args.path) throw new Error('path required');
      const result = await session.saveCookiesIfStable(args.path, { minDelayMs: args.minDelayMs });
      return { ok: true, body: { ok: true, saved: !!result, ...result } };
    }
    case 'loadCookies': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      if (!args.path) throw new Error('path required');
      const result = await session.injectCookiesFromFile(args.path);
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'getStatus': {
      return { ok: true, body: { ok: true, sessions: manager.listSessions() } };
    }
    case 'system:display': {
      const metrics = getDisplayMetrics();
      return { ok: true, body: { ok: true, metrics } };
    }
    case 'stop': {
      const profileId = args.profileId || 'default';
      const deleted = await manager.deleteSession(profileId);
      return { ok: true, body: { ok: deleted } };
    }
    case 'service:shutdown': {
      console.log('[BrowserService] Received shutdown command, gracefully terminating...');

      const response = { ok: true, body: { message: 'Browser service shutting down' } };

      // 内联关闭 wsServer，避免作用域问题
      setImmediate(async () => {
        try {
          if (wsServer) {
            await wsServer.stop().catch(() => {});
          }
          await manager.shutdown();
          console.log('[BrowserService] Shutdown complete');
          process.exit(0);
        } catch (err) {
          console.error('[BrowserService] Error during shutdown:', err);
          process.exit(1);
        }
      });

      return response;
    }
    case 'screenshot': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const buffer = await session.screenshot(!!args.fullPage);
      return { ok: true, body: { success: true, data: buffer.toString('base64') } };
    }
    case 'evaluate': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const script = args.script;
      if (!script || typeof script !== 'string') throw new Error('script (string) is required');
      const result = await session.evaluate(script);
      return { ok: true, body: { ok: true, result } };
    }
    case 'page:list': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const pages = session.listPages();
      const activeIndex = pages.find((p) => p.active)?.index ?? 0;
      return { ok: true, body: { ok: true, pages, activeIndex } };
    }
    case 'page:new':
    case 'newPage': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const url = args.url ? String(args.url) : undefined;
      const result = await session.newPage(url);
      broadcast('page:created', { profileId, index: result.index, url: result.url });
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'page:switch':
    case 'switchControl': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const index = Number(args.index);
      const result = await session.switchPage(index);
      broadcast('page:switched', { profileId, index: result.index, url: result.url });
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'page:close': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const hasIndex = typeof args.index !== 'undefined' && args.index !== null;
      const index = hasIndex ? Number(args.index) : undefined;
      const result = await session.closePage(index);
      broadcast('page:closed', { profileId, closedIndex: result.closedIndex, activeIndex: result.activeIndex });
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'page:back': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const result = await session.goBack();
      broadcast('page:navigated', { profileId, url: result.url, via: 'page:back' });
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'page:setViewport': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const width = Number(args.width);
      const height = Number(args.height);
      const size = await session.setViewportSize({ width, height });
      broadcast('page:viewport', { profileId, ...size });
      return { ok: true, body: { ok: true, ...size } };
    }
    case 'autoCookies:start': {
      const profileId = args.profileId || 'default';
      const interval = Math.max(1000, Number(args.intervalMs) || 2500);
      const existing = autoLoops.get(profileId);
      if (existing) clearInterval(existing);
      const timer = setInterval(async () => {
        const session = manager.getSession(profileId);
        if (!session) return;
        try {
          await session.saveCookiesForActivePage();
        } catch {}
      }, interval);
      autoLoops.set(profileId, timer);
      return { ok: true, body: { ok: true } };
    }
    case 'autoCookies:stop': {
      const profileId = args.profileId || 'default';
      const timer = autoLoops.get(profileId);
      if (timer) clearInterval(timer);
      autoLoops.delete(profileId);
      return { ok: true, body: { ok: true } };
    }
   case 'autoCookies:status': {
     const profileId = args.profileId || 'default';
     return { ok: true, body: { ok: !!autoLoops.get(profileId) } };
   }
    case 'mouse:click': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const { x, y, button, clicks, delay } = args;
      await session.mouseClick({ x: Number(x), y: Number(y), button, clicks, delay });
      return { ok: true, body: { ok: true } };
    }
    case 'mouse:move': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const { x, y, steps } = args;
      await session.mouseMove({ x: Number(x), y: Number(y), steps });
      return { ok: true, body: { ok: true } };
    }
    case 'mouse:wheel': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const { deltaY, deltaX } = args;
      await session.mouseWheel({ deltaY: Number(deltaY) || 0, deltaX: Number(deltaX) || 0 });
      return { ok: true, body: { ok: true } };
    }
    case 'keyboard:type': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const { text, delay, submit } = args;
      await session.keyboardType({
        text: String(text ?? ''),
        delay: typeof delay === 'number' ? delay : undefined,
        submit: !!submit,
      });
      return { ok: true, body: { ok: true } };
    }
    case 'keyboard:press': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      const { key, delay } = args;
      await session.keyboardPress({
        key: String(key ?? 'Enter'),
        delay: typeof delay === 'number' ? delay : undefined,
      });
      return { ok: true, body: { ok: true } };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function broadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const hostArg = process.argv.indexOf('--host');
  const portArg = process.argv.indexOf('--port');
  const wsPortArg = process.argv.indexOf('--ws-port');
  const wsHostArg = process.argv.indexOf('--ws-host');
  const busUrlArg = process.argv.indexOf('--bus-url');
  const disableWs = process.argv.includes('--no-ws');
  const host = hostArg >= 0 ? process.argv[hostArg + 1] : '127.0.0.1';
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 7704;
  const wsPort = wsPortArg >= 0 ? Number(process.argv[wsPortArg + 1]) : 8765;
  const wsHost = wsHostArg >= 0 ? process.argv[wsHostArg + 1] : '127.0.0.1';
  const busUrl = busUrlArg >= 0 ? process.argv[busUrlArg + 1] : undefined;
  startBrowserService({ host, port, wsHost, wsPort, enableWs: !disableWs, busUrl });
}
