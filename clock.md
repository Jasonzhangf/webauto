# Clock 任务 - Tab 池管理修复

## 背景
小红书压力测试发现 Tab 泄漏问题，32个 tab 而不是预期的 5 个。

## 当前状态
**已修复 Tab 池管理**

## 下次提醒要做的第一步
重新启动压力测试验证修复效果

## 不能忘的检查项
- Tab 数量应该严格限制为 5 个
- Tab 1 = 搜索页/主页
- Tab 2-5 = 轮转详情页
- 切换间隔 2-5 秒随机

## DELIVERY
**已修复**：
1. 统一使用 `newTab` API（不再混用 newPage）
2. 添加 `closeExcessTabs` 函数关闭多余 tab
3. 添加 `syncTabPoolWithBrowser` 同步状态
4. Tab 布局明确：1个搜索页 + 4个轮转详情页

**修改文件**：
- `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs` - 重写
- `modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs` - newPage → newTab

## 巡检记录

### [20:15 CST] 修复完成
- 重写 tab-ops.mjs
- 统一使用 newTab API
- 添加 tab 关闭机制
- 下一步：启动压力测试验证

### [19:50 CST] 问题诊断
- Tab 泄漏：32个而不是5个
- 评论采集停止
- 原因：API混用 + 无关闭机制
