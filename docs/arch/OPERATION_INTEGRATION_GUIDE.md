# Operation 系统集成指南

本文档展示如何使用已实施的 4 个改进步骤，实现一个完整的事件驱动操作流程。

---

## 概览

我们已经完成了以下改进：

1. ✅ **Refactor OperationContext** - `modules/operations/src/registry.ts` 现在支持 `containerId` 和 `node` 引用
2. ✅ **Implement Event Emission** - `libs/containers/src/engine/RuntimeController.ts` 在容器发现和操作完成时发送事件
3. ✅ **Create Subscription API** - `services/unified-api/server.ts` 暴露了 WebSocket 和 HTTP 订阅端点
4. ✅ **Develop Binding Logic** - `libs/containers/src/binding/BindingRegistry.ts` 实现了消息到操作的绑定

---

## 集成示例：电商分页自动翻页

### 场景描述

在一个电商网站上，当检测到"商品列表"容器出现时，自动点击"下一页"按钮进行翻页，直到没有更多商品。

### 步骤 1: 启动服务

```bash
# 启动 Unified API (7701)
node scripts/start-headful.mjs

# 或者只启动统一 API
cd services/unified-api
npm run start
```

### 步骤 2: 连接 WebSocket 监听容器事件

```javascript
// client.js - 连接到 WebSocket 接收容器状态
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:7701/ws');

ws.on('open', () => {
  console.log('[Client] WebSocket connected');
  
  // 发送订阅请求（可选，这里通过 WebSocket 监听所有事件）
  ws.send(JSON.stringify({
    type: 'action',
    action: 'subscribe:container',
    payload: { containerId: 'product-list' }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('[Client] Received:', message);
  
  // 监听容器发现事件
  if (message.type === 'event' && message.topic.match(/container:.*:discovered/)) {
    console.log('[Client] Container discovered:', message.payload.containerId);
    
    // 触发翻页操作
    if (message.payload.containerId === 'product-list') {
      handleProductListDiscovered(ws, message.payload);
    }
  }
  
  // 监听操作完成事件
  if (message.type === 'event' && message.topic.match(/container:.*:operation:completed/)) {
    console.log('[Client] Operation completed:', message.payload);
  }
});

async function handleProductListDiscovered(ws, payload) {
  // 发送操作请求
  ws.send(JSON.stringify({
    type: 'action',
    action: 'browser:execute',
    payload: {
      sessionId: 'your-session-id',
      containerId: 'product-list',
      operationType: 'click',
      config: {
        selector: '.next-page-button'
      }
    }
  }));
}
```

### 步骤 3: 使用 BindingRegistry 注册规则

```typescript
// server-side integration
import { BindingRegistry } from './libs/containers/src/binding/BindingRegistry.js';
import { EventBus } from './libs/operations-framework/src/event-driven/EventBus.js';

const eventBus = new EventBus();
const bindingRegistry = new BindingRegistry(eventBus);

// 注册规则：当收到 ACTION_NEXT_PAGE 消息时，点击下一页
bindingRegistry.register({
  id: 'auto-next-page',
  trigger: {
    type: 'message',
    pattern: 'ACTION_NEXT_PAGE'
  },
  target: {
    containerType: 'pagination',
    selector: (graph) => {
      // 查找当前页面的分页容器
      for (const [id, node] of graph.nodes.entries()) {
        if (node.defId.includes('pagination') || node.defId.includes('next')) {
          return id;
        }
      }
      return null;
    }
  },
  action: {
    operationType: 'click',
    config: {
      selector: '.next-page-button'
    }
  },
  condition: (context) => {
    // 只有当页面小于 10 页时才执行
    return context.currentPage < 10;
  }
});

// 注册事件驱动规则：当容器被发现时自动高亮
bindingRegistry.register({
  id: 'highlight-on-discover',
  trigger: {
    type: 'event',
    pattern: 'container:*:discovered'
  },
  target: {
    selector: (graph) => {
      // 使用事件中的容器 ID
      return graph.lastDiscoveredContainerId;
    }
  },
  action: {
    operationType: 'highlight',
    config: {
      color: '#00C853',
      durationMs: 2000
    }
  }
});

// 手动触发消息
await bindingRegistry.handleMessage('ACTION_NEXT_PAGE', {}, { 
  graph: currentGraph, 
  currentPage: 1 
});
```

### 步骤 4: 在 Container Engine 中注入 EventBus

```typescript
// services/engines/container-engine/server.ts (修改示例)
import { EventBus } from '../../../libs/operations-framework/src/event-driven/EventBus.js';

const globalEventBus = new EventBus();

// 在创建 RuntimeController 时注入 EventBus
const runtimeDeps = (sessionId: string) => ({
  eventBus: globalEventBus,  // 👈 注入 EventBus
  highlight: async (bboxOrHandle: any, opts?: any) => {
    // ... existing code
  },
  wait: async (ms: number) => await new Promise(r => setTimeout(r, ms)),
  perform: async (node: any, op: any) => {
    // ... existing code
  }
});

const runtime = new RuntimeController(defsApplied, discovery, runtimeDeps(sessionId));

// 将事件桥接到 WebSocket
globalEventBus.on('container:*:discovered', async (data) => {
  // 发送到所有 WebSocket 客户端
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'event',
        topic: `container:${data.containerId}:discovered`,
        payload: data
      }));
    }
  });
});
```

