# 消息系统实现指南

## 概述

本文档介绍如何在 WebAuto 项目中实现和使用统一消息系统。

## 核心文件结构

```
libs/operations-framework/src/event-driven/
├── MessageConstants.ts          # 消息常量定义（宏风格）
├── MessageBusService.ts         # 消息总线服务
├── EventBus.ts                  # 原有 EventBus（兼容层）
└── EventTypes.ts                # 原有事件类型（逐步迁移）

services/unified-api/
├── server.ts                    # Unified API 主服务
└── message-routes.ts            # 消息总线 HTTP 路由

docs/arch/
├── MESSAGE_SYSTEM.md            # 消息系统架构设计
└── MESSAGE_SYSTEM_IMPLEMENTATION.md  # 本文件
```

## 快速开始

### 1. 启动消息总线服务

消息总线服务会在 Unified API 启动时自动启动：

```bash
# 启动 Unified API（包含消息总线）
node scripts/start-headful.mjs
```

或者单独使用消息总线：

```typescript
import { MessageBusService } from '@webauto/operations-framework/event-driven/MessageBusService';

const messageBus = new MessageBusService({
  historyLimit: 1000,
  persist: {
    enabled: true,
    directory: '/path/to/messages'
  }
});

await messageBus.start();
```

### 2. 发布消息

```typescript
import { 
  MSG_CONTAINER_CREATED,
  MSG_CONTAINER_ROOT_SCROLL_START 
} from '@webauto/operations-framework/event-driven/MessageConstants';
import { getGlobalMessageBus } from '@webauto/operations-framework/event-driven/MessageBusService';

const bus = getGlobalMessageBus();

// 发布容器创建消息
await bus.publish(MSG_CONTAINER_CREATED, {
  containerId: 'product_list',
  containerType: 'list',
  selector: '.product-list'
}, {
  component: 'ContainerDiscovery',
  sessionId: 'session_123'
});

// 发布根容器滚动消息
await bus.publish(MSG_CONTAINER_ROOT_SCROLL_START, {
  containerId: 'main_page',
  scrollHeight: 10000,
  targetCount: 100
}, {
  component: 'ScrollOperation',
  containerId: 'main_page'
});
```

### 3. 订阅消息

```typescript
import { 
  MSG_CONTAINER_ALL,
  MSG_CONTAINER_CREATED 
} from '@webauto/operations-framework/event-driven/MessageConstants';

const bus = getGlobalMessageBus();

// 订阅所有容器消息
const subId = bus.subscribe(MSG_CONTAINER_ALL, async (message) => {
  console.log('容器消息:', message.type, message.payload);
});

// 订阅特定消息并过滤
bus.subscribe(MSG_CONTAINER_CREATED, async (message) => {
  console.log('容器已创建:', message.payload.containerId);
}, {
  filter: (msg) => msg.source.component === 'ContainerDiscovery',
  priority: 10
});

// 一次性订阅
bus.subscribe(MSG_CONTAINER_CREATED, async (message) => {
  console.log('首次容器创建:', message.payload);
}, {
  once: true
});

// 取消订阅
bus.unsubscribe(subId);
```

### 4. HTTP API 使用

```bash
# 获取统计信息
curl http://127.0.0.1:7701/v1/messages/stats

# 获取消息历史
curl http://127.0.0.1:7701/v1/messages/history?limit=10

# 获取特定类型的消息
curl http://127.0.0.1:7701/v1/messages/history?type=MSG_CONTAINER_*&limit=50

# 发布消息（HTTP）
curl -X POST http://127.0.0.1:7701/v1/messages/publish \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MSG_CONTAINER_CREATED",
    "payload": {
      "containerId": "test_container",
      "selector": ".test"
    },
    "source": {
      "component": "TestClient"
    }
  }'

# 获取订阅列表
curl http://127.0.0.1:7701/v1/messages/subscriptions

# 获取持久化规则
curl http://127.0.0.1:7701/v1/messages/rules

# 更新持久化规则
curl -X PUT http://127.0.0.1:7701/v1/messages/rules \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {"pattern": "MSG_SYSTEM_*", "strategy": "always"},
      {"pattern": "MSG_CONTAINER_*", "strategy": "sample", "sampleRate": 0.1}
    ]
  }'

# 清空历史
curl -X DELETE http://127.0.0.1:7701/v1/messages/history
```

