# WebAuto 统一状态管理（State）

## 目标

- **从 UI → scripts → blocks**：使用同一套状态 schema 与落盘机制，保证可观测、可追踪、可恢复。
- **避免重复实现**：状态读写与迁移逻辑仅允许有一个实现（`modules/state`）。
- **落盘规范**：状态与结果一律落在 `~/.webauto/download/`（或 `WEBAUTO_DOWNLOAD_ROOT` 指定目录）。

## 唯一实现

- 状态管理唯一实现：`modules/state`
- 小红书采集状态 schema + 兼容迁移：`modules/state/src/xiaohongshu-collect-state.ts`

脚本侧的历史文件（例如 `scripts/xiaohongshu/search/shared/state.mjs`）只允许作为 **兼容转发层**，不得包含新的状态读写逻辑。

## 状态文件（小红书）

- 路径：`~/.webauto/download/xiaohongshu/{env}/{keyword}/.collect-state.json`
- 写入者：Phase2/3/4 scripts（以及 legacy search orchestrator）
- 读取者：Desktop Console（结果页展示）、脚本续跑逻辑（后续逐步接入）

## 写入时机（小红书 Phase）

- Phase2（`scripts/xiaohongshu/phase2-collect.mjs`）
  - `phase2_start`：标记运行中、写入 target、记录 lastStep
  - `phase2_done`：写入 links 列表、phase2DurationMs
  - `phase2_error`：写入 failed 状态与 error（用于 UI 快速定位）
- Phase3（`scripts/xiaohongshu/phase-unified-harvest.mjs`）
  - 记录 phase3 的基本运行参数与每帖点赞统计（写入 `legacy.phase3`），并更新 lastStep/lastNoteId
- Phase4（`scripts/xiaohongshu/phase-unified-harvest.mjs`）
  - 每条 note 完成/失败：写入 detailCollection（幂等去重）
  - 结束：写入 phase4DurationMs，整体标记 completed

## UI 调用结构（Desktop Console）

- UI 不实现业务逻辑，只做参数与状态展示。
- `apps/desktop-console` 的结果页会扫描下载目录，并读取 `.collect-state.json` 的摘要信息进行展示（依赖 `dist/modules/state/...`）。

## 测试与验收

- 单测：`npm test`
- 状态模块覆盖率：`npm run test:state:coverage`（目标 ≥ 90%）

