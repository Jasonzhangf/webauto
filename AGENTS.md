# WebAuto Agent Rules (Canonical)

本文件只放“通用规则 / 硬性约束 / 入口索引”，避免把过时的实现细节长期固化在这里。
具体任务、进度、验收与证据：一律用 `bd` 管理。

## 0. 开发与验证要求（强制）

- 任何“已完成”的结论必须有验证证据：命令、关键输出（runId/耗时/计数）、日志路径。
- 新功能必须保证：唯一实现（不重复造轮子）、有单测 + 回归测试、覆盖率 >= 90%（覆盖范围须明确）。
- 修复必须选择“唯一最佳修复点”（不要局部 patch）。
- 完成任务后清理临时文件/脚本/散落文件（尤其是临时 profile / 临时输出）。
- 发现脚本问题：不要关闭；先用 WS/Unified API 拉取页面信息 + 日志定位原因再修。

## 1. 端口与健康检查

| 端口 | 服务 | 说明 |
|------|------|------|
| 7701 | Unified API（HTTP + WebSocket + Bus） | 主入口：HTTP REST API、WebSocket、Bus |
| 7704 | Browser Service（HTTP） | 会话管理 HTTP 接口 |
| 8765 | Browser Service WebSocket | 会话管理实时通道 |

快速验证：

```bash
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

## 2. 分层与职责边界

- 脚本：仅 CLI 参数解析，不含业务逻辑。
- 模块：独立能力单元，通过 HTTP/WebSocket 通信。
- 服务：无业务逻辑，纯技术实现。
- UI：纯展示与触发（不做编排/逻辑判断）。
- App/Orchestrator：负责编排与生命周期管理，把 UI 输入归一化成脚本/模块可执行参数。

## 3. 小红书风控安全规则（一级规则）

- 禁止构造 URL 直达搜索/详情；必须“页面内输入框搜索 + 回车”。
- 禁止读取 `href` 后自行拼接详情链接（缺 `xsec_token` 会 404/风控）。
- 详情链接必须通过“点击进入帖子后读取当前 URL（含 xsec_token）”。
- 所有搜索必须先走 SearchGate（60s 窗口最多 2 次/同 key）。

## 4. 系统级操作原则（强制）

- 所有点击/输入/滚动/返回必须使用系统级 API（Playwright mouse/keyboard），禁止 DOM click/JS scroll/history.back。
- 允许的 JS：仅用于读取状态（如 rect/可见性）。

## 5. 视口约束（强制）

- 所有操作必须基于视口内可见元素；离屏元素必须先滚动带入视口。
- 每步操作需要 anchor + rect 验证，并支持高亮闭环。

## 6. 调试与诊断（必须会用）

- 出错时优先：
  - 读取当前 URL/DOM 摘要/截图（通过 Unified API / WS）。
  - 查看 `~/.webauto/logs` 与 `~/.webauto/download/.../run.log`、`run-events.jsonl`。

常用脚本入口（示例）：

- `node scripts/browser-status.mjs <profile> [--site xiaohongshu|weibo] [--url URL]`
- `node scripts/container-op.mjs <profile> <containerId> <operationId> [--config JSON]`

## 7. Beads (bd) 任务管理（强制）

AGENTS.md 只放规则；所有具体任务/进度/证据都必须写到 bd。

- 初始化（推荐个人本地，不污染仓库）：`bd init --stealth`
- 查看可做任务：`bd ready`
- 创建任务：`bd create "Title" -p 0 --description "..."`
- 建依赖：`bd dep add <child> <parent>`
- 看任务详情：`bd show <id>`
- 搜索（全文检索）：`bd search "关键词"`
- 列表筛选（字段过滤）：`bd list --status open --priority 1`

bd 搜索速查（全文检索 + 字段过滤）：

1) bd search：全文检索（标题/描述/ID）

- 基础：
  - `bd search "关键词"`
  - `bd search "authentication bug"`
  - `bd search "bd-a3f8"`
  - `bd search --query "performance"`
- 常用过滤：
  - `bd search "bug" --status open`
  - `bd search "database" --label backend --limit 10`
  - `bd search "refactor" --assignee alice`
  - `bd search "security" --priority-min 0 --priority-max 2`
- 时间范围：
  - `bd search "bug" --created-after 2025-01-01`
  - `bd search "refactor" --updated-after 2025-01-01`
  - `bd search "cleanup" --closed-before 2025-12-31`
- 排序与展示：
  - `bd search "bug" --sort priority`
  - `bd search "task" --sort created --reverse`
  - `bd search "design" --long`
- sort 支持字段：`priority, created, updated, closed, status, id, title, type, assignee`

2) bd list：字段级精确过滤（缩小范围）

- 状态/优先级/类型：
  - `bd list --status open --priority 1`
  - `bd list --type bug`
- 标签：
  - `bd list --label bug,critical`
  - `bd list --label-any frontend,backend`
- 字段包含（子串）：
  - `bd list --title-contains "auth"`
  - `bd list --desc-contains "implement"`
  - `bd list --notes-contains "TODO"`
- 日期范围：
  - `bd list --created-after 2024-01-01`
  - `bd list --updated-before 2024-12-31`
  - `bd list --closed-after 2024-01-01`
- 空字段筛选：
  - `bd list --empty-description`
  - `bd list --no-assignee`
  - `bd list --no-labels`
- 优先级范围：
  - `bd list --priority-min 0 --priority-max 1`
  - `bd list --priority-min 2`
- 组合过滤：
  - `bd list --status open --priority 1 --label-any urgent,critical --no-assignee`

任务描述必须包含：目标、验收标准、证据路径/命令（runId、日志路径）、禁止事项。

## 8. 参考文档索引

- `container-library/README.md`
- `container-library/xiaohongshu/README.md`
- `scripts/xiaohongshu/README.md`
- `scripts/xiaohongshu/README-workflows.md`
- `docs/arch/SEARCH_GATE.md`
- `docs/arch/REGRESSION_CHECKLIST.md`
