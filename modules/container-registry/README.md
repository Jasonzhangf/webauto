# container-registry 模块

- **职责**：
  - 读取 `container-library/`（内置）与 `~/.webauto/container-lib/`（用户扩展）的容器定义；
  - 解析 `container-library.index.json` 索引文件；
  - 提供 CRUD API（后续支持 Operation 挂载、版本管理）。
- **CLI 计划**：`bin/container list --url <url>`, `bin/container show --id <container>`, `bin/container update-selector ...`。
- **当前状态**：已从 `services/browser-service/ContainerRegistry.ts` 迁移至 `modules/container-registry/src/index.ts`，并由服务层、脚本通过 re-export 兼容调用。
