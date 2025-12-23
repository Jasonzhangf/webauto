import http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { setTimeout as delay } from 'timers/promises';
import { SessionManager, CreateSessionPayload, SESSION_CLOSED_EVENT } from './SessionManager.js';
import { BrowserWsServer } from './ws-server.js';

type CommandPayload = { action: string; args?: any };

interface BrowserServiceOptions {
  host?: string;
  port?: number;
  enableWs?: boolean;
  wsPort?: number;
  wsHost?: string;
}

const clients = new Set<ServerResponse>();
const autoLoops = new Map<string, NodeJS.Timeout>();

export async function startBrowserService(opts: BrowserServiceOptions = {}) {
  const host = opts.host || '127.0.0.1';
  const port = Number(opts.port || 7704);
  const sessionManager = new SessionManager();
  const enableWs = opts.enableWs ?? process.env.BROWSER_SERVICE_DISABLE_WS !== '1';
  const wsHost = opts.wsHost || '127.0.0.1';
  const wsPort = Number(opts.wsPort || 8765);
  const autoExit = process.env.BROWSER_SERVICE_AUTO_EXIT === '1';

  const server = http.createServer(async (req, res) => {
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
          const result = await handleCommand(payload, sessionManager);
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
  });

  server.listen(port, host, () => {
    console.log(`BrowserService listening on http://${host}:${port}`);
  });

  const wsServer = enableWs ? new BrowserWsServer({ host: wsHost, port: wsPort, sessionManager }) : null;
  if (wsServer) {
    try {
      await wsServer.start();
    } catch (err) {
      console.warn('[browser-service] failed to start WebSocket server:', (err as Error).message);
    }
  }

  const shutdown = async () => {
    server.close();
    clients.forEach((client) => client.end());
    autoLoops.forEach((timer) => clearInterval(timer));
    if (wsServer) {
      await wsServer.stop().catch(() => {});
    }
    await sessionManager.shutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on(SESSION_CLOSED_EVENT as any, () => {
    if (autoExit && managerIsIdle(sessionManager)) {
      shutdown().finally(() => process.exit(0));
    }
  });
}

function managerIsIdle(manager: SessionManager) {
  return manager.listSessions().length === 0;
}

async function handleCommand(payload: CommandPayload, manager: SessionManager) {
  const action = payload.action;
  const args = payload.args ?? (payload as any);

  switch (action) {
    case 'start': {
      const opts: CreateSessionPayload = {
        profileId: args.profileId || 'default',
        sessionName: args.profileId || 'default',
        headless: !!args.headless,
        initialUrl: args.url,
      };
      const res = await manager.createSession(opts);
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
      const result = await session.saveCookiesToFile(args.path); // Profile 自动管理，不建议手动调用
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'saveCookiesIfStable': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      if (!args.path) throw new Error('path required');
      const result = await session.saveCookiesIfStable(args.path, { minDelayMs: args.minDelayMs }); // Profile 自动管理，不建议手动调用
      return { ok: true, body: { ok: true, saved: !!result, ...result } };
    }
    case 'loadCookies': {
      const profileId = args.profileId || 'default';
      const session = manager.getSession(profileId);
      if (!session) throw new Error(`session for profile ${profileId} not started`);
      if (!args.path) throw new Error('path required');
      const result = await session.injectCookiesFromFile(args.path); // Profile 自动管理，不建议手动调用
      return { ok: true, body: { ok: true, ...result } };
    }
    case 'getStatus': {
      return { ok: true, body: { ok: true, sessions: manager.listSessions() } };
    }
    case 'stop': {
      const profileId = args.profileId || 'default';
      const deleted = await manager.deleteSession(profileId);
      return { ok: true, body: { ok: deleted } };
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
    case 'newPage':
    case 'switchControl':
      return { ok: false, body: { error: 'not supported in TS service' } };
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
    case 'dom:pick:2': {
      // For now DOM pick is handled by controller via WS, not directly here.
      throw new Error('dom:pick:2 is handled by controller, /command should not call it directly');
    }
    case 'dom:branch:2': {
      const profileId = (args.profile as string) || (args.profileId as string) || 'default';
      const session = manager.getSession(profileId);
      if (!session) {
        throw new Error(`session for profile ${profileId} not started`);
      }
      // Forward to controller via WS for DOM branch loading
      throw new Error('dom:branch:2 is handled via controller; call controller ui:action dom:branch:2 instead');
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

if (import.meta.url === process.argv[1]) {
  const hostArg = process.argv.indexOf('--host');
  const portArg = process.argv.indexOf('--port');
  const wsPortArg = process.argv.indexOf('--ws-port');
  const wsHostArg = process.argv.indexOf('--ws-host');
  const disableWs = process.argv.includes('--no-ws');
  const host = hostArg >= 0 ? process.argv[hostArg + 1] : '127.0.0.1';
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 7704;
  const wsPort = wsPortArg >= 0 ? Number(process.argv[wsPortArg + 1]) : 8765;
  const wsHost = wsHostArg >= 0 ? process.argv[wsHostArg + 1] : '127.0.0.1';
  startBrowserService({ host, port, wsHost, wsPort, enableWs: !disableWs });
}
