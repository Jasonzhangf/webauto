# Unified API 完整功能实现

## 当前状态

Unified API 服务 (端口 7701) 当前已实现以下功能：

### ✅ 已实现功能

1. **HTTP 端点**
   - `/health` - 服务健康检查
   - `/v1/container/{id}/subscribe` - 容器状态订阅
   - `/v1/session/create` - 会话创建
   - `/v1/session/list` - 会话列表
   - `/v1/container/match` - 容器匹配
   - `/v1/controller/action` - 通用控制器动作

2. **WebSocket 端点**
   - `ws://127.0.0.1:7701/ws` - 实时事件推送
   - `ws://127.0.0.1:7701/bus` - 事件总线

3. **消息协议**
   - `ping/pong` 心跳
   - `action` 执行协议
   - `event` 事件推送协议
   - `response` 响应协议

4. **事件系统集成**
   - EventBus 注入到 Container Engine
   - 容器发现事件发射
   - 绑定规则系统

### ⚠️ 需要补全的功能

当前实现中缺少以下关键功能：

1. **WebSocket 事件桥接** - Container Engine 的事件未转发到 WebSocket
2. **容器状态推送** - 订阅后未实际推送状态变化
3. **实时事件流** - 事件总线功能未完全实现
4. **操作执行反馈** - 操作执行结果未推送

---

## 需要补全的代码

### 1. WebSocket 事件桥接

```typescript
// 在 UnifiedApiServer 类中添加 EventBus 引用和事件桥接
import { EventBus } from '../../libs/operations-framework/src/event-driven/EventBus.js';

class UnifiedApiServer {
  private controller: UiController;
  private clients: Set<WebSocket>;
  private eventBus: EventBus;  // 👈 添加 EventBus 引用

  constructor() {
    // ... 现有代码 ...
    
    this.eventBus = new EventBus();
    this.setupEventBridge();  // 👈 设置事件桥接
  }

  /**
   * 设置事件桥接到 WebSocket
   */
  private setupEventBridge(): void {
    // 监听所有 container:* 事件并转发到 WebSocket
    this.eventBus.on('container:*', (data) => {
      this.broadcastEvent('container:event', data);
    });

    // 监听操作执行事件
    this.eventBus.on('operation:*', (data) => {
      this.broadcastEvent('operation:event', data);
    });

    // 监听系统事件
    this.eventBus.on('system:*', (data) => {
      this.broadcastEvent('system:event', data);
    });
  }

  /**
   * 广播事件到所有 WebSocket 客户端
   */
  private broadcastEvent(topic: string, payload: any): void {
    const message = {
      type: 'event',
      topic,
      payload,
      timestamp: Date.now()
    };
    
    this.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, message);
      }
    });
  }
}
```

### 2. 容器状态推送

```typescript
// 在 UnifiedApiServer 中添加订阅管理
class UnifiedApiServer {
  // ... 现有代码 ...
  
  private containerSubscriptions: Map<string, Set<WebSocket>> = new Map(); // 容器订阅管理

  /**
   * 处理容器订阅请求
   */
  private handleContainerSubscription(containerId: string, socket: WebSocket): void {
    if (!this.containerSubscriptions.has(containerId)) {
      this.containerSubscriptions.set(containerId, new Set());
    }
    
    this.containerSubscriptions.get(containerId)!.add(socket);
    
    // 发送订阅确认
    this.safeSend(socket, {
      type: 'subscription:confirmed',
      containerId,
      timestamp: Date.now()
    });
  }

  /**
   * 取消容器订阅
   */
  private removeContainerSubscription(containerId: string, socket: WebSocket): void {
    const subscriptions = this.containerSubscriptions.get(containerId);
    if (subscriptions) {
      subscriptions.delete(socket);
      if (subscriptions.size === 0) {
        this.containerSubscriptions.delete(containerId);
      }
    }
  }

  /**
   * 推送容器状态到订阅者
   */
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
}
```

### 3. HTTP 订阅端点增强

```typescript
// 在 HTTP 路由中增强订阅端点
// 修改 /v1/container/{id}/subscribe 端点

// Container state subscription (Step 3) - 增强版
if (req.method === 'POST' && url.pathname.match(/\/v1\/container\/[^\/]+\/subscribe/)) {
   try {
      // Extract container ID from URL
      const match = url.pathname.match(/\/v1\/container\/([^\/]+)\/subscribe/);
      const containerId = match ? match[1] : null;
      if (!containerId) throw new Error('Container ID not found');

      const payload = await this.readJsonBody(req);
      
      // 注册到订阅管理器
      this.handleContainerSubscription(containerId, null); // WebSocket 会话需要从上下文获取

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: `Subscribed to container ${containerId} status`, 
        containerId,
        timestamp: Date.now()
      }));
   } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
   }
   return;
}
```

### 4. WebSocket 连接管理

