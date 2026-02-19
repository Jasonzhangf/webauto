import { logDebug } from '../../modules/logging/src/index.js';
import { UiController } from '../../services/controller/src/controller.js';
import { handleContainerOperations } from './container-operations-handler.js';
// @ts-ignore
// import { setupContainerOperationsRoutes } from './container-operations.mjs';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { RemoteSessionManager } from './RemoteSessionManager.js';
import { ensureBuiltinOperations } from '../../modules/operations/src/builtin.js';
import { getContainerExecutor } from '../../modules/operations/src/executor.js';
import { installServiceProcessLogger } from '../shared/serviceProcessLogger.js';
import { startHeartbeatWatcher } from '../shared/heartbeat.js';
import { taskStateRegistry } from './task-state.js';
import { saveTaskSnapshot, appendEvent } from './task-persistence.js';

// Ensure builtin operations are registered before handling any operations
ensureBuiltinOperations();
import { getStateRegistry } from './state-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { logEvent } = installServiceProcessLogger({ serviceName: 'unified-api' });

const DEFAULT_PORT = Number(process.env.WEBAUTO_UNIFIED_PORT || 7701);
const DEFAULT_HOST = process.env.WEBAUTO_UNIFIED_HOST || '127.0.0.1';

// 注意：运行时 server.js 位于 dist/services/unified-api/，因此需要回退三级到仓库根目录
// 源码构建时同样兼容（__dirname 为 services/unified-api/），此写法在两种场景下都能得到仓库根目录
const repoRoot = path.resolve(__dirname, '../../..');
const userContainerRoot = process.env.WEBAUTO_USER_CONTAINER_ROOT || path.join(os.homedir(), '.webauto', 'container-lib');
const containerIndexPath = process.env.WEBAUTO_CONTAINER_INDEX || path.join(repoRoot, 'apps/webauto/resources/container-library.index.json');
const defaultWsHost = process.env.WEBAUTO_WS_HOST || '127.0.0.1';
const defaultWsPort = Number(process.env.WEBAUTO_WS_PORT || 8765);
const defaultHttpHost = process.env.WEBAUTO_BROWSER_HTTP_HOST || '127.0.0.1';
const defaultHttpPort = Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || 7704);
const defaultHttpProtocol = process.env.WEBAUTO_BROWSER_HTTP_PROTO || 'http';
const cliTargets = {
  'session-manager': path.join(repoRoot, 'dist/modules/session-manager/src/cli.js'),
  logging: path.join(repoRoot, 'dist/modules/logging/src/cli.js'),
  operations: path.join(repoRoot, 'dist/modules/operations/src/cli.js'),
};

startHeartbeatWatcher({ serviceName: 'unified-api' });

class UnifiedApiServer {
  private controller: UiController;
  private wsClients: Set<WebSocket>;
  private busClients: Set<WebSocket>;
  private subscriptions: Map<WebSocket, Set<string>>;
  private containerSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private containerExecutor: any;
  private sessionManager: any;
  private stateRegistry: any;
  private taskRegistry = taskStateRegistry;

  constructor() {
    this.controller = new UiController({
      repoRoot,
      userContainerRoot,
      containerIndexPath,
      cliTargets,
      defaultWsHost,
      defaultWsPort,
      defaultHttpHost,
      defaultHttpPort,
      defaultHttpProtocol,
      messageBus: {
        publish: (topic: string, payload: any) => {
          this.broadcastEvent(topic, payload);
        },
      },
    });

    this.wsClients = new Set();
    this.busClients = new Set();
    this.subscriptions = new Map();

    // Initialize state registry
    this.stateRegistry = getStateRegistry();
    this.setupTaskRoutes();
  }

