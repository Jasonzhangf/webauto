# WebSocket API 统一化任务

## 状态
- [x] 方案落盘为文档 (docs/arch/ws-api/README.md)
- [x] JSON Schema 定义 (docs/arch/ws-api/schema.json)
- [x] 迁移方案文档 (docs/arch/ws-api/MIGRATION.md)
- [x] TypeScript 类型定义 (services/browser-service/types/ws-types.ts)
- [x] ws-server 添加新 command_type 处理器（兼容阶段）
- [ ] 更新统一请求/响应格式（request_id / response）
- [ ] 更新客户端调用代码
- [ ] 回环验证
- [ ] 删除旧逻辑（确认后）

## 当前进展
- ws-server 已支持 browser_state/page_control/dom_operation/user_action/highlight
- 旧逻辑仍保留，待回环后删除
