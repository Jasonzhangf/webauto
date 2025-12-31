
import { UiController } from '../../services/controller/src/controller.js';
import { WebSocketServer, WebSocket } from 'ws';
import { EventBus, globalEventBus } from '../../libs/operations-framework/src/event-driven/EventBus.js';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = Number(process.env.WEBAUTO_UNIFIED_PORT || 7701);
const DEFAULT_HOST = process.env.WEBAUTO_UNIFIED_HOST || '127.0.0.1';

const repoRoot = path.resolve(__dirname, '../..');
const userContainerRoot = process.env.WEBAUTO_USER_CONTAINER_ROOT || path.join(os.homedir(), '.webauto', 'container-lib');
const containerIndexPath = process.env.WEBAUTO_CONTAINER_INDEX || path.join(repoRoot, 'container-library.index.json');
const defaultWsHost = process.env.WEBAUTO_WS_HOST || '127.0.0.1';
const defaultWsPort = Number(process.env.WEBAUTO_WS_PORT || 8765);
const defaultHttpHost = process.env.WEBAUTO_BROWSER_HTTP_HOST || '127.0.0.1';
const defaultHttpPort = Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || 7704);
const defaultHttpProtocol = process.env.WEBAUTO_BROWSER_HTTP_PROTO || 'http';
const cliTargets = {
  'browser-control': path.join(repoRoot, 'modules/browser-control/src/cli.ts'),
  'session-manager': path.join(repoRoot, 'modules/session-manager/src/cli.ts'),
  logging: path.join(repoRoot, 'modules/logging/src/cli.ts'),
  operations: path.join(repoRoot, 'modules/operations/src/cli.ts'),
  'container-matcher': path.join(repoRoot, 'modules/container-matcher/src/cli.ts'),
};

