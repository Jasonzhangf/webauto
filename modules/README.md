# WebAuto 模块层

本目录用于承载可复用、可 CLI 化的功能模块。每个模块必须满足：

1. **纯函数接口**：在 `src/` 下导出不依赖 UI 的函数，供服务层直接调用；
2. **CLI 入口**：可选的 `bin/` 或 `cli/` 目录，用于快速调试或在 CI 中复现；
3. **自描述**：`README.md` 需说明模块职责、输入输出以及与其它模块的关系；
4. **测试**：新增模块需要提供最基本的单元/集成测试，以便在 CI 中运行。

当前规划的模块：

- `browser-control`：浏览器驱动、profile 生命周期和 DevTools 管控；
- `session-manager`：会话创建/删除、WS 管理；
- `container-registry`：容器库读写、索引与用户自定义扩展；
- `container-matcher`：容器匹配、树构建与 DOM 捕获；
- `operations`：操作定义与统一执行器；
- `operation-selector`：结合容器/DOM 状态筛选出可执行操作；
- `storage`：profile、cookie 等持久化抽象；
- `logging`：统一日志与事件上报。

随着模块逐步完成，将在此 README 中维护它们的状态、CLI 名称与测试覆盖率。
