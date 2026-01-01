#!/usr/bin/env node
import { UiController } from '../../services/controller/src/controller.js';
import { WebSocketServer, WebSocket } from 'ws';
// 使用构建后的 ESM 版本，避免直接引用 TS 源文件
import { EventBus } from '../../libs/operations-framework/dist/event-driven/EventBus.js';
import { BindingRegistry } from '../../libs/containers/src/binding/BindingRegistry.js';
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
  constructor() {
    // Create EventBus and BindingRegistry
    this.eventBus = new EventBus({ historyLimit: 1000 });
    this.bindingRegistry = new BindingRegistry(this.eventBus);

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
        publish: (topic, payload) => {
          // Emit to EventBus
          this.eventBus.emit(topic, payload, 'UiController').catch(err => {
            console.error('[unified-api] EventBus emit failed:', err);
          });
          
          // Broadcast to WebSocket clients
          this.broadcastBusEvent(topic, payload);
        },
      },
    });

    // Setup event listeners for container operations
    this.setupEventListeners();
    
    this.clients = new Set();
    this.lastHandshakePayload = null;
  }

  async readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  }

  setupEventListeners() {
    // Listen to container:discovered events and execute bound operations
    this.eventBus.on('container:*:discovered', async (data) => {
      console.log('[unified-api] Container discovered:', data.containerId);
      
      // Find and execute binding rules
      const rules = this.bindingRegistry.findRulesByTrigger('event', 'container:*:discovered');
      for (const rule of rules) {
        try {
          await this.bindingRegistry.executeRule(rule, { 
            ...data,
            graph: { lastDiscoveredId: data.containerId }
          });
        } catch (err) {
          console.error('[unified-api] Failed to execute binding rule:', err);
        }
      }
    });

    // Listen to operation:execute events
    this.eventBus.on('operation:*:execute', async (data) => {
      console.log('[unified-api] Operation execute request:', data.operationType, 'on', data.containerId);
      
      // Execute the operation via controller
      try {
        const result = await this.controller.handleAction('operations:run', {
          op: data.operationType,
          config: data.config,
          containerId: data.containerId,
          sessionId: data.sessionId
        });
        console.log('[unified-api] Operation executed:', result);
      } catch (err) {
        console.error('[unified-api] Operation execution failed:', err);
      }
    });
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
        this.clients.add(socket);
        socket.on('message', (raw) => this.handleMessage(socket, raw));
        socket.on('close', () => this.clients.delete(socket));
        socket.on('error', () => this.clients.delete(socket));
        this.safeSend(socket, { type: 'ready' });
      } else if (url.pathname === '/bus') {
        this.clients.add(socket);
        socket.on('message', (raw) => this.handleBusMessage(socket, raw));
        socket.on('close', () => this.clients.delete(socket));
        socket.on('error', () => this.clients.delete(socket));
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

  async handleMessage(socket, raw) {
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
      const payload = { ...(envelope.payload || {}) };
      const requestId = envelope.requestId || envelope.id;
      
      // 兼容 WebSocket 调用使用 session_id / profile_id 的情况，
      // 统一归一到 controller 期望的字段名。
      if (payload && typeof payload === 'object') {
        if (payload.session_id && !payload.sessionId) {
          payload.sessionId = payload.session_id;
        }
        if (payload.profile_id && !payload.profile && !payload.profileId) {
          payload.profile = payload.profile_id;
        }
      }
      
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

  async handleBusMessage(socket, raw) {
    // Bus 消息直接转发到所有客户端
    this.broadcastBusEvent('bus.message', { data: raw.toString(), timestamp: new Date().toISOString() });
  }

  broadcastBusEvent(topic, payload) {
    if (topic === 'handshake.status') {
      this.lastHandshakePayload = payload;
    }
    const message = JSON.stringify({ type: 'event', topic, payload });
    this.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, { type: 'event', topic, payload });
      }
    });
  }

  safeSend(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[unified-api] send failed', err?.message || err);
    }
  }

  normalizeResult(result) {
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
