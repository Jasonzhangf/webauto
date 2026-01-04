# WebAuto 统一消息系统架构设计

## 设计理念

采用 Windows 消息风格的事件驱动架构，使用长宏定义和简单字段拼接表示层级和分类，实现项目级的统一消息总线系统。

## 消息命名规范

### 格式

```
MSG_<分类>_<层级>_<对象>_<动作>_<状态>
```

### 示例

- `MSG_CONTAINER_ROOT_SCROLL_START` - 根容器滚动开始
- `MSG_BROWSER_SESSION_CREATED` - 浏览器会话创建完成  
- `MSG_WORKFLOW_STEP_COMPLETE` - 工作流步骤完成
- `MSG_UI_HIGHLIGHT_DOM_PATH` - UI 高亮 DOM 路径

### 消息分类

| 分类 | 说明 | 示例 |
|------|------|------|
| `SYSTEM` | 系统级（启动、关闭、配置） | `MSG_SYSTEM_INIT_START` |
| `BROWSER` | 浏览器级（会话、页面、导航） | `MSG_BROWSER_PAGE_LOAD_COMPLETE` |
| `CONTAINER` | 容器级（生命周期、状态、操作） | `MSG_CONTAINER_APPEAR` |
| `WORKFLOW` | 工作流级（任务、步骤、条件） | `MSG_WORKFLOW_TASK_START` |
| `UI` | UI级（交互、显示、事件） | `MSG_UI_PICK_DOM_COMPLETE` |
| `PROJECT` | 项目级（配置、持久化、同步） | `MSG_PROJECT_CONFIG_SAVED` |

### 消息层级

| 层级 | 说明 | 示例 |
|------|------|------|
| `ROOT` | 根容器专用 | `MSG_CONTAINER_ROOT_*` |
| `SESSION` | 会话级 | `MSG_BROWSER_SESSION_*` |
| `PAGE` | 页面级 | `MSG_BROWSER_PAGE_*` |
| `SERVICE` | 服务级 | `MSG_BROWSER_SERVICE_*` |

### 动作状态

| 状态 | 说明 | 示例 |
|------|------|------|
| `START` | 开始 | `MSG_WORKFLOW_START` |
| `COMPLETE` / `COMPLETED` | 完成 | `MSG_WORKFLOW_COMPLETE` |
| `FAILED` | 失败 | `MSG_WORKFLOW_FAILED` |
| `PROGRESS` | 进行中 | `MSG_CONTAINER_ROOT_SCROLL_PROGRESS` |
| `READY` | 就绪 | `MSG_CONTAINER_STATE_READY` |
| `CHANGED` | 变更 | `MSG_CONTAINER_STATE_CHANGED` |

## 消息总线架构

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    Message Bus Service                   │
│                     (Port: 7701/bus)                     │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │  Event Router │  │  Persister │  │  Subscription  │ │
│  └───────────────┘  └────────────┘  │    Manager     │ │
│         ↓                   ↓        └────────────────┘ │
│  ┌───────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │   EventBus    │  │  History   │  │   Middleware   │ │
│  └───────────────┘  └────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────┘
                       ↑        ↓
         ┌─────────────┴────────┴──────────────┐
         ↓                ↓                     ↓
┌─────────────┐  ┌──────────────┐    ┌─────────────────┐
│   Browser   │  │  Container   │    │   Workflow      │
│   Service   │  │   Runtime    │    │    Engine       │
└─────────────┘  └──────────────┘    └─────────────────┘
         ↓                ↓                     ↓
    ┌────────────────────────────────────────────┐
    │          Unified API (7701/http+ws)        │
    └────────────────────────────────────────────┘
                       ↑
                       ↓
           ┌────────────────────┐
           │   Floating Panel   │
           │        (UI)         │
           └────────────────────┘
