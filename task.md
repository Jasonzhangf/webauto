# Floating Panel UI 改善计划（MVP → 完整）

目标：完善浮窗 UI 绘制、用户交互与编辑容器流程，解决无 operation 时不显示内容的问题，并支持从无到有创建 operation。

## 当前状态
- 评审完成：已阅读 `apps/floating-panel/src/renderer/index.mts`、`graph.mjs`、`graph/view.mts` 等核心实现。
- 关键问题：空容器时缺少明确引导；operation 编辑能力存在但 UI 不够直观；“从无到有”缺少可视化入口与可理解反馈。

## MVP 阶段（优先落地）
- [x] MVP-1：优化空状态 UI（无 operation 时的引导与默认内容）。
- [x] MVP-2：空容器一键生成默认 operation（基于主 selector）。
- [x] MVP-3：改善 operation 添加表单的视觉层次与交互提示。

## 完整功能阶段（迭代跟进）
- [x] FULL-1：可视化 operation 卡片列表（替代纯 JSON 预览）。
- [x] FULL-2：operation 内联编辑（卡片展开编辑）。
- [x] FULL-3：operation 删除/禁用（删除按钮+toggle启用禁用）。
- [ ] FULL-4：operation 配置智能提示与 JSON 校验。
- [ ] FULL-5：operation 实时预览（highlight/scroll/extract）。
- [ ] FULL-6：operation 模板库 + 新手向导。

## 执行记录
- 2025-01-02：计划建立；完成 MVP-1 / MVP-2（空状态引导 + 一键默认 operation）。
- 2025-01-02：完成 MVP-3（operation 添加表单分组与提示）。
- 2025-01-02：完成 FULL-1（operation 可视化卡片 + 图标）、FULL-2（编辑按钮聚焦 JSON 编辑器）。
- 2025-01-02：完成 FULL-3（operation 删除/禁用按钮，支持状态切换与确认删除）。

## 技术问题修复记录
- 2025-01-02：修复 TypeScript 返回值类型错误（DOMInspector.ts 的 start/stop 方法）。
- 2025-01-02：重构 container-operations.mjs，从 Express 风格改为原生 HTTP 处理器，适配 unified-api 统一路由架构。
- 2025-01-02：实现 controller.ts 中的 captureInspectorSnapshot 方法（从 .js 迁移逻辑到 .ts）。
- 2025-01-02：添加 controller.ts 缺失的辅助方法（fetchSessionsInternal/findSessionByProfile/captureSnapshotFromFixture/focusSnapshotOnContainer/cloneContainerSubtree）。

## 暂挂测试
- ✅ 所有修复已验证通过，服务正常启动：
  - Unified API: http://127.0.0.1:7701 ✅
  - Browser Service: http://127.0.0.1:7704 ✅
  - 浮窗UI已连接 ✅
  - 容器匹配功能正常 ✅

## 测试验证记录
- 2025-01-02：直接运行 `node scripts/start-headful.mjs` 启动成功，所有服务健康。
- controller.ts 的 captureInspectorSnapshot 实现正确，容器匹配验证通过。
- 2025-01-02：修复浮窗UI构建错误（重复的.join()调用、缺少async关键字），重新构建成功。
  - 新构建时间：2026-01-02 13:31:41
  - 准备重启浮窗测试UI改进功能
- 2025-01-02：增强启动健康检查，新增浮窗UI健康验证：
  - launcher 增加 verifyFloatingPanelHealth() 函数
  - 浮窗渲染器响应 ping/pong 机制
  - 验证浮窗总线连接和事件接收能力
  - 构建成功，准备完整重启验证


## 2026-01-02 当前实际状态

### 已修复的问题
- ✅ server.ts 中 import 路径错误（.js 改为 .mjs）
- ✅ test-preload.mjs 测试脚本缺失
- ✅ test-highlight-complete.mjs 使用错误的API路径（改为action接口）

### 当前存在的核心问题
1. **浮窗UI无法显示DOM连接**
   - 现象：容器匹配成功，但浮窗没有画出DOM连接
   - 根因待查：可能是UI初始化问题或数据未正确传递

2. **渲染帧错误**
   - 错误："Render frame was disposed before WebFrameMain could be accessed"
   - 影响：主进程向渲染进程发送消息失败
   - 需要修复：apps/floating-panel/src/main/index.mts

3. **高亮功能部分失败**
   - 容器匹配：✅ 成功
   - selector高亮：❌ count=0
   - dom_path高亮：❌ count=0
   - 可能原因：selector不匹配或页面未加载完成

### 优先级修复顺序
1. 修复渲染帧错误（阻塞性bug）
2. 确保浮窗UI能正确初始化并显示DOM连接
3. 完善健康检查机制
4. 修复高亮功能
5. 实现UI改善功能


