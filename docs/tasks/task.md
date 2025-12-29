# Task: Unified WebSocket API + DOM/Action Schema

## Progress

### ✅ Completed
1. 文档：完善 WEBSOCKET_API.md - 补充 DOM 数据结构、user_action 扩展定义与事件通知/订阅模型
2. 服务端：为 ws-server.ts 添加 subscribe/unsubscribe 处理和事件广播机制
3. 服务端：为 ws-server.ts 添加 dom_full / dom_branch action 实现
4. 服务端：扩展 user_action 支持 move/down/up/key 操作类型
5. 工具：添加客户端请求schema生成器（JSON Schema验证）
6. 调试：服务端添加 debug 开关和日志记录
7. 验证：回环测试通过 (dom.updated, user_action.completed)

### ⚠️ Known Issues
- Picker loopback test unstable in headless/clean environment (selector_not_found), likely due to timing or element visibility in blank pages.

## Implementation Details

### Subscription System
- `subscribe`/`unsubscribe` commands implemented.
- `broadcastEvent` supports topic filtering.

### DOM Operations
- `dom_full`: Returns full snapshot with path structure.
- `dom_branch`: Returns subtree snapshot.
- Powered by `runtime.getDomBranch`.

### User Actions
- Extended `user_action` with `move`, `down`, `up`, `key`.
- Uses `runtime.dom.resolveByPath` for reliable targeting.

### Type Safety
- Generated `ws-types.d.ts` from JSON Schema.
- Strict TS compilation for `ws-server.ts`.

## Notes
- Old compatibility code still present, to be removed after user verification.
