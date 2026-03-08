# 移除旧的点击进入详情获取链接的代码

## 时间
- UTC: 2026-03-06T07:04:16.284Z
- 本地: 2026-03-06 15:04:16.284 +08:00
- 时区: Asia/Shanghai

## 任务目标
- 移除 collect 脚本中旧的点击进入详情获取链接的代码
- 保留 harvest 阶段仍需使用的相关函数

## 当前实现方式
- 已使用 `readSearchTokenLinks` 从搜索结果页面直接获取链接，无需点击进入详情页
- 使用 `resolveSearchResultTokenLink` 解析搜索结果页面的链接，生成 `safeDetailUrl`

## 已移除的旧代码
1. `modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs`:
   - 移除了 `import { closeDetailToSearch } from './detail-ops.mjs';`
   - 移除了 `waitForDetailVisible` 函数
   - 移除了 `waitForSearchReady` 函数
   - 移除了 `executeSubmitSearchOperation` 中关闭详情页的逻辑
   - 移除了 `executeCollectLinksOperation` 中检查并关闭详情页的逻辑

## 保留的代码
- `detail-ops.mjs` 中的 `readDetailSnapshot` 函数（仍被 harvest 阶段使用）
- `detail-ops.mjs` 中的 `isDetailVisible`、`readDetailCloseTarget`、`closeDetailToSearch` 函数（仍被 harvest 阶段使用）
- `detail-flow-ops.mjs` 中的 `executeOpenDetailOperation` 和 `executeCloseDetailOperation`（仍被 harvest 阶段使用）
- `actions.mjs` 中的 `xhs_open_detail` 和 `xhs_close_detail` 动作注册（仍被 harvest 阶段使用）
