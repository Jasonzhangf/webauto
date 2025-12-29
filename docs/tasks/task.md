# Task: Unified WebSocket API + DOM/Action Schema

## Progress

### ✅ Completed
1. 文档：完善 WEBSOCKET_API.md - 补充 DOM 数据结构、user_action 扩展定义与事件通知/订阅模型
2. 服务端：为 ws-server.ts 添加 subscribe/unsubscribe 处理和事件广播机制
3. 服务端：为 ws-server.ts 添加 dom_full / dom_branch action 实现
4. 服务端：扩展 user_action 支持 move/down/up/key 操作类型

### 📋 Pending
5. 添加客户端请求schema生成器（JSON Schema验证）
6. 服务端添加 debug 开关和日志记录
7. 编写回环测试脚本验证所有命令
8. 用户确认后删除旧兼容代码

## Implementation Details

### Subscription System
- Added `private subscriptions` and `private sessionSubscribers` to track clients
- Implemented `handleSubscribe` and `handleUnsubscribe` methods
- Added `broadcastEvent` for topic-based event distribution
- Socket close handler to cleanup subscriptions

### DOM Operations
- `handleDomFull`: Full DOM tree snapshot with configurable depth
- `handleDomBranch`: Incremental branch loading for specific paths
- Both operations broadcast `dom.updated` events to subscribers

### User Actions
- `handleExtendedUserAction`: Supports move, down, up, key operations
- DOM path resolution via `__webautoRuntime.dom.getElementByPath`
- Broadcasts `user_action.completed` events with timing and coordinates

### Events
- `dom.updated` - DOM tree changes
- `user_action.completed` - User interaction completion
- `dom.picker.result` - DOM picker selection
- `container.matched` - Container matching
- More events defined in WEBSOCKET_API.md

## Notes
- Do not commit before user verification
- All modifications follow ES module standards
- No mocks or hardcoded data