---

## HTTP API 示例

### 订阅容器状态（RESTful 方式）

```bash
# 订阅 product-list 容器的状态
curl -X POST http://127.0.0.1:7701/v1/container/product-list/subscribe \
  -H "Content-Type: application/json" \
  -d '{}'

# 响应:
# {
#   "success": true,
#   "message": "Subscribed to container product-list status",
#   "containerId": "product-list"
# }
```

**注意**: 实际的状态推送通过 WebSocket (`ws://127.0.0.1:7701/ws`) 接收。

### 执行容器操作

```bash
# 对容器执行点击操作
curl -X POST http://127.0.0.1:7701/v1/controller/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "browser:execute",
    "payload": {
      "sessionId": "abc123",
      "containerId": "product-list",
      "operationType": "click",
      "config": {
        "selector": ".next-page-button"
      }
    }
  }'
```

---

## WebSocket 消息格式

### 客户端 → 服务端

```json
{
  "type": "action",
  "action": "subscribe:container",
  "requestId": "req-001",
  "payload": {
    "containerId": "product-list"
  }
}
```

### 服务端 → 客户端（事件）

```json
{
  "type": "event",
  "topic": "container:product-list:discovered",
  "payload": {
    "containerId": "product-list",
    "parentId": "main-page",
    "bbox": { "x": 100, "y": 200, "width": 800, "height": 600 },
    "visible": true,
    "score": 0.95
  }
}
```

### 服务端 → 客户端（响应）

```json
{
  "type": "response",
  "action": "subscribe:container",
  "requestId": "req-001",
  "success": true,
  "data": {
    "containerId": "product-list"
  }
}
```

---

## 完整流程图

```
┌─────────────┐
│   Browser   │
│   (Page)    │
└──────┬──────┘
       │
       │ DOM 变化
       ▼
┌─────────────────────────┐
│  Container Discovery    │
│  (TreeDiscoveryEngine)  │
└──────┬──────────────────┘
       │
       │ discoverChildren()
       ▼
┌─────────────────────────┐
│  RuntimeController      │
│  + EventBus             │
└──────┬──────────────────┘
       │
       │ emit('container:*:discovered')
       ▼
┌─────────────────────────┐
│     EventBus            │
│  (globalEventBus)       │
└──────┬──────────────────┘
       │
       ├──► WebSocket Clients (实时推送)
       │
       └──► BindingRegistry (规则匹配)
               │
               │ executeRule()
               ▼
          emit('operation:*:execute')
               │
               ▼
          ┌────────────────┐
          │  Operation     │
          │  Registry      │
          └────────────────┘
               │
               │ run(ctx, config)
               ▼
          ┌────────────────┐
          │  Browser       │
          │  Execution     │
          └────────────────┘
```

---

## 测试清单

- [ ] 启动 Unified API 服务 (7701)
- [ ] 连接 WebSocket 客户端
- [ ] 创建浏览器会话 (`POST /v1/session/create`)
- [ ] 发送订阅请求 (`POST /v1/container/{id}/subscribe`)
- [ ] 触发容器发现（打开目标页面）
- [ ] 验证收到 `container:*:discovered` 事件
- [ ] 使用 BindingRegistry 注册规则
- [ ] 发送消息触发规则 (`bindingRegistry.handleMessage()`)
- [ ] 验证操作执行并收到 `container:*:operation:completed` 事件

---

## 常见问题

### Q1: 如何调试事件流？

启用 EventBus 日志：

```typescript
eventBus.on('*', (data) => {
  console.log('[EventBus] Event:', data);
});
```

### Q2: 如何获取容器图谱？

```bash
# 假设 contextId 为 'ctx-123'
curl http://127.0.0.1:7700/v1/containers/context/ctx-123/graph
```

(注意：端口 7700 是 Container Engine，非 Unified API)

### Q3: 如何在 RuntimeController 中传递容器引用到 OperationContext？

修改 `perform` 方法：

```typescript
perform: async (node: ContainerNodeRuntime, op: OperationInstance) => {
  const ctx: OperationContext = {
    containerId: node.defId,  // 👈 传递容器 ID
    node: node,               // 👈 传递完整节点
    page: pageInstance,
    logger: console
  };
  
  const operationDef = getOperation(op.def.type);
  return await operationDef.run(ctx, op.def.config || {});
}
```

---

## 下一步

- 集成到 Container Engine Server (`services/engines/container-engine/server.ts`)
- 实现更多操作类型 (scroll, type, waitFor, custom)
- 完善 BindingRegistry 的条件匹配和错误处理
- 添加操作重试和超时机制
- 实现操作日志和审计

---

**文档版本**: v1.0  
**最后更新**: 2025-01-XX  
**维护者**: WebAuto Team
