# 调试脚本入口说明（精简版）

## 小红书采集核心流程

| 阶段 | 脚本 | 说明 |
|------|------|------|
| 启动 & 登录 | `scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs` | 启动会话 + 登录 + 自动拉起 SearchGate |
| 搜索 | `scripts/xiaohongshu/tests/phase2-search.mjs` | 容器驱动搜索（锚点+Rect 回环） |
| 详情 | `scripts/xiaohongshu/tests/phase3-detail.mjs` | 详情页提取 + 锚点验证 |
| 评论 | `scripts/xiaohongshu/tests/phase4-comments.mjs` | 评论展开 + 锚点验证 |
| 状态检查 | `scripts/xiaohongshu/tests/status-v2.mjs` | 会话/登录/容器状态 |

## 通用调试工具

| 工具 | 脚本 | 说明 |
|------|------|------|
| 容器树摘要 | `scripts/debug-container-tree-summary.mjs` | 快速查看根容器命中情况 |
| 容器树详情 | `scripts/debug-container-tree-full.mjs` | 完整容器结构 |
| 容器事件 | `scripts/test-container-events-direct.mjs` | 订阅容器事件并触发匹配 |
| 高亮验证 | `scripts/test-highlight-simple.mjs` | 简单高亮测试 |
| 容器操作 | `scripts/container-op.mjs` | 直接对容器执行操作 |
| 浏览器状态 | `scripts/browser-status.mjs` | 通用浏览器状态检查 |

## SearchGate（搜索节流）

| 工具 | 脚本 | 说明 |
|------|------|------|
| 服务启动 | `scripts/search-gate-server.mjs` | 后台速率控制服务 |
| CLI 管理 | `scripts/search-gate-cli.mjs` | start/stop/restart/status |
| 速率测试 | `scripts/xiaohongshu/tests/test-search-gate.mjs` | 验证 2次/分钟限制 |

## Workflow 运行

| 工具 | 脚本 | 说明 |
|------|------|------|
| 完整采集 | `scripts/run-xiaohongshu-workflow-v2.ts` | Workflow 一键采集 |
| 容器构建 | `scripts/build-container.mjs` | 交互式容器构建工具 |

## 历史脚本

早期探索脚本已归档至 `scripts/deprecated/`，如需查看历史实现可参考该目录。
