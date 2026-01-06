# WebAuto 事件驱动架构设计

## 架构概述

WebAuto 采用事件驱动架构实现容器自动化操作，通过事件总线连接各个组件，实现解耦和可扩展性。

```
┌─────────────────────────────────────────────────────────────┐
│                     EventBus (7701/bus)                   │
└─────────────┬─────────────────────────┬─────────────────┘
              │                         │
    ┌─────────▼─────────┐   ┌─────────▼─────────┐
    │ RuntimeController  │   │ AutoClickHandler  │
    │                   │   │                   │
    │ - discover        │   │ - listen appear  │
    │ - execute ops     │   │ - auto click     │
    └─────────┬─────────┘   └─────────────────────┘
              │
    ┌─────────▼─────────┐
    │ EventDispatcher   │
    │                   │
    │ - emit appear     │
    └─────────┬─────────┘
              │
    container:appear
    container:<id>:appear
    container:<id>:click
    container:<id>:operation:completed
```

## 核心组件

### 1. EventBus

- 位置：`libs/operations-framework/src/event-driven/EventBus.js`
- 端口：7701/bus
- 职责：
  - 全局事件发布/订阅
  - 事件路由到订阅者
  - 支持通配符订阅（如 `container:*`）

### 2. ContainerEventDispatcher

- 位置：`libs/containers/src/engine/ContainerEventDispatcher.ts`
- 职责：
  - 监听容器匹配结果
  - 识别新出现的容器
  - 发送 `container.appear` 事件

**事件流：**
```typescript
// 容器匹配完成
graph = await runtimeController.start(rootId, rootHandle)

// 自动发送 appear 事件
await eventDispatcher.processMatchResult(graph)
  → emit('container:appear', { containerId, ... })
  → emit(`container:${containerId}:appear`, { ... })
```

### 3. ContainerAutoClickHandler

- 位置：`libs/containers/src/engine/ContainerAutoClickHandler.ts`
- 职责：
  - 监听容器 appear 事件
  - 检查 `metadata.auto_click` 配置
  - 自动触发 click 操作

**配置示例：**
```json
{
  "id": "weibo_main_page.feed_post.expand_button",
  "metadata": {
    "auto_click": true,
    "auto_click_wait_after": 500,
    "auto_click_retries": 1,
    "auto_click_timeout": 5000
  },
  "operations": [
    {
      "type": "click",
      "config": { "wait_after": 500 }
    }
  ]
}
```

**事件流：**
```typescript
// 容器出现
emit('container:weibo_main_page.feed_post.expand_button:appear', { ... })

// AutoClickHandler 检查 auto_click 配置
if (container.metadata.auto_click) {
  // 发送点击事件
  emit('container:weibo_main_page.feed_post.expand_button:click', { ... })
}

// OperationExecutor 执行点击
await executor.execute(containerId, 'click', config, handle)
  → emit(`container:${containerId}:operation:completed`, { ... })
```

### 4. RuntimeController

- 位置：`libs/containers/src/engine/RuntimeController.ts`
- 职责：
  - 容器发现与操作编排
  - 集成 EventDispatcher 和 AutoClickHandler
  - 执行操作队列

**关键集成点：**
```typescript
// 启动时
async start(rootId, rootHandle, mode) {
  // 1. 发现容器
  this.graph = await this.discovery.discoverFromRoot(rootId, rootHandle)
  
  // 2. 分发初始 appear 事件
  await this.eventDispatcher.processMatchResult(this.graph)
  
  // 3. 构建操作队列
  root.opQueue = OperationQueue.buildDefaultQueue(...)
  
  // 4. 执行循环
  await this.loop(mode)
}

// 发现子容器时
async executeFindChildOperation(node, op) {
  const res = await this.discovery.discoverChildren(node.defId, node.handle)
  
  for (const child of res.candidates) {
    this.graph.nodes.set(child.defId, { ... })
    
    // 触发 appear 事件
    await this.eventDispatcher.processMatchResult(this.graph)
  }
}
```

## 事件定义

### 容器生命周期事件

| 事件名 | 发送时机 | Payload |
|--------|----------|---------|
| `container:appear` | 任何容器被匹配到 | `{ containerId, bbox, visible, score, sessionId, timestamp }` |
| `container:<id>:appear` | 特定容器被匹配到 | 同上 |
| `container:<id>:discovered` | 子容器被发现 | `{ containerId, parentId, bbox, visible, score }` |
| `container:<id>:children_discovered` | 子容器发现完成 | `{ containerId, childCount }` |

### 操作事件

| 事件名 | 发送时机 | Payload |
|--------|----------|---------|
| `container:<id>:click` | 点击操作被触发 | `{ containerId, sessionId, trigger, timestamp }` |
| `container:<id>:operation:completed` | 操作执行完成 | `{ containerId, operationType, result }` |
| `container:<id>:operation:failed` | 操作执行失败 | `{ containerId, operationType, error }` |
| `ui:container:executing` | UI 更新：操作执行中 | `{ containerId, operationType, bbox, style }` |

## 工作流示例

### 微博帖子采集工作流

