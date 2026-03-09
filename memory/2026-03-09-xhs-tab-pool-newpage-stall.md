# 2026-03-09 XHS tab pool newPage stall

Tags: xhs, tab-pool, ensure_tab_pool, newPage, camo, browser-service, linked-repo, open_first_detail

- `ensure_tab_pool` 的前置卡点来自 browser-service `newPage`，旧实现单次可耗时约 35s，导致 autoscript 在 `operation_start` 后长期无 `done/error`。
- 当前仓 `modules/camo-backend/src/internal/browser-session/page-management.ts` 已改为优先 `ctx.newPage()`，再回退 shortcut/OS shortcut，并新增对应单测。
- 真实 7704 运行时加载的是 linked repo `/Volumes/extension/code/camo@0.1.23`，不是当前仓内实现；要做真实验证必须同步修复到该 repo 并重启 browser-service。
- 同步修复后，`scripts/test/open-4-tabs.mjs --profile xhs-qa-1 --tab-count 2` 已秒级完成，`ensure_tab_pool` 不再卡死。
- 后续真实 `webauto xhs unified --profile xhs-qa-1 --keyword deepseek --max-notes 2 --tab-count 2` 已越过 `ensure_tab_pool`，但在 `open_first_detail` 失败，错误为 `INVALID_PARAMS: noteId or noteUrl required in single mode`。
- 因此 `note_binding_mismatch` 这轮仍未验证到；新的前置阻塞已经从 tab-pool 前移到 detail open 参数装配。