    private broadcastEvent(topic: string, payload: any): void {
    const message = {
      type: 'event',
      topic,
      payload,
      timestamp: Date.now()
    };

    this.wsClients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, message);
      }
    });
    
    // Also broadcast to bus clients so they receive events
    this.busClients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, message);
      }
    });
  }

  private addSubscription(socket: WebSocket, topic: string) {
    const current = this.subscriptions.get(socket) || new Set();
    current.add(topic);
    this.subscriptions.set(socket, current);
    
    if (topic.startsWith('container:')) {
      const containerId = topic.replace('container:', '');
      this.handleContainerSubscription(containerId, socket);
    }
    
    this.safeSend(socket, { type: 'subscription:confirmed', topic });
  }

  private removeSubscription(socket: WebSocket, topic?: string) {
    if (!topic) {
      this.subscriptions.delete(socket);
      for (const [cid, subs] of this.containerSubscriptions.entries()) {
        subs.delete(socket);
        if (subs.size === 0) this.containerSubscriptions.delete(cid);
      }
      return;
    }

    const current = this.subscriptions.get(socket);
    if (!current) return;
    current.delete(topic);
    
    if (topic.startsWith('container:')) {
      const containerId = topic.replace('container:', '');
      this.removeContainerSubscription(containerId, socket);
    }

    if (current.size === 0) {
      this.subscriptions.delete(socket);
    } else {
      this.subscriptions.set(socket, current);
    }
    this.safeSend(socket, { type: 'subscription:removed', topic });
  }

  private handleContainerSubscription(containerId: string, socket: WebSocket | null): void {
    if (!socket) return;

    if (!this.containerSubscriptions.has(containerId)) {
      this.containerSubscriptions.set(containerId, new Set());
    }
    this.containerSubscriptions.get(containerId)!.add(socket);
    
    this.safeSend(socket, {
      type: 'subscription:confirmed',
      containerId,
      timestamp: Date.now()
    });
  }

  private removeContainerSubscription(containerId: string, socket: WebSocket): void {
    const subscriptions = this.containerSubscriptions.get(containerId);
    if (subscriptions) {
      subscriptions.delete(socket);
      if (subscriptions.size === 0) {
        this.containerSubscriptions.delete(containerId);
      }
    }
  }

  private pushContainerState(containerId: string, state: any): void {
    const subscribers = this.containerSubscriptions.get(containerId);
    if (subscribers) {
      const message = {
        type: 'container:state:updated',
        containerId,
        state,
        timestamp: Date.now()
      };
      
      subscribers.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          this.safeSend(socket, message);
        }
      });
    }
  }

  private matchesTopic(pattern: string, topic: string) {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(topic);
  }

  private shouldDeliver(socket: WebSocket, topic: string) {
    const subs = this.subscriptions.get(socket);
    if (!subs || subs.size === 0) return false;
    for (const pattern of subs) {
      if (this.matchesTopic(pattern, topic)) return true;
    }
    return false;
  }

  async readJsonBody(req: any) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  }

  async start() {
    // Start state registry periodic cleanup
    const registry = this.stateRegistry;
    if (registry) {
      setInterval(() => {
        try {
          registry.cleanupOldSessions();
        } catch (err) {
          console.warn('[unified-api] stateRegistry cleanup failed:', err?.message || err);
          logEvent('stateRegistry.cleanupOldSessions.error', {
            error: { message: err?.message || String(err) },
          });
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
    const { createServer } = await import('node:http');
    const server = createServer();
    const wss = new WebSocketServer({ server });

    // Initialize builtin operations
    ensureBuiltinOperations();

    // Session manager for container operations
    // 使用 RemoteSessionManager 代理对 Browser Service 的调用
    const browserServiceUrl = `${defaultHttpProtocol}://${defaultHttpHost}:${defaultHttpPort}`;
    console.log(`[unified-api] Using remote browser service at ${browserServiceUrl}`);
    const sessionManager = new RemoteSessionManager({
      host: defaultHttpHost,
      port: defaultHttpPort,
      wsHost: defaultWsHost,
      wsPort: defaultWsPort
    });
    this.sessionManager = sessionManager;

    // Sync sessions to state registry
    try {
      const sessions = await sessionManager.listSessions();
      console.log('[unified-api] Initial session sync:', sessions);
      if (Array.isArray(sessions)) {
        sessions.forEach((session: any) => {
          const profileId = session.profileId || session.profile_id || session.sessionId || session.session_id;
          if (!profileId) return;
          this.stateRegistry.updateSessionState(profileId, {
            profileId,
            sessionId: session.sessionId || session.session_id || profileId,
            currentUrl: session.currentUrl || session.current_url || '',
          });
        });
        this.stateRegistry.flush();
      }
    } catch (err) {
      console.warn('[unified-api] session sync failed:', err?.message || err);
    }

    // Container operations executor (fills selector + merges container op config)
    this.containerExecutor = getContainerExecutor();

    // HTTP routes - unified request handler
    server.on('request', (req, res) => {
      void (async () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const normalizeTaskPhase = (value: any) => {
          const text = String(value || '').trim().toLowerCase();
          if (text === 'phase1' || text === 'phase2' || text === 'phase3' || text === 'phase4' || text === 'unified' || text === 'orchestrate') {
            return text;
          }
          return 'unknown';
        };
        const normalizeTaskStatus = (value: any) => {
          const text = String(value || '').trim().toLowerCase();
          if (text === 'starting' || text === 'running' || text === 'paused' || text === 'completed' || text === 'failed' || text === 'aborted') {
            return text;
          }
          return '';
        };
        const ensureTask = (runId: string, seed: any = {}) => {
          const normalizedRunId = String(runId || '').trim();
          if (!normalizedRunId) return null;
          const existing = this.taskRegistry.getTask(normalizedRunId);
          if (existing) return existing;
          const profileId = String(seed?.profileId || 'unknown').trim() || 'unknown';
          const keyword = String(seed?.keyword || '').trim();
          const phase = normalizeTaskPhase(seed?.phase);
          return this.taskRegistry.createTask({
            runId: normalizedRunId,
            profileId,
            keyword,
            phase,
          });
        };
        const applyTaskPatch = (runId: string, payload: any = {}) => {
          const normalizedRunId = String(runId || '').trim();
          if (!normalizedRunId) return;
          ensureTask(normalizedRunId, payload);
          const phase = normalizeTaskPhase(payload?.phase);
          const profileId = String(payload?.profileId || '').trim();
          const keyword = String(payload?.keyword || '').trim();
          const details = payload?.details && typeof payload.details === 'object' ? payload.details : undefined;
          const patch: any = {};
          if (phase !== 'unknown') patch.phase = phase;
          if (profileId) patch.profileId = profileId;
          if (keyword) patch.keyword = keyword;
          if (details) patch.details = details;
          if (Object.keys(patch).length > 0) {
            this.taskRegistry.updateTask(normalizedRunId, patch);
          }
          if (payload?.progress && typeof payload.progress === 'object') {
            this.taskRegistry.updateProgress(normalizedRunId, payload.progress);
          }
          if (payload?.stats && typeof payload.stats === 'object') {
            this.taskRegistry.updateStats(normalizedRunId, payload.stats);
          }
          const status = normalizeTaskStatus(payload?.status);
          if (status) {
            this.taskRegistry.setStatus(normalizedRunId, status as any);
          }
          const errorPayload = payload?.error && typeof payload.error === 'object'
            ? payload.error
            : (payload?.lastError && typeof payload.lastError === 'object' ? payload.lastError : null);
          if (errorPayload) {
            this.taskRegistry.setError(normalizedRunId, {
              message: String(errorPayload.message || 'task_error'),
              code: String(errorPayload.code || 'TASK_ERROR'),
              timestamp: Number(errorPayload.timestamp || Date.now()),
              recoverable: Boolean(errorPayload.recoverable),
            });
          }
        };

        // Container operations endpoints
      const containerHandled = await handleContainerOperations(req, res, sessionManager, this.containerExecutor);
      if (containerHandled) return;

      // Task state API endpoints
      if (req.method === 'POST' && url.pathname === '/api/v1/tasks') {
        try {
          const payload = await this.readJsonBody(req);
          const runId = String(payload?.runId || payload?.id || '').trim();
          if (!runId) throw new Error('runId is required');
          ensureTask(runId, payload);
          applyTaskPatch(runId, payload);
          const task = this.taskRegistry.getTask(runId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: task }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/tasks') {
        const tasks = this.taskRegistry.getAllTasks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: tasks }));
        return;
      }

      if (req.method === 'GET' && url.pathname.includes('/api/v1/tasks/') && url.pathname.includes('/events')) {
        const parts = url.pathname.split('/');
        const tasksIndex = parts.indexOf('tasks');
        const runId = parts[tasksIndex + 1];
        const since = url.searchParams.get('since');
        const events = this.taskRegistry.getEvents(runId, since ? Number(since) : undefined);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: events }));
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/v1/tasks/')) {
        const parts = url.pathname.split('/');
        const runId = parts[parts.length - 1];
        const task = this.taskRegistry.getTask(runId);
        if (!task) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Task not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: task }));
        return;
      }

      if (req.method === 'POST' && url.pathname.includes('/api/v1/tasks/') && url.pathname.includes('/update')) {
        const parts = url.pathname.split('/');
        const tasksIndex = parts.indexOf('tasks');
        const runId = parts[tasksIndex + 1];
        try {
          const payload = await this.readJsonBody(req);
          applyTaskPatch(runId, payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'POST' && url.pathname.includes('/api/v1/tasks/') && url.pathname.includes('/events')) {
        const parts = url.pathname.split('/');
        const tasksIndex = parts.indexOf('tasks');
        const runId = parts[tasksIndex + 1];
        try {
          const event = await this.readJsonBody(req);
          ensureTask(runId, event?.data || {});
          this.taskRegistry.pushEvent(runId, event.type, event.data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'POST' && url.pathname.includes('/api/v1/tasks/') && url.pathname.includes('/control')) {
        const parts = url.pathname.split('/');
        const tasksIndex = parts.indexOf('tasks');
        const runId = parts[tasksIndex + 1];
        const action = url.searchParams.get('action');
        try {
          ensureTask(runId, {});
          if (action === 'pause') {
            this.taskRegistry.setStatus(runId, 'paused');
          } else if (action === 'resume') {
            this.taskRegistry.setStatus(runId, 'running');
          } else if (action === 'stop') {
            this.taskRegistry.setStatus(runId, 'aborted');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/v1/tasks/')) {
        const parts = url.pathname.split('/');
        const runId = parts[parts.length - 1];
        const deleted = this.taskRegistry.deleteTask(runId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { deleted } }));
        return;
      }

      // 健康检查
      if (url.pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, service: 'unified-api', timestamp: new Date().toISOString() }));
          return;
        }

        // Controller actions
        if (req.method === 'POST' && url.pathname === '/v1/controller/action') {
          try {
            const payload = await this.readJsonBody(req);
            const action = payload?.action;
            if (!action) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Missing action' }));
              return;
            }
            const result = await this.controller.handleAction(action, payload.payload || {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.normalizeResult(result)));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
          }
          return;
        }

      // Health check for browser service
      if (req.method === 'GET' && url.pathname === '/v1/browser/health') {
        try {
          const result = await this.controller.handleAction('browser:status', {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      // System state endpoints
      if (req.method === 'GET' && url.pathname === '/v1/system/state') {
        const state = this.stateRegistry.getState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: state }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/system/sessions') {
        const profileId = url.searchParams.get('profileId');
        const sessions = this.stateRegistry.getAllSessionStates();
        if (profileId) {
          const session = sessions[profileId];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: session ? [session] : [] }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: Object.values(sessions) }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/system/sessionPhase') {
        try {
          const payload = await this.readJsonBody(req);
          const profileId = payload?.profileId;
          const phase = payload?.phase;
          if (!profileId || !phase) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Missing profileId or phase' }));
            return;
          }
          this.stateRegistry.updateSessionState(profileId, { lastPhase: phase });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      // WebSocket endpoints
      if (url.pathname === '/ws' || url.pathname === '/bus') {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('Upgrade Required');
        return;
      }

        // Not found
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      })().catch((err) => {
        // IMPORTANT: http server doesn't await async handlers; ensure no unhandledRejection kills the service.
        logEvent('http.request.error', {
          method: req?.method,
          url: req?.url,
          error: { message: err?.message || String(err), stack: err?.stack },
        });
        try {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
        } catch {
          // ignore
        }
      });
    });

    // WebSocket event handling
    wss.on('connection', (socket, request) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      
      if (url.pathname === '/ws') {
        this.wsClients.add(socket);
        socket.on('message', (raw) => {
          let message: any;
          try {
            message = JSON.parse(raw.toString());
          } catch {
            this.safeSend(socket, { type: 'error', error: 'Invalid JSON payload' });
            return;
          }

          if (message?.type === 'subscribe' && message.topic) {
            this.addSubscription(socket, message.topic);
            return;
          }

          if (message?.type === 'unsubscribe' && message.topic) {
            this.removeSubscription(socket, message.topic);
            return;
          }

          void this.handleMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any)).catch((err) => {
            logEvent('ws.handleMessage.error', {
              error: { message: err?.message || String(err), stack: err?.stack },
            });
          });
        });
        socket.on('close', () => {
          this.wsClients.delete(socket);
          this.removeSubscription(socket);
        });
        socket.on('error', () => {
          this.wsClients.delete(socket);
          this.removeSubscription(socket);
        });
        this.safeSend(socket, { type: 'ready' });
      } else if (url.pathname === '/bus') {
        this.busClients.add(socket);
        socket.on('message', (raw) => {
          void this.handleBusMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any)).catch((err) => {
            logEvent('ws.handleBusMessage.error', {
              error: { message: err?.message || String(err), stack: err?.stack },
            });
          });
        });
        socket.on('close', () => this.busClients.delete(socket));
        socket.on('error', () => this.busClients.delete(socket));
        this.safeSend(socket, { type: 'ready' });
      }
    });

    // Start server
    const host = DEFAULT_HOST;
    const port = DEFAULT_PORT;
    server.listen(port, host, () => {
      console.log(`[unified-api] Server running at http://${host}:${port}`);
      console.log(`[unified-api] WebSocket endpoint: ws://${host}:${port}/ws`);
      console.log(`[unified-api] Bus endpoint: ws://${host}:${port}/bus`);
    });
  }

  async handleMessage(socket: WebSocket, raw: Buffer) {
    let envelope;
    try {
      envelope = JSON.parse(raw.toString());
    } catch (err) {
      this.safeSend(socket, { type: 'error', error: 'Invalid JSON payload' });
      return;
    }

    if (!envelope) return;
    console.log('[unified-api] recv', envelope.type || 'unknown', envelope.action || envelope.topic || '');

    if (envelope.type === 'ping') {
      this.safeSend(socket, { type: 'pong', requestId: envelope.requestId });
      return;
    }

    if (envelope.type === 'action' || envelope.action) {
      const action = envelope.action;
      const payload = envelope.payload || {};
      const requestId = envelope.requestId || envelope.id;
      
      if (!action) {
        this.safeSend(socket, { type: 'response', requestId, success: false, error: 'Missing action' });
        return;
      }

      try {
        const result = await this.controller.handleAction(action, payload);
        console.log('[unified-api] action result', action, !!result && typeof result);
        this.safeSend(socket, { type: 'response', action, requestId, ...this.normalizeResult(result) });
      } catch (err) {
        console.warn('[unified-api] action failed', action, err?.message || err);
        this.safeSend(socket, { type: 'response', action, requestId, success: false, error: err?.message || String(err) });
      }
      return;
    }

    this.safeSend(socket, { type: 'error', requestId: envelope.requestId, error: 'Unsupported message type' });
  }

  async handleBusMessage(socket: WebSocket, raw: Buffer) {
    this.broadcastEvent('bus.message', { data: raw.toString(), timestamp: new Date().toISOString() });
  }

  safeSend(socket: WebSocket, payload: any) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[unified-api] send failed', err?.message || err);
      logEvent('ws.send.error', {
        error: { message: err?.message || String(err), stack: err?.stack },
        payloadType: typeof payload,
      });
    }
  }

  normalizeResult(result: any) {
    if (!result || typeof result !== 'object') return { success: true, data: result };
    if (typeof result.success === 'boolean') return result;
    return { success: true, data: result };
  }

  private setupTaskRoutes(): void {
    // Subscribe to task state updates and broadcast to WebSocket clients
    this.taskRegistry.subscribe((update) => {
      const message = {
        type: 'task:update',
        data: update,
        timestamp: Date.now()
      };
      this.wsClients.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          this.safeSend(socket, message);
        }
      });
      // Persist to disk
      if (update.type === 'event') {
        appendEvent(update.data);
      } else {
        const task = this.taskRegistry.getTask(update.runId);
        if (task) saveTaskSnapshot(task);
      }
    });
  }
}