### 5. WebSocket 订阅

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:7701/bus');

ws.on('open', () => {
  // 订阅消息
  ws.send(JSON.stringify({
    type: 'subscribe',
    pattern: 'MSG_CONTAINER_*',
    options: {
      priority: 5
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('收到消息:', message);
});

// 发布消息
ws.send(JSON.stringify({
  type: 'publish',
  messageType: 'MSG_CONTAINER_CLICKED',
  payload: {
    containerId: 'button_submit',
    x: 100,
    y: 200
  },
  source: {
    component: 'UIClient'
  }
}));

// 取消订阅
ws.send(JSON.stringify({
  type: 'unsubscribe',
  subscriptionId: 'sub_xxx'
}));
```

## 集成到现有组件

### 浏览器服务集成

在 `services/browser-service/index.ts` 中：

```typescript
import { 
  MSG_BROWSER_SESSION_CREATED,
  MSG_BROWSER_PAGE_LOAD_COMPLETE 
} from '../../libs/operations-framework/src/event-driven/MessageConstants.js';
import { getGlobalMessageBus } from '../../libs/operations-framework/src/event-driven/MessageBusService.js';

class BrowserService {
  private messageBus = getGlobalMessageBus();
  
  async createSession(profileId: string) {
    const session = await this.sessionManager.create(profileId);
    
    // 发布会话创建消息
    await this.messageBus.publish(MSG_BROWSER_SESSION_CREATED, {
      sessionId: session.id,
      profileId: profileId,
      timestamp: Date.now()
    }, {
      component: 'BrowserService',
      sessionId: session.id
    });
    
    return session;
  }
  
  async onPageLoad(sessionId: string, url: string) {
    await this.messageBus.publish(MSG_BROWSER_PAGE_LOAD_COMPLETE, {
      sessionId,
      url,
      title: 'Page Title',
      loadTime: 1234
    }, {
      component: 'BrowserService',
      sessionId
    });
  }
}
```

### 容器运行时集成

```typescript
import { 
  MSG_CONTAINER_CREATED,
  MSG_CONTAINER_APPEARED,
  MSG_CONTAINER_STATE_CHANGED 
} from '@webauto/operations-framework/event-driven/MessageConstants';
import { getGlobalMessageBus } from '@webauto/operations-framework/event-driven/MessageBusService';

class ContainerRuntime {
  private messageBus = getGlobalMessageBus();
  
  async createContainer(definition: ContainerDefinition) {
    const container = new Container(definition);
    
    // 发布容器创建消息
    await this.messageBus.publish(MSG_CONTAINER_CREATED, {
      containerId: container.id,
      containerType: container.type,
      selector: container.selector
    }, {
      component: 'ContainerRuntime',
      containerId: container.id
    });
    
    return container;
  }
  
  async onContainerAppear(container: Container) {
    await this.messageBus.publish(MSG_CONTAINER_APPEARED, {
      containerId: container.id,
      domPath: container.domPath
    }, {
      component: 'ContainerRuntime',
      containerId: container.id
    });
  }
  
  async updateContainerState(containerId: string, fromState: string, toState: string) {
    await this.messageBus.publish(MSG_CONTAINER_STATE_CHANGED, {
      containerId,
      fromState,
      toState,
      timestamp: Date.now()
    }, {
      component: 'ContainerRuntime',
      containerId
    });
  }
}
```

### Workflow 集成

```typescript
import { 
  MSG_WORKFLOW_STARTED,
  MSG_WORKFLOW_STEP_COMPLETE,
  MSG_WORKFLOW_COMPLETE 
} from '@webauto/operations-framework/event-driven/MessageConstants';

class WorkflowEngine {
  private messageBus = getGlobalMessageBus();
  
  async executeWorkflow(workflowId: string) {
    await this.messageBus.publish(MSG_WORKFLOW_STARTED, {
      workflowId,
      startTime: Date.now()
    }, {
      component: 'WorkflowEngine',
      workflowId
    });
    
    // 执行步骤...
    
    await this.messageBus.publish(MSG_WORKFLOW_STEP_COMPLETE, {
      workflowId,
      stepId: 'step_1',
      result: { success: true },
      duration: 1000
    }, {
      component: 'WorkflowEngine',
      workflowId
    });
    
    await this.messageBus.publish(MSG_WORKFLOW_COMPLETE, {
      workflowId,
      result: { success: true },
      totalDuration: 5000
    }, {
      component: 'WorkflowEngine',
      workflowId
    });
  }
}
```

## 根容器消息注册

在容器定义文件中注册自定义消息：

```json
{
  "id": "taobao_main_page",
  "type": "root",
  "name": "淘宝主页",
  "selectors": [
    { "css": "#app", "variant": "primary" }
  ],
  "messages": [
    {
      "name": "MSG_CONTAINER_ROOT_SCROLL_START",
      "description": "开始滚动加载商品列表",
      "payload": {
        "scrollHeight": "number",
        "targetCount": "number"
      }
    },
    {
      "name": "MSG_CONTAINER_PRODUCT_FOUND",
      "description": "发现新商品容器",
      "payload": {
        "productId": "string",
        "title": "string",
        "price": "number",
        "domPath": "string"
      }
    }
  ],
  "variables": {
    "productList": [],
    "scrollCount": 0,
    "totalProducts": 0
  },
  "operations": [
    {
      "id": "auto_scroll",
      "type": "scroll",
      "triggers": ["MSG_CONTAINER_ROOT_PAGE_LOAD"],
      "config": {
        "direction": "down",
        "stopCondition": "MSG_CONTAINER_ROOT_SCROLL_BOTTOM",
        "emitProgress": "MSG_CONTAINER_ROOT_SCROLL_PROGRESS"
      }
    },
    {
      "id": "collect_products",
      "type": "discover",
      "triggers": ["MSG_CONTAINER_ROOT_SCROLL_PROGRESS"],
      "config": {
        "containerPattern": "product_*",
        "emitFound": "MSG_CONTAINER_PRODUCT_FOUND"
      }
    }
  ]
}
```

## 消息持久化配置

### 默认持久化规则

```typescript
const defaultRules = [
  { pattern: 'MSG_SYSTEM_*', strategy: 'always' },
  { pattern: 'MSG_BROWSER_SESSION_*', strategy: 'always' },
  { pattern: 'MSG_CONTAINER_CREATED', strategy: 'always' },
  { pattern: 'MSG_WORKFLOW_*', strategy: 'always' },
  { pattern: 'MSG_PROJECT_*', strategy: 'always' },
  { pattern: 'MSG_BROWSER_PAGE_SCROLL', strategy: 'sample', sampleRate: 0.01 },
  { pattern: 'MSG_CONTAINER_APPEAR', strategy: 'sample', sampleRate: 0.1 },
  { pattern: 'MSG_*', strategy: 'never' }
];
```

### 自定义持久化规则

```typescript
const messageBus = new MessageBusService({
  persist: {
    enabled: true,
    directory: '~/.webauto/messages'
  },
  persistRules: [
    // 所有系统消息必须存储
    { pattern: 'MSG_SYSTEM_*', strategy: 'always' },
    
    // 容器创建必须存储
    { pattern: 'MSG_CONTAINER_CREATED', strategy: 'always' },
    
    // 容器出现消息采样 10%
    { pattern: 'MSG_CONTAINER_APPEAR', strategy: 'sample', sampleRate: 0.1 },
    
    // 滚动消息采样 1%
    { pattern: 'MSG_BROWSER_PAGE_SCROLL', strategy: 'sample', sampleRate: 0.01 },
    
    // 其他消息不存储
    { pattern: 'MSG_*', strategy: 'never' }
  ]
});
```

## UI 集成示例

### Floating Panel 主进程

```typescript
// apps/floating-panel/src/main/index.mts
import WebSocket from 'ws';

let busWs: WebSocket | null = null;

function connectToMessageBus() {
  busWs = new WebSocket('ws://127.0.0.1:7701/bus');
  
  busWs.on('open', () => {
    console.log('[MessageBus] Connected');
    
    // 订阅所有容器消息
    busWs!.send(JSON.stringify({
      type: 'subscribe',
      pattern: 'MSG_CONTAINER_*'
    }));
    
    // 订阅所有工作流消息
    busWs!.send(JSON.stringify({
      type: 'subscribe',
      pattern: 'MSG_WORKFLOW_*'
    }));
  });
  
  busWs.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    // 转发消息到渲染进程
    mainWindow?.webContents.send('message-bus:event', message);
  });
  
  busWs.on('close', () => {
    console.log('[MessageBus] Disconnected, reconnecting...');
    setTimeout(connectToMessageBus, 3000);
  });
}

// 启动时连接
app.whenReady().then(() => {
  createWindow();
  connectToMessageBus();
});
```

### Floating Panel 渲染进程

```typescript
// apps/floating-panel/src/renderer/index.mts

// 监听消息总线事件
window.api.onMessageBusEvent((message) => {
  console.log('收到消息:', message.type, message.payload);
  
  switch (message.type) {
    case 'MSG_CONTAINER_CREATED':
      updateContainerTree(message.payload);
      break;
      
    case 'MSG_CONTAINER_APPEARED':
      highlightContainer(message.payload.containerId);
      break;
      
    case 'MSG_WORKFLOW_STEP_COMPLETE':
      updateWorkflowProgress(message.payload);
      break;
  }
});

// 发送消息
function sendHighlightRequest(containerId: string) {
  window.api.publishMessage('MSG_UI_HIGHLIGHT_ELEMENT', {
    containerId,
    style: '2px solid #007acc',
    duration: 3000
  });
}
```

## 调试和监控

### 消息监控工具

创建 `scripts/message-monitor.mjs`：

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:7701/bus');

ws.on('open', () => {
  console.log('[Monitor] Connected to message bus');
  
  // 订阅所有消息
  ws.send(JSON.stringify({
    type: 'subscribe',
    pattern: 'MSG_*'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log(`[${new Date(message.timestamp).toISOString()}] ${message.type}`);
  console.log('  Source:', message.source.component);
  console.log('  Payload:', JSON.stringify(message.payload, null, 2));
  console.log('---');
});
```

运行：

```bash
node scripts/message-monitor.mjs
```

### 消息历史回放

```javascript
// scripts/message-replay.mjs
import fs from 'fs';
import readline from 'readline';

async function replayMessages(filepath) {
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const message = JSON.parse(line);
    console.log(`[${new Date(message.timestamp).toISOString()}]`, message.type);
    console.log('  Payload:', message.payload);
    
    // 可以选择性地重新发布消息
    // await publishMessage(message);
  }
}

const date = process.argv[2] || '2025-01-15';
replayMessages(`~/.webauto/messages/${date}.jsonl`);
```

## 最佳实践

1. **使用消息常量**：始终使用 `MessageConstants.ts` 中定义的常量，不要硬编码字符串
2. **提供完整的 source 信息**：帮助追踪消息来源和调试
3. **合理设置持久化规则**：高频消息使用采样策略
4. **使用优先级**：重要的订阅设置更高优先级
5. **过滤和转换**：在订阅时使用 filter 和 transform 减少不必要的处理
6. **错误处理**：订阅处理函数中捕获异常，避免影响其他订阅
7. **及时取消订阅**：组件销毁时取消订阅，避免内存泄漏

## 故障排查

### 消息未收到

1. 检查订阅模式是否正确匹配
2. 检查 filter 函数是否过滤掉了消息
3. 检查消息总线服务是否启动
4. 检查 WebSocket 连接状态

### 性能问题

1. 检查持久化规则，避免存储过多消息
2. 使用采样策略处理高频消息
3. 在订阅中使用 filter，避免不必要的处理
4. 检查消息历史限制，避免内存占用过高

### 消息丢失

1. 检查持久化是否启用
2. 检查持久化目录权限
3. 检查磁盘空间
4. 查看错误日志

## 迁移指南

从旧的 EventBus 迁移到新的消息系统：

```typescript
// 旧代码
import { globalEventBus } from './EventBus';
globalEventBus.emit('container:created', { id: 'xxx' });
globalEventBus.on('container:created', (data) => {
  console.log(data);
});

// 新代码
import { MSG_CONTAINER_CREATED } from './MessageConstants';
import { getGlobalMessageBus } from './MessageBusService';

const bus = getGlobalMessageBus();
await bus.publish(MSG_CONTAINER_CREATED, { containerId: 'xxx' }, { component: 'MyComponent' });
bus.subscribe(MSG_CONTAINER_CREATED, (message) => {
  console.log(message.payload);
});
```
