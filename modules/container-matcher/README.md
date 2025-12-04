# container-matcher 模块

- **职责**：
  - 根据 URL 及容器定义匹配根容器；
  - 构建容器树、收集 match map；
  - 捕获 DOM 树并附加容器注释；
  - 提供稳定性策略（等待 DOM、重试等）。
- **CLI 计划**：`bin/container matcher match-root --url <url>`, `bin/container matcher inspect-tree --url <url> --root <containerId>`。
- **当前状态**：`services/browser-service/ContainerMatcher.ts` 已迁入 `modules/container-matcher/src/index.ts`，并保持接口兼容。
