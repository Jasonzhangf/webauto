# 2026-03-09 XHS tab pool newPage stall

Tags: xhs, tab-pool, ensure_tab_pool, newPage, camo, browser-service, linked-repo, open_first_detail

- `ensure_tab_pool` 的前置卡点来自 browser-service `newPage`，旧实现单次可耗时约 35s，导致 autoscript 在 `operation_start` 后长期无 `done/error`。
- 当前仓 `modules/camo-backend/src/internal/browser-session/page-management.ts` 已改为优先 `ctx.newPage()`，再回退 shortcut/OS shortcut，并新增对应单测。
- 真实 7704 运行时加载的是 linked repo `/Volumes/extension/code/camo@0.1.23`，不是当前仓内实现；要做真实验证必须同步修复到该 repo 并重启 browser-service。
- 同步修复后，`scripts/test/open-4-tabs.mjs --profile xhs-qa-1 --tab-count 2` 已秒级完成，`ensure_tab_pool` 不再卡死。
- 后续真实 `webauto xhs unified --profile xhs-qa-1 --keyword deepseek --max-notes 2 --tab-count 2` 已越过 `ensure_tab_pool`，但在 `open_first_detail` 失败，错误为 `INVALID_PARAMS: noteId or noteUrl required in single mode`。
- 因此 `note_binding_mismatch` 这轮仍未验证到；新的前置阻塞已经从 tab-pool 前移到 detail open 参数装配。

## 2026-03-10 Linked Camo Fix Verified

- 真实使用的 `camo` CLI 仍解析到 linked repo：`/Volumes/extension/code/camo`，不是当前仓内 vendored 实现。
- 已把 `trackedPages + forceAlive` 修复同步到 linked repo：
  - `src/services/browser-service/internal/browser-session/page-management.js`
  - `src/services/browser-service/internal/browser-session/page-management.test.js`
- linked repo 定向单测通过：
  - `node --test /Volumes/extension/code/camo/src/services/browser-service/internal/browser-session/page-management.test.js`
- linked repo 已重建：
  - `npm run build` in `/Volumes/extension/code/camo`
- 真实 camo probe 已验证新页不会再从 `page:list` 消失：
  - 证据：`.tmp/camo-tab-lifecycle-probe-1773143947294.json`
  - blank 场景：`newPage.index=1`，连续轮询 `count=2`，`disappeared=false`
  - seeded 场景：`newPage.index=2`，连续轮询 `count=3`，`disappeared=false`
- 真实 4-tab detail 再验证已越过旧 blocker 并完整跑完：
  - 命令：`node apps/webauto/entry/xhs-unified.mjs --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 4 --auto-close-detail true --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 4`
  - runId：`c3f9b7cd-ba9d-4577-b8e4-556b7568a747`
  - 目录：`~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-10T12-00-14-477Z/`
  - `summary.json` 关键结果：
    - `openedNotes=4`
    - `commentsCollected=618`
    - `commentsExpected=1109`
    - `commentsReachedBottomCount=4`
    - `terminalCode=AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`
- 结论：旧的“real camo page:list 看不到新 tab，导致卡死在 ensure_tab_pool”问题已经在 linked camo 上被真实修复；当前链路已能进入 detail、采到底部、关闭详情并继续下一帖。