```

### 消息流向

1. **浏览器服务 → 消息总线**
   - 会话创建/销毁
   - 页面加载/导航事件
   - DOM 变化通知

2. **容器运行时 → 消息总线**
   - 容器生命周期事件
   - 容器状态变更
   - 操作执行结果

3. **消息总线 → 项目持久化**
   - 自动保存关键事件
   - 事件历史记录
   - 状态快照

4. **消息总线 → UI**
   - 实时状态更新
   - 操作反馈
   - 错误提示

5. **UI → 消息总线 → 服务**
   - 用户操作触发
   - 容器控制指令
   - 工作流启动

## 根容器消息机制

### 根容器特性

1. **状态管理**
   - 页面级变量存储 (`MSG_CONTAINER_VAR_SET`)
   - 状态持久化 (`MSG_PROJECT_PERSIST_START`)

2. **页面事件**
   ```typescript
   MSG_CONTAINER_ROOT_PAGE_LOAD      // 页面加载
   MSG_CONTAINER_ROOT_PAGE_SCROLL    // 页面滚动
   MSG_CONTAINER_ROOT_PAGE_NAVIGATE  // 页面导航
   ```

3. **滚动操作**
   ```typescript
   MSG_CONTAINER_ROOT_SCROLL_START    // 开始滚动
   MSG_CONTAINER_ROOT_SCROLL_PROGRESS // 滚动进度
   MSG_CONTAINER_ROOT_SCROLL_BOTTOM   // 到达底部
   MSG_CONTAINER_ROOT_SCROLL_STOP     // 停止滚动
   ```

4. **子容器发现**
   - 根容器负责发起子容器搜索
   - 发现子容器后发出 `MSG_CONTAINER_DISCOVERED`
   - 子容器出现时发出 `MSG_CONTAINER_APPEAR`

### 根容器消息注册

在根容器定义中注册自定义消息：

```json
{
  "id": "taobao_main_page",
  "type": "root",
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
      "description": "发现新商品",
      "payload": {
        "productId": "string",
        "title": "string",
        "price": "number"
      }
    }
  ],
  "operations": [
    {
      "id": "auto_scroll",
      "type": "scroll",
      "triggers": ["MSG_CONTAINER_ROOT_PAGE_LOAD"],
      "config": {
        "direction": "down",
        "stopCondition": "MSG_CONTAINER_ROOT_SCROLL_BOTTOM"
      }
    }
  ]
}
```

## 消息持久化

### 持久化策略

1. **关键事件必存**
   ```typescript
   MSG_SYSTEM_*              // 所有系统事件
   MSG_BROWSER_SESSION_*     // 会话创建/销毁
   MSG_CONTAINER_CREATED     // 容器创建
   MSG_WORKFLOW_*            // 所有工作流事件
   ```

2. **状态变更可选**
   ```typescript
   MSG_CONTAINER_STATE_*     // 可配置是否存储
   MSG_CONTAINER_VAR_*       // 变量变更按需存储
   ```

3. **高频事件过滤**
   ```typescript
   MSG_BROWSER_PAGE_SCROLL   // 采样存储（如每秒1次）
   MSG_CONTAINER_APPEAR      // 去重存储
   ```

### 存储格式

```typescript
interface PersistedMessage {
  id: string;                    // 消息唯一ID
  type: string;                  // 消息类型（如 MSG_CONTAINER_CREATED）
  timestamp: number;             // 时间戳
  source: {                      // 消息来源
    component: string;           // 组件名称
    sessionId?: string;          // 会话ID
    containerId?: string;        // 容器ID
  };
  payload: Record<string, any>;  // 消息载荷
  meta: {                        // 元数据
    version: string;             // 消息版本
    traceId?: string;            // 追踪ID
    parentId?: string;           // 父消息ID
  };
}
```

### 存储位置

```
~/.webauto/
  ├── messages/
  │   ├── 2025-01/
  │   │   ├── 01.jsonl        // 按日期分文件
  │   │   ├── 02.jsonl
  │   │   └── ...
  │   └── index.json          // 索引文件
  └── snapshots/
      └── latest.json         // 最新状态快照
```

## 使用示例

### 1. 订阅容器事件

```typescript
import { EventBus, MSG_CONTAINER_APPEAR } from '@webauto/operations-framework/event-driven';

const bus = new EventBus();

// 订阅所有容器出现事件
bus.on(MSG_CONTAINER_APPEAR, (data) => {
  console.log('容器出现:', data.containerId, data.selector);
});

// 订阅特定容器的状态变更
bus.on(MSG_CONTAINER_STATE_CHANGED, (data) => {
  if (data.containerId === 'product_list') {
    console.log('商品列表状态变更:', data.fromState, '->', data.toState);
  }
});
```

### 2. 发送消息

```typescript
import { emit, MSG_CONTAINER_ROOT_SCROLL_START } from '@webauto/operations-framework/event-driven';

// 开始滚动
await emit(MSG_CONTAINER_ROOT_SCROLL_START, {
  containerId: 'taobao_main_page',
  scrollHeight: 10000,
  targetCount: 100
}, 'ScrollOperation');
```

### 3. 工作流中使用

```typescript
{
  "id": "collect_products",
  "steps": [
    {
      "id": "init_scroll",
      "operator": "scroll",
      "params": {
        "direction": "down",
        "emitMessage": "MSG_CONTAINER_ROOT_SCROLL_START"
      }
    },
    {
      "id": "wait_products",
      "operator": "wait",
      "params": {
        "waitForMessage": "MSG_CONTAINER_PRODUCT_FOUND",
        "timeout": 30000
      }
    }
  ]
}
```

### 4. UI 中监听

```typescript
// Floating Panel 主进程
import WebSocket from 'ws';

const busWs = new WebSocket('ws://127.0.0.1:7701/bus');

busWs.on('open', () => {
  // 订阅所有容器消息
  busWs.send(JSON.stringify({
    type: 'subscribe',
    topics: ['MSG_CONTAINER_*']
  }));
});

busWs.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'MSG_CONTAINER_DISCOVERED') {
    // 更新容器树UI
    updateContainerTree(message.payload);
  }
});
```

## 测试和调试

### 消息监控工具

```bash
# 监听所有消息
node scripts/message-monitor.mjs

# 监听特定分类
node scripts/message-monitor.mjs --filter MSG_CONTAINER_*

# 回放历史消息
node scripts/message-replay.mjs --date 2025-01-15
```

### 消息统计

```bash
# 查看消息统计
curl http://127.0.0.1:7701/v1/messages/stats

# 查看事件历史
curl http://127.0.0.1:7701/v1/messages/history?limit=100
```

## 性能优化

1. **批量发送**：高频消息批量发送，减少网络开销
2. **消息过滤**：订阅端精确过滤，避免无用消息
3. **异步处理**：消息处理异步化，不阻塞主流程
4. **持久化异步**：消息持久化使用后台队列

## 迁移指南

### 从旧事件系统迁移

```typescript
// 旧代码
eventBus.emit('container:created', { id: 'xxx' });

// 新代码
import { emit, MSG_CONTAINER_CREATED } from '@webauto/operations-framework/event-driven';
await emit(MSG_CONTAINER_CREATED, { containerId: 'xxx' });
```

### 兼容性

- 保留 `EventBus` 类，内部使用新的消息常量
- 提供兼容层，自动转换旧格式消息
- 逐步迁移，新功能使用新消息系统
