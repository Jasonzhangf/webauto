# operations 模块

- **职责**：定义滚动、点击、highlight、表单填充等原子操作，并提供统一的执行引擎；
- **扩展性**：每个 Operation 通过 `operationId` 注册描述（输入/输出/依赖能力），以便与容器和 selector 配合；
- **CLI 计划**：`bin/operation run --op <operationId> --payload <json>`。
- **状态**：规划阶段，将结合现有浮窗命令与容器 `operations` 字段逐步实现。