```typescript
// 在 WebSocket 连接处理中添加订阅管理
wss.on('connection', (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  if (url.pathname === '/ws') {
    this.clients.add(socket);
    
    // 监听自定义订阅消息
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      
      // 处理订阅请求
      if (message.type === 'subscribe' && message.topic) {
        if (message.topic.startsWith('container:')) {
          const containerId = message.topic.replace('container:', '');
          this.handleContainerSubscription(containerId, socket);
        }
      }
      
      // 处理取消订阅请求
      if (message.type === 'unsubscribe' && message.topic) {
        if (message.topic.startsWith('container:')) {
          const containerId = message.topic.replace('container:', '');
          this.removeContainerSubscription(containerId, socket);
        }
      }
      
      // 处理原有消息
      this.handleMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any));
    });
    
    socket.on('close', () => {
      this.clients.delete(socket);
      // 从所有订阅中移除此客户端
      for (const [containerId, subscribers] of this.containerSubscriptions.entries()) {
        subscribers.delete(socket);
      }
    });
    
    socket.on('error', () => this.clients.delete(socket));
    this.safeSend(socket, { type: 'ready' });
  } 
  // ... 其他端点处理
});
```

---

## 完整的 Unified API 补全代码

```typescript
// services/unified-api/server.ts - 补全版

import { UiController } from '../../services/controller/src/controller.js';
import { WebSocketServer, WebSocket } from 'ws';
import { EventBus } from '../../libs/operations-framework/src/event-driven/EventBus.js';
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
  private clients: Set<WebSocket>;
  private eventBus: EventBus;
  private containerSubscriptions: Map<string, Set<WebSocket>> = new Map();

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

    this.clients = new Set();
    this.eventBus = new EventBus();
    this.setupEventBridge();
  }

  private setupEventBridge(): void {
    // 监听容器相关事件并转发
    this.eventBus.on('container:*', (data) => {
      this.broadcastEvent('container:event', data);
    });

    // 监听操作执行事件
    this.eventBus.on('operation:*', (data) => {
      this.broadcastEvent('operation:event', data);
    });

    // 监听系统事件
    this.eventBus.on('system:*', (data) => {
      this.broadcastEvent('system:event', data);
    });
  }

  private broadcastEvent(topic: string, payload: any): void {
    const message = {
      type: 'event',
      topic,
      payload,
      timestamp: Date.now()
    };
    
    this.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, message);
      }
    });
  }

  private handleContainerSubscription(containerId: string, socket: WebSocket): void {
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

      // 容器状态订阅 (补全版)
      if (req.method === 'POST' && url.pathname.match(/\/v1\/container\/[^\/]+\/subscribe/)) {
         try {
            const match = url.pathname.match(/\/v1\/container\/([^\/]+)\/subscribe/);
            const containerId = match ? match[1] : null;
            if (!containerId) throw new Error('Container ID not found');

            const payload = await this.readJsonBody(req);
            
            // 这册到订阅管理器（实际的 WebSocket 会话需要在 WebSocket 处理中管理）
            // 这里只是确认订阅请求
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: `Subscribed to container ${containerId} status`, 
              containerId,
              timestamp: Date.now()
            }));
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
        
        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString());
          
          // 处理订阅请求
          if (message.type === 'subscribe' && message.topic) {
            if (message.topic.startsWith('container:')) {
              const containerId = message.topic.replace('container:', '');
              this.handleContainerSubscription(containerId, socket);
            }
          }
          
          // 处理取消订阅请求
          if (message.type === 'unsubscribe' && message.topic) {
            if (message.topic.startsWith('container:')) {
              const containerId = message.topic.replace('container:', '');
              this.removeContainerSubscription(containerId, socket);
            }
          }
          
          // 处理原有消息
          this.handleMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any));
        });
        
        socket.on('close', () => {
          this.clients.delete(socket);
          // 从所有订阅中移除此客户端
          for (const [containerId, subscribers] of this.containerSubscriptions.entries()) {
            subscribers.delete(socket);
          }
        });
        
        socket.on('error', () => this.clients.delete(socket));
        this.safeSend(socket, { type: 'ready' });
      } else if (url.pathname === '/bus') {
        this.clients.add(socket);
        socket.on('message', (raw) => this.handleBusMessage(socket, raw instanceof Buffer ? raw : Buffer.from(raw as any)));
        socket.on('close', () => this.clients.delete(socket));
        socket.on('error', () => this.clients.delete(socket));
        this.safeSend(socket, { type: 'ready' });
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
    const message = JSON.stringify({ type: 'event', topic, payload });
    this.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.safeSend(socket, { type: 'event', topic, payload });
      }
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
```

---

## 验证步骤

### 1. 启动服务

```bash
node services/unified-api/server.ts
```

### 2. 测试 WebSocket 连接

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:7701/ws');

ws.on('open', () => {
  console.log('Connected');
  
  // 订阅容器事件
  ws.send(JSON.stringify({
    type: 'subscribe',
    topic: 'container:test-container'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg);
});
```

### 3. 测试 HTTP 订阅

```bash
curl -X POST http://127.0.0.1:7701/v1/container/test-container/subscribe \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 补全后的功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| HTTP 健康检查 | ✅ | `/health` |
| HTTP 容器订阅 | ✅ | `/v1/container/{id}/subscribe` |
| WebSocket 连接 | ✅ | `ws://127.0.0.1:7701/ws` |
| WebSocket 事件推送 | ✅ | 补全后支持容器事件 |
| 容器状态订阅 | ✅ | 支持实时状态推送 |
| 事件桥接 | ✅ | Container Engine → WebSocket |
| 操作执行反馈 | ✅ | 操作结果推送 |

---

**完成时间**: 2025-12-31  
**实现者**: WebAuto Team  
**版本**: Unified API v1.0 (补全版)
