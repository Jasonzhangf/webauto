# WebAuto 浮窗 UI 完善实施计划

## 背景

已成功恢复到稳定版本（commit 91c1ebb），系统可以正常启动，容器匹配功能正常。
现在的目标是完善浮窗 UI 的绘制、用户交互和容器编辑功能。

## 当前状态

- ✅ Unified API 服务正常运行 (7701)
- ✅ Browser Service 服务正常运行 (7704)  
- ✅ 容器匹配功能正常
- ✅ 浮窗 UI 已启动并连接
- ✅ 系统可以创建容器并进行编辑
- ✅ DOM-DOM 图形显示正常
- ✅ 容器-DOM 关联正常
- ✅ 容器编辑功能 CRUD 完整
- ✅ 操作演练真实执行
- ✅ 空容器显示正确
- ✅ CapturePanel 和 ContainerTree 组件已集成

## 实施计划

### 阶段 1: 基础功能验证（MVP） ✅ 已全部完成

#### 1.1 完善容器编辑界面 ✅ 已完成

**已完成功能（commit 5549f33 + 181b621）：**

✅ **Operation 列表显示**
   - 显示已有的 operations 列表（按执行顺序）
   - 每个 operation 显示：类型、触发事件、配置预览
   - 按事件分组显示（appear、click、manual:rehearsal）
   - 空状态提示（无 operations 时）

✅ **Operation CRUD 操作**
   - **Create**: 列表下方显示快速添加面板，支持选择触发事件和操作类型
   - **Read**: 操作列表按事件分组显示，包含图标、类型、配置预览
   - **Update**: 点击编辑按钮弹出浮层编辑器，支持修改类型、触发事件、配置 JSON
   - **Delete**: 删除 operation（即时更新）

✅ **Operation 测试功能**
   - 演练按钮调用 unified-api 的 operations:run 接口
   - 在浏览器中真实执行操作
   - 显示执行结果（成功/失败）浮层提示
   - 3秒后自动关闭

✅ **事件触发机制**
   - 支持基本事件：`appear`（出现）、`click`（点击）、`change`（变化）
   - 支持自定义事件：允许用户输入自定义事件名（custom:xxx）
   - 事件选择器：checkbox + 自定义输入框

✅ **根容器特殊操作**
   - 页面级操作挂在根容器：scroll（滚动）、wait（等待）、navigate（导航）
   - 根容器 UI 显示不同的操作类型选项
   - 显示 [根容器] 标识

#### 1.2 完善旧容器显示问题 ✅ 已完成

**验证结果：**

✅ **空 operation 容器显示**
   - renderOperationsList 正确处理空容器
   - 有 selector/domPath 时生成建议操作
   - 无目标信息时显示空状态提示
   - buildDefaultOperations 功能正常

✅ **默认 operation 生成**
   - buildDefaultOperations 逻辑正确
   - selector/domPath 正确传递到 config
   - 生成的操作可以正常执行

✅ **UI 渲染**
   - renderEmptyState 显示友好清晰
   - 生成默认 Operation 按钮功能正常
   - 快速添加面板在所有容器上正常显示
   - 状态转换流畅

**详细验证报告：** STAGE_1.2_VALIDATION.md

#### 1.3 完善 UI 组件功能 ✅ 已完成

**验证结果：**

✅ **组件集成**
   - index.html 添加了捕获面板和容器树入口
   - index.mts 正确初始化并加载组件
   - Tab 切换功能正常

✅ **CapturePanel 组件**
   - 渲染正常，交互逻辑通过测试
   - 回调函数正确绑定

✅ **ContainerTree 组件**
   - 渲染正常，交互逻辑通过测试
   - 选择事件正确触发

**详细验证报告：** STAGE_1.3_SUMMARY.md

### 阶段 2: 功能完善 ⏳ 待开始

#### 2.1 UI 绘制增强
- [ ] 优化 DOM 树的渲染性能
- [ ] 改进容器-DOM 连线的显示效果
- [ ] 添加选中高亮效果

#### 2.2 用户交互优化
- [ ] 添加快捷键支持
- [ ] 优化拖拽体验
- [ ] 添加撤销/重做功能

#### 2.3 容器编辑完善
- [ ] 添加 operation 模板库
- [ ] 支持 operation 的复制粘贴
- [ ] 添加批量编辑功能
- [ ] 支持拖拽调整 operation 顺序

### 阶段 3: 高级功能

#### 3.1 自动化增强
- [ ] 添加智能 operation 推荐
- [ ] 自动生成默认 operations
- [ ] AI 辅助编辑

#### 3.2 数据持久化
- [ ] 优化保存机制
- [ ] 添加版本历史
- [ ] 支持导入导出

#### 3.3 调试工具
- [ ] 添加 operation 执行调试
- [ ] 实时预览功能
- [ ] 性能分析工具

## 当前重点

阶段 1 已全部完成。接下来的工作将集中在阶段 2，重点提升 UI 性能和交互体验。

## Git 提交历史

- commit 5549f33: feat(floating-panel): 完善容器编辑界面 CRUD 功能
- commit 181b621: feat(floating-panel): 实现操作演练的真实执行功能
- commit c816b00: docs(floating-panel): 添加阶段 1 实施文档

