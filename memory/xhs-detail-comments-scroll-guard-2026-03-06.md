# XHS detail 评论采集：滚动节流与作用域守卫修复（2026-03-06）

## 背景 / 错误现象
- detail 退出后仍在滚动，说明评论滚动没有受页面作用域/锚点约束。
- 滚动过于频繁，缺少足够间隔，风控风险高。

## 关键证据（日志）
- 最近运行 runId：`2418a6e3-aa96-41af-be4d-4eb41b0ee1be`
- 路径：`~/.webauto/download/xiaohongshu/debug/unknown/merged/run-2026-03-06T01-36-39-545Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- 现象：`comments_harvest` 报 `COMMENTS_CONTEXT_MISSING`，随后仍出现大量订阅 tick + 列表事件。

## 变更内容
文件：`modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`

1. **滚动节流**
- 新增 `scrollDelayMinMs` / `scrollDelayMaxMs`（默认 1200–2200ms）。
- 每次 `wheel` 后增加随机延迟。
- 恢复滚动（PageUp/PageDown）间隔由 120ms 改为 420ms，并在恢复后追加随机延迟。

2. **作用域守卫**
- 每轮读取评论快照后检查 `detailVisible` 和 `hasCommentsContext`。
- 若失效，立即返回 `COMMENTS_CONTEXT_LOST`，防止退出 detail 后继续滚动。

## 目的 / 验收
- 滚动动作节奏放缓（>1s/次），避免高频触发风控。
- detail 关闭或评论区不可用时立即停止滚动动作。

## 备注
- 仍需后续在 detail-only 场景继续验证 scroll guard 生效。
