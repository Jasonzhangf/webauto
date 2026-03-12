# 2026-03-12 Collect 卡住修复：`:has()` 选择器解析误匹配

## 背景
- 用户反馈 collect 之前可用，现在看起来改坏。
- 关键症状：`submit_search` 后没有继续进入 `verify_collect_subscriptions/collect_links`，任务看似“挂住”。

## 证据
- 失败基线 runId: `bbfefd2a-8665-4402-8654-3508bfac929e`
- 事件日志：
  - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/seedance2.0/collect/run-2026-03-11T18-36-08-568Z/profiles/wave-001.xhs-qa-1.events.jsonl`
  - 现象：`submit_search` 执行后，`search_result_item` 长时间 `count=0`，后续 collect 依赖事件无法触发。

## 根因
- `modules/camo-runtime/src/container/change-notifier.mjs` 的 `parseCssSelector` 直接用正则提取 `.class`，会把 `:has(a.cover)` 中的 `.cover` 误当作目标节点 class。
- 导致选择器 `#search-result .note-item:has(a.cover)` 被误解释为“目标节点同时具备 `note-item` 和 `cover`”，从而匹配失败。

## 修复
1. `change-notifier.mjs`
   - 在解析 css segment 前剥离伪类/伪元素 token（如 `:has(...)`、`:nth-child(...)`、`::before`）。
   - 仅对“外层 selector”做 tag/id/class/attr 提取，避免把伪类内部 token 计入目标节点约束。
2. 保持 collect 门禁
   - `verify_collect_subscriptions`、`collect_links` 保持 `dependsOn: ['submit_search']`，避免首页 feed 误触发 collect。

## 回归验证
- 单测：
  - `node --test tests/unit/container/change-notifier.test.mjs tests/unit/webauto/xhs-collect-output-root.test.mjs`
  - 结果：`23/23 pass`
- UI CLI 最小链路：
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
  - 结果：全部 `ok=true`
- UI CLI full-cover：
  - `node bin/webauto.mjs ui cli full-cover --json`
  - 结果：`ok=true`，报告 `/.tmp/ui-cli-full-cover-2026-03-12T01-51-18-373Z.json`
- collect 最小链路：
  - `node bin/webauto.mjs xhs collect --profile xhs-qa-1 --keyword "seedance2.0" --max-notes 5 --env debug --output-root ./.tmp/collect-regression-20260312`
  - runId: `a0d65fa0-c632-43da-8774-66aa9e80dde1`
  - 观测到 `search_result_item.exist count=15` 且流程进入 `wait_search_permit`；本次失败为 `SEARCH_GATE_REJECTED`（非“事件不触发卡住”）。

Tags: collect, search_result_item, selector, has-pseudo, change-notifier, xhs, regression, 2026-03-12

## 二次实跑（修复后完整 collect 成功）
- 先执行：`node bin/webauto.mjs xhs gate reset --platform xiaohongshu --json`
- 再执行：
  - `node bin/webauto.mjs xhs collect --profile xhs-qa-1 --keyword "seedance2.0" --max-notes 5 --env debug --output-root ./.tmp/collect-regression-20260312-r2`
- runId：`81362ccc-e9b0-4807-b653-639382713d7a`
- summary：`./.tmp/collect-regression-20260312-r2/xiaohongshu/debug/seedance2.0/collect/run-2026-03-12T01-54-46-413Z/profiles/wave-001.xhs-qa-1.summary.json`
- 结果：`ok=true`、`terminalCode=AUTOSCRIPT_DONE_LINKS_COLLECTED`、`searchCount=1`、`operationErrors=0`
- 事件链路证据：events 中完整出现
  - `wait_search_permit -> fill_keyword -> submit_search`
  - `verify_subscriptions_all_pages -> verify_collect_subscriptions -> collect_links -> finish_after_collect_links`

## Collect 200 Ready 基线
- 命令：`node bin/webauto.mjs xhs collect --profile xhs-qa-1 --keyword "seedance2.0" --max-notes 200 --env debug --output-root ./.tmp/collect-ready-200`
- runId：`63f7d7e2-86ab-4dd1-9f98-b67e31c90bae`
- summary：`./.tmp/collect-ready-200/xiaohongshu/debug/seedance2.0/collect/run-2026-03-12T02-01-10-138Z/profiles/wave-001.xhs-qa-1.summary.json`
- 结果：`ok=true`，`terminalCode=AUTOSCRIPT_DONE_LINKS_COLLECTED`
- 产物：`safe-detail-urls.jsonl` 共 `200` 行，`noteId` 去重后 `200`
- 约束确认：collect 已作为稳定基线，不再主动修改 collect，除非重大变更且先征得用户同意。
