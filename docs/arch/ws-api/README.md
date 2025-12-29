# WebSocket API 统一规范

## 目标
- 统一 WebSocket 命令结构
- 统一 DOM 数据交付格式（全量/局部）
- 统一端点与文档
- 支持扩展（operation 操作）

## 统一消息结构

### 请求（command）
```json
{
  "type": "command",
  "request_id": "uuid",
  "session_id": "profile-id",
  "data": {
    "command_type": "browser_state | page_control | dom_operation | user_action | highlight | container_operation",
    "action": "string",
    "parameters": {}
  }
}
```

### 响应（response）
```json
{
  "type": "response",
  "request_id": "uuid",
  "success": true,
  "data": {},
  "error": null
}
```

### 事件（event）
```json
{
  "type": "event",
  "topic": "string",
  "session_id": "profile-id",
  "data": {}
}
```

## 1. 控制命令统一结构

### 1.1 浏览器状态
```json
{
  "command_type": "browser_state",
  "action": "get_status",
  "parameters": {
    "include_profiles": true,
    "include_sessions": true
  }
}
```

返回数据建议字段：
```json
{
  "profiles": [{ "id": "weibo_fresh", "status": "active" }],
  "sessions": [{ "id": "weibo_fresh", "page_url": "https://weibo.com" }],
  "browser": { "version": "...", "headful": true }
}
```

### 1.2 页面控制
```json
{
  "command_type": "page_control",
  "action": "navigate",
  "parameters": { "url": "https://weibo.com" }
}
```

### 1.3 DOM 获取
```json
{
  "command_type": "dom_operation",
  "action": "get_tree",
  "parameters": { "path": "root", "depth": 3, "max_children": 50 }
}
```

### 1.4 操作扩展（operation）
```json
{
  "command_type": "user_action",
  "action": "operation",
  "parameters": {
    "operation_type": "click | scroll | type | hover | drag",
    "target": {
      "selector": "string",
      "xpath": "root/1/2/3",
      "coordinates": { "x": 0, "y": 0 }
    },
    "options": {}
  }
}
```

## 2. DOM 数据结构

### 2.1 全量 DOM 树
```json
{
  "dom_tree": {
    "path": "root",
    "tag": "html",
    "id": null,
    "classes": [],
    "text": "",
    "childCount": 2,
    "children": [
      { "path": "root/0", "tag": "head", "childCount": 5, "children": [] }
    ]
  },
  "metadata": {
    "root_selector": "#app > div[class*='Frame_wrap_']",
    "url": "https://weibo.com"
  }
}
```

### 2.2 局部 DOM 分支（基于 xpath）
```json
{
  "dom_branch": {
    "path": "root/1/2",
    "tag": "div",
    "id": "content",
    "classes": ["main"],
    "text": "...",
    "childCount": 3,
    "children": [
      { "path": "root/1/2/0", "tag": "p", "childCount": 0, "children": [] }
    ]
  }
}
```

## 3. 统一端点

- Unified API: `ws://127.0.0.1:7701/ws`
- Browser Service: `ws://127.0.0.1:7704/ws`

> 统一命令结构适用于 7701/7704 两类服务，响应格式保持一致。

## 4. JSON Schema

采用 JSON Schema 提供统一校验能力，方便扩展。
- `docs/arch/ws-api/schema.json`

## 5. 扩展策略

- 新增命令类型在 `command_type` 里扩展
- `action` 保持细粒度
- `parameters` 允许不同操作类型扩展字段
- 所有新增字段需补充 JSON Schema
