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
