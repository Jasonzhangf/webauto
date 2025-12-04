# operation-selector 模块

- **职责**：
  - 读取容器定义/能力与当前 DOM 快照；
  - 根据 Operation 元数据自动筛选可执行操作；
  - 结合用户上下文（当前焦点、选中容器）做排序/过滤。
- **CLI 计划**：`bin/operation suggest --container <id> --state <json>`。
- **状态**：规划阶段，将在完成 `operations` 基础模块后落地。
