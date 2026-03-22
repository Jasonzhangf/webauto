# WebAuto 调试与诊断指南

> 本文迁移自 AGENTS.md，作为调试流程的唯一文档来源。

## 1) 故障收集（必做）

- 当前 URL
- DOM 摘要
- 页面截图
- run-events.jsonl
- 运行日志

## 2) 卡住 / 超时场景

- 必须做点击前后锚点校验
- 使用 elementFromPoint 确认命中
- 若命中不一致：立即停止并记录现场

## 3) 证据最小集

- 执行命令
- runId
- 失败阶段
- 错误事件
- 日志路径

## 4) 诊断产物路径

- 运行日志：`~/.webauto/logs`
- 任务日志：`~/.webauto/download/.../run.log`
- 事件流：`run-events.jsonl`
- 超时快照：`diagnostics/timeouts/*.json + *.png`


## 评论覆盖率不足的处理（2026-03-19）

当 expectedCommentsCount > 0 且 visibleCount / expectedCommentsCount < 0.9：

1. **不要在 reached_bottom 时直接退出**。
2. 触发 `coverage_retry`：
   - 回滚到评论顶部（确保 scroll 容器先获得 focus click）
   - 重新执行 expand replies pass
   - 重新向下滚动采集
3. 如果重试次数耗尽仍未达到 90%，以 `coverage_insufficient` 退出。

**关键锚点**：
- 评论容器 `.note-scroller`
- scrollSignature(top/clientHeight/scrollHeight/atBottom)
- 覆盖率 = visibleCount / expectedCommentsCount

**注意**：如果 scrollTop 在 recovery/coverage_retry 中不变，说明容器未聚焦或被遮挡，应强制 focus click。 
