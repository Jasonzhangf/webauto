# 1688 搜索-旺旺-聊天接力 Runbook

本流程实现：
- 主页登录确认（预流程）→ 搜索页（GBK 关键词）→ 单次打开一个聊天 Tab → 注入锚点探针 → 输入并发送 → 关闭聊天 Tab → 切回搜索页。

## 路径
- 工作流文件：`sharedmodule/libraries/workflows/1688/relay/1688-search-wangwang-chat-compose.json`
- 调试探针：`local-dev/chat-anchors-probe.js`
- 新增节点：
  - `DevEvalNode`（内联/文件注入脚本）
  - `CloseHostPageNode`（按 host/urlPattern 关闭 tab）

## 关键改动
- 接入 DevEvalNode：附着聊天页后自动注入 `chat-anchors-probe.js`，把“输入整块/发送整块”写入 `data-webauto-*` 标记并高亮。
- ChatComposeNode：输入优先命中 `[data-webauto-input='1']`，发送优先命中 `[data-webauto-send='1']`；并在 1688 frame 中点击。
- 发送后：`CloseHostPageNode` 关闭 `air.1688.com` 聊天 tab，`AttachHostPageNode` 切回 `s.1688.com` 搜索结果。
- 搜索页锚点：增加了 `.input-button .input-button-text` 与 `#img-search-upload` 等兜底选择器。

## 运行
- 启动 API：`npm run start:workflow-api`
- 直接跑接力：
```
curl -s -X POST http://127.0.0.1:7701/workflow/run \
  -H 'Content-Type: application/json' \
  -d '{
    "workflowPath":"sharedmodule/libraries/workflows/1688/relay/1688-search-wangwang-chat-compose.json",
    "parameters":{ "keyword":"钢化膜" },
    "options":{ "forceNoCleanup": true }
  }'
```
- 仅对当前会话注入整块锚点（调试）：
```
node scripts/dev/eval-in-session.mjs <sessionId> local-dev/chat-anchors-probe.js
```

## 记录与追踪
- 执行记录：`archive/workflow-records/workflow-*.json`
- 行为日志：流程中多处 `BehaviorLogNode` 落盘 `behavior-*.json`
- 快照：`PageSnapshotNode` 在首页、搜索页、聊天页均保存 HTML 片段和脚本清单

## 单 Tab 顺序执行建议
- 改 `open_chat.config.maxItems=1`（已设定），循环传入 `startIndex=0..N-1`，逐条打开、发送、关闭、切回。

## 发送定位修正
- 发送按钮点击使用 `AdvancedClickNode`：
  - frame: `def_cbu_web_im_core`
  - container: `[data-webauto-send-area='1']`
  - selector: `[data-webauto-send='1']` 等回退链

## 附：快速微工作流执行（仅对当前聊天 Tab）
- 见 `/tmp/chat-send-on-current.json` 的结构：Attach → AttachHostPage(air) → Anchor → Compose(send) → Close → AttachBack → End

