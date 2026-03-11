# ensure_tab_pool 超时修复（锚点检测）

## 背景

detail 模式下 `ensure_tab_pool` 卡住，原因是无条件轮询 `page:list` 等待页面数量增加。

## 证据

- runId: `30082f1c-5232-46ad-9b01-d005f04fdf5c`
- 事件日志停在 `ensure_tab_pool` 的 `operation_start`
- 未产生 `operation_done` 或后续 `open_first_detail`

## 修复内容

在 `openTabBestEffort` 中增加锚点检测：
- 如果 `waitForTabCountIncrease` 失败，则通过 `captureCheckpoint` 检测 `xiaohongshu_home.search_input`
- 锚点存在即认为新标签页打开成功（返回 `mode: newPage_anchor`）

### 修改文件
- `modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs`

### 修改摘要
- 添加 `captureCheckpoint` 引用
- 在 `openTabBestEffort` 中新增 `waitForAnchor` 检测
- `ensure_tab_pool` 超时时触发锚点检测，不再无条件等待

## 验证
- `npm run build:services` 构建通过
- 新 run 后续待验证（ensure_tab_pool 是否仍超时）

Tags: ensure_tab_pool, timeout, anchor, checkpoint, tab, detail
