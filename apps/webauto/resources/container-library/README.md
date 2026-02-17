# Container Library 指南

容器定义采用“页面根容器 → 子容器”的树状结构：

1. **根容器（page）**：与某个 URL 模式对应，包含 `page_patterns`、`selectors`、`children`。示例：`apps/webauto/resources/container-library/xiaohongshu/detail/container.json`。
2. **子容器（section/list/item/button 等）**：挂在根容器或其子容器之下，紧贴实际 DOM 层级。
3. **目录结构**：每个容器一个目录，目录内只有 `container.json`（和继续递归的子目录）。路径尽量与容器 ID 匹配，例如 `xiaohongshu/detail/comment_section/comment_item` ↔ `xiaohongshu_detail.comment_section.comment_item`。

常见配置：

- `selectors`: 用于匹配容器 DOM。
- `operations`: e.g. `highlight`, `scroll`, `find-child`, `click`, `extract`。
- `metadata.auto_click`: 自动点击容器（例如“展开更多”）。

更多细节参考各站点 README：

- [小红书容器库](xiaohongshu/README.md)

Workflow/Agent 调试规范见仓库根目录 `AGENTS.md`。