// ============================================================================
// Global Error Handlers (防止进程静默退出)
// ============================================================================

// 捕获未处理的 Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unified-api] UNHANDLED PROMISE REJECTION:', reason);
  logEvent('process.unhandledRejection', {
    reason: String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise),
  });
  // 不退出进程，只记录错误
});

// 捕获未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('[unified-api] UNCAUGHT EXCEPTION:', err);
  logEvent('process.uncaughtException', {
    error: { message: err?.message || String(err), stack: err?.stack },
  });
  // 不立即退出，给现有请求完成的机会
  setTimeout(() => {
    console.error('[unified-api] Exiting due to uncaught exception');
    process.exit(1);
  }, 5000);
});

// 监听进程退出信号
process.on('SIGTERM', () => {
  console.log('[unified-api] Received SIGTERM, shutting down gracefully');
  logEvent('process.SIGTERM', {});
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGINT', () => {
  console.log('[unified-api] Received SIGINT, shutting down gracefully');
  logEvent('process.SIGINT', {});
  setTimeout(() => process.exit(0), 1000);
});

// ============================================================================
// Start Server
// ============================================================================

const server = new UnifiedApiServer();
server.start().catch(err => {
  console.error('[unified-api] Server failed to start:', err);
  logEvent('server.start.error', {
    error: { message: err?.message || String(err), stack: err?.stack },
  });
  process.exit(1);
});
