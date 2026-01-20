# 小红书 Search 脚本拆分计划（执行顺序）

## 现状

- `scripts/xiaohongshu/tests/phase2-search.mjs`：搜索验证脚本（可复用输入/列表容器探针）
- `scripts/xiaohongshu/tests/phase2-4-loop.mjs`：全链路（搜索→详情→评论→落盘）但文件偏大且逻辑耦合
- `scripts/xiaohongshu/orchestrator.mjs`：已实现后台串联验证（Phase1 + Phase2-4）

## 拆分目标

- 所有新模块放在 `scripts/xiaohongshu/search/` 下
- 每个文件 < 500 行
- scripts 只做 CLI/参数解析，业务逻辑下沉到 modules（后续）或 search/shared

## 执行步骤

### Step 0：建立目录结构（已完成）

- [x] `scripts/xiaohongshu/search/`
- [x] `docs/xiaohongshu/`

### Step 1：落盘架构文档（已完成）

- [x] `docs/xiaohongshu/search-architecture.md`

### Step 2：落盘拆分计划（本文件）

- [x] `docs/xiaohongshu/search-split-plan.md`

### Step 3：抽取 shared 工具（第一批）

- [ ] `scripts/xiaohongshu/search/shared/logger.mjs`
- [ ] `scripts/xiaohongshu/search/shared/retry.mjs`
- [ ] `scripts/xiaohongshu/search/shared/daemon.mjs`（复用 `scripts/xiaohongshu/shared/daemon-wrapper.mjs`）
- [ ] `scripts/xiaohongshu/search/shared/io.mjs`（统一 content.md/comments.md 落盘）

### Step 4：抽取 blocks（第二批）

- [ ] `blocks/search-input.mjs`：封装 GoToSearchBlock + SearchGate
- [ ] `blocks/list-scroll.mjs`：滚动重试/回滚/等待 60s 策略
- [ ] `blocks/open-detail.mjs`：封装 OpenDetailBlock + URL 校验
- [ ] `blocks/collect-comments.mjs`：封装 CollectCommentsBlock

### Step 5：实现 phases（第三批）

- [ ] `phases/phase1-login.mjs`：复用 `phase1-session-login-with-gate.mjs` 逻辑（内部调用）
- [ ] `phases/phase2-list.mjs`：从 `phase2-4-loop.mjs` 拆出 list-only 采集
- [ ] `phases/phase3-4-comments.mjs`：从 `phase2-4-loop.mjs` 拆出详情+评论采集

### Step 6：实现 search/orchestrator

- [ ] `scripts/xiaohongshu/search/orchestrator.mjs`
  - 前台模式默认
  - `--daemon` 使用后台 wrapper
  - 最终只暴露一个命令

### Step 7：回归验证

- [ ] `node scripts/xiaohongshu/search/orchestrator.mjs --keyword "雷军" --count 200 --env download --daemon`
- [ ] 验证输出目录：
  - 存在 noteId 子目录
  - 每条至少 `content.md`
  - 评论存在 `comments.md`

## 里程碑

- M1：search/orchestrator 能跑通 20 条（含评论）
- M2：search/orchestrator 能跑通 200 条（含评论）
- M3：phase2-4-loop.mjs 仅保留为 tests（或 deprecated）

