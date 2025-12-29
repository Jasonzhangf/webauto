# ws-server 迁移计划

## 现有结构分析

### 现有命令类型
- `session_control` (create/list/close)
- `mode_switch`
- `container_operation`
- `node_execute` (navigate/click/type/screenshot/query)
- `dev_control`
- `dev_command` (pick_dom/highlight_element/highlight_dom_path)

### 现有 node_execute 中的 action
- `navigate` → page_control.navigate
- `click` → user_action.operation (click)
- `type` → user_action.operation (type)
- `screenshot` → page_control.screenshot
- `query` → dom_operation.query

## 迁移策略（两阶段）

### 阶段 1：添加新处理器（保持兼容）
在 `dispatchCommand` 中添加新的 command_type 分支：
- `browser_state` → 新增 handler（复用 handleSessionControl）
- `page_control` → 新增 handler（复用 navigate/screenshot 逻辑）
- `dom_operation` → 新增 handler（复用 query 逻辑）
- `user_action` → 新增 handler（复用 click/type 逻辑）
- `highlight` → 新增 handler（复用 highlight_element/highlight_dom_path）
- `container_operation` → 保持不变

### 阶段 2：删除旧代码（验证后）
移除旧的 command_type：
- `node_execute`
- `dev_command`
保留 `session_control` 和 `container_operation`（已符合）

## 兼容映射表

| 旧调用 | 新调用 | 映射关系 |
|--------|--------|---------|
| node_execute+navigate | page_control+navigate | 直接映射 |
| node_execute+click | user_action.operation+click | operation_type=click |
| node_execute+type | user_action.operation+type | operation_type=type |
| dev_command+highlight_element | highlight+element | 直接映射 |
| dev_command+highlight_dom_path | highlight+dom_path | 直接映射 |
| node_execute+query | dom_operation+query | 直接映射 |