```
1. 容器匹配
   containers:match
   → RuntimeController.start('weibo_main_page', rootHandle)
   → emit('container:weibo_main_page:appear')

2. 发现帖子列表
   find-child (weibo_main_page.feed_list)
   → emit('container:weibo_main_page.feed_list:appear')
   → emit('container:weibo_main_page.feed_list:discovered')

3. 发现单个帖子
   find-child (weibo_main_page.feed_post)
   → emit('container:weibo_main_page.feed_post:appear', { index: 0 })
   → emit('container:weibo_main_page.feed_post:appear', { index: 1 })
   ...

4. 自动点击展开按钮
   appear(weibo_main_page.feed_post.expand_button)
   → AutoClickHandler: 检查 auto_click = true
   → emit('container:weibo_main_page.feed_post.expand_button:click')
   → executor.execute('click', config)
   → emit('container:weibo_main_page.feed_post.expand_button:operation:completed')

5. 提取内容
   extract (weibo_main_page.feed_post)
   → executor.execute('extract', config)
   → emit('container:weibo_main_page.feed_post:operation:completed')
   → 收集数据到 posts[]

6. 滚动加载更多
   scroll (weibo_main_page)
   → executor.execute('scroll', config)
   → emit('container:weibo_main_page:operation:completed')

7. 重复步骤 3-6，直到收集 150 条
```

## 配置化工作流

### 工作流定义格式

```json
{
  "id": "weibo-feed-extraction",
  "name": "微博Feed采集工作流",
  "steps": [
    {
      "id": "init",
      "type": "container-match",
      "config": {
        "rootId": "weibo_main_page",
        "maxDepth": 2
      }
    },
    {
      "id": "loop",
      "type": "repeat",
      "config": {
        "maxIterations": 150,
        "steps": [
          {
            "type": "find-child",
            "containerId": "weibo_main_page.feed_post"
          },
          {
            "type": "extract",
            "containerId": "weibo_main_page.feed_post",
            "config": {
              "fields": ["author", "content", "links", "timestamp"]
            }
          },
          {
            "type": "scroll",
            "containerId": "weibo_main_page",
            "config": {
              "direction": "down",
              "distance": 500
            },
            "condition": "needMorePosts"
          }
        ]
      }
    },
    {
      "id": "finish",
      "type": "output",
      "config": {
        "format": "markdown",
        "path": "output/weibo/collect-150.md"
      }
    }
  ]
}
```

## 扩展指南

### 添加新的自动点击容器

1. 在容器库定义中添加 `metadata.auto_click`：

```json
{
  "id": "site.container.button",
  "metadata": {
    "auto_click": true,
    "auto_click_wait_after": 500
  },
  "operations": [
    {
      "type": "click",
      "config": { ... }
    }
  ]
}
```

2. 容器出现时，AutoClickHandler 会自动触发点击
3. 点击完成后发送 `operation:completed` 事件

### 自定义事件处理

```typescript
import { EventBus } from '.../event-driven/EventBus.js';

const eventBus = new EventBus();

// 订阅所有容器 appear 事件
eventBus.on('container:appear', (data) => {
  console.log('容器出现:', data.containerId);
});

// 订阅特定容器的操作事件
eventBus.on('container:weibo_main_page.feed_post:operation:completed', (data) => {
  if (data.operationType === 'extract') {
    console.log('帖子提取完成:', data.result);
  }
});
```

## 最佳实践

### 1. 事件命名规范

- 使用小写，单词间用 `:` 分隔
- 容器事件：`container:<containerId>:<event>`
- 操作事件：`operation:<operationId>:<event>`
- 使用有意义的动词：`appear`, `click`, `completed`, `failed`

### 2. Payload 设计

- 必需字段：`containerId`, `timestamp`
- 可选字段：根据事件类型添加
- 保持扁平结构，避免嵌套过深

### 3. 错误处理

- 操作失败发送 `operation:failed` 事件
- 包含错误信息：`{ error: string, stack?: string }`
- 订阅者应有错误处理逻辑

### 4. 性能考虑

- 使用防抖（debounce）避免高频事件
- AutoClickHandler 内置防抖机制
- 批量操作时考虑事件节流（throttle）

## 故障排查

### 容器 appear 事件未触发

1. 检查容器是否被匹配到：查看 `container_tree`
2. 检查 EventDispatcher 是否正确集成到 RuntimeController
3. 确认 EventBus 正常运行：检查 `/health` 端点

### 自动点击未触发

1. 检查容器定义：`metadata.auto_click` 是否为 `true`
2. 检查 AutoClickHandler 是否初始化
3. 查看事件日志：`container:<id>:appear` 是否发送
4. 查看操作日志：`container:<id>:click` 是否发送

### 操作执行失败

1. 检查 `container:<id>:operation:failed` 事件
2. 查看错误信息：`payload.error`
3. 检查 OperationExecutor 是否正确配置
4. 确认会话和页面状态正常

## 相关文档

- `docs/arch/AGENTS.md` - 整体架构设计
- `docs/arch/PORTS.md` - 端口与服务
- `docs/arch/LAUNCHER.md` - 启动器架构
- `task.md` - 任务追踪与状态