class UnifiedApiServer {
  private controller: UiController;
  private wsClients: Set<WebSocket>;
  private busClients: Set<WebSocket>;
  private subscriptions: Map<WebSocket, Set<string>>;
  private eventBus: EventBus;
  private containerSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private lastHandshakePayload: any = null;

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
          this.broadcastBusEvent(topic, payload);
        },
      },
    });


    this.wsClients = new Set();
    this.busClients = new Set();
    this.subscriptions = new Map();
    this.eventBus = globalEventBus;
    this.setupEventBridge();
  }

  private setupEventBridge(): void {
    // Listen for all container events and forward
    this.eventBus.on('container:*', (data) => {
      this.broadcastEvent('container:event', data);
    });

    // Listen for operation events
    this.eventBus.on('operation:*', (data) => {
      this.broadcastEvent('operation:event', data);
    });

    // Listen for system events
    this.eventBus.on('system:*', (data) => {
      this.broadcastEvent('system:event', data);
    });

    this.eventBus.on('browser.runtime.event', (data) => {
      this.forwardRuntimeEvent('browser.runtime.event', data);
      if (data?.type === 'handshake.status') {
        this.broadcastBusEvent('handshake.status', data);
      }
    });

    this.eventBus.on('browser.runtime.handshake.status', (data) => {
      this.forwardRuntimeEvent('browser.runtime.handshake.status', data);
      this.broadcastBusEvent('handshake.status', data);
    });
  }

  private forwardRuntimeEvent(topic: string, payload: any): void {
    this.broadcastEvent(topic, payload);
    this.broadcastBusEvent(topic, payload);
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
  }

  private addSubscription(socket: WebSocket, topic: string) {
    const current = this.subscriptions.get(socket) || new Set();
    current.add(topic);
    this.subscriptions.set(socket, current);
    
    // Handle container specific subscription logic if needed
    if (topic.startsWith('container:')) {
      const containerId = topic.replace('container:', '');
      this.handleContainerSubscription(containerId, socket);
    }
    
    this.safeSend(socket, { type: 'subscription:confirmed', topic });
  }

  private removeSubscription(socket: WebSocket, topic?: string) {
    if (!topic) {
      // Remove all subscriptions for this socket
      this.subscriptions.delete(socket);
      // Also clean up from container subscriptions
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
    // If socket is null, it's just an HTTP registration without immediate WebSocket attachment
    // In a real implementation, we might want to store pending subscriptions
    if (!socket) return;

    if (!this.containerSubscriptions.has(containerId)) {
      this.containerSubscriptions.set(containerId, new Set());
    }
    this.containerSubscriptions.get(containerId)!.add(socket);
    
    // Acknowledge container subscription via WebSocket
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
    const { createServer } = await import('node:http');
    const server = createServer();
    const wss = new WebSocketServer({ server });

    // HTTP 路由
    server.on('request', async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      
      // 健康检查
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'unified-api', timestamp: new Date().toISOString() }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/browser/highlight') {
        try {
          const payload = await this.readJsonBody(req);
          const result = await this.controller.handleAction('browser:highlight', payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.normalizeResult(result)));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

     if (req.method === 'POST' && url.pathname === '/v1/browser/highlight-dom-path') {
       try {
         const payload = await this.readJsonBody(req);
         const result = await this.controller.handleAction('browser:highlight-dom-path', payload);
         res.writeHead(200, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify(this.normalizeResult(result)));
       } catch (err) {
         res.writeHead(400, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
       }
       return;
     }

      if (req.method === 'POST' && url.pathname === '/v1/browser/clear-highlight') {
        try {
          const payload = await this.readJsonBody(req);
          const result = await this.controller.handleAction('browser:clear-highlight', payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.normalizeResult(result)));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/browser/execute') {
        try {
          const payload = await this.readJsonBody(req);
          const result = await this.controller.handleAction('browser:execute', payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.normalizeResult(result)));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

     if (req.method === 'POST' && url.pathname === '/v1/session/create') {
        try {
          const payload = await this.readJsonBody(req);
          const result = await this.controller.handleAction('session:create', payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.normalizeResult(result)));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/session/list') {
        try {
          const result = await this.controller.handleAction('session:list', {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.normalizeResult(result)));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/container/match') {
        try {
          const payload = await this.readJsonBody(req);
          const result = await this.controller.handleAction('containers:match', payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.normalizeResult(result)));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
        return;
      }

      // Container state subscription (Step 3)
      if (req.method === 'POST' && url.pathname.match(/\/v1\/container\/[^\/]+\/subscribe/)) {
         try {
            // Extract container ID from URL
            const match = url.pathname.match(/\/v1\/container\/([^\/]+)\/subscribe/);
            const containerId = match ? match[1] : null;
            if (!containerId) throw new Error('Container ID not found');

            const payload = await this.readJsonBody(req);
            
            // Register to subscription manager
            // Note: WebSocket session needs to be retrieved from context if possible, 
            // otherwise client should subscribe via WebSocket directly
            this.handleContainerSubscription(containerId, null);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Subscribed to container ${containerId} status`, containerId }));
         } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
         }
         return;
      }

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

      // WebSocket 端点
      if (url.pathname === '/ws' || url.pathname === '/bus') {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('Upgrade Required');
        return;
      }

      // 未找到
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    // WebSocket 事件处理
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

          this.handleMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any));
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
        socket.on('message', (raw) => this.handleBusMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any)));
        socket.on('close', () => this.busClients.delete(socket));
        socket.on('error', () => this.busClients.delete(socket));
        this.safeSend(socket, { type: 'ready' });
        if (this.lastHandshakePayload) {
          this.safeSend(socket, { type: 'event', topic: 'handshake.status', payload: this.lastHandshakePayload });
        }
      }
    });

    // 启动服务器
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
    // Bus 消息直接转发到所有客户端
    this.broadcastBusEvent('bus.message', { data: raw.toString(), timestamp: new Date().toISOString() });
  }

  broadcastBusEvent(topic: string, payload: any) {
    if (topic === 'handshake.status') {
      this.lastHandshakePayload = payload;
    }
    this.busClients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, { type: 'event', topic, payload });
      }
    });

    this.wsClients.forEach((socket) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (!this.shouldDeliver(socket, topic)) return;
      this.safeSend(socket, { type: 'event', topic, payload });
    });
  }

  safeSend(socket: WebSocket, payload: any) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[unified-api] send failed', err?.message || err);
    }
  }

  normalizeResult(result: any) {
    if (!result || typeof result !== 'object') return { success: true, data: result };
    if (typeof result.success === 'boolean') return result;
    return { success: true, data: result };
  }
}

// 启动服务器
const server = new UnifiedApiServer();
server.start().catch(err => {
  console.error('[unified-api] Server failed to start:', err);
  process.exit(1);
});
