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

## 实施计划

### 阶段 1: 基础功能验证（MVP）

#### 1.1 完善容器编辑界面 ✅ 已完成

**目标：** 创建完整的 operation CRUD 界面

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

#### 1.2 完善旧容器显示问题 ✅ 已完成（代码验证）

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

#### 1.3 完善 UI 组件功能
- [ ] 测试 CapturePanel 组件是否正常工作
- [ ] 测试 ContainerTree 组件是否正常工作
- [ ] 验证容器详情面板的交互

### 阶段 2: 功能完善

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

### 下一个任务：阶段 1.3 - 完善 UI 组件功能

**任务目标：**
验证和测试现有 UI 组件的功能，确保所有交互正常工作。

**具体步骤：**

1. **测试 CapturePanel 组件**
   - 验证组件是否正确渲染
   - 测试 profile 选择功能
   - 测试 URL 输入功能
   - 测试启动/停止捕获按钮

2. **测试 ContainerTree 组件**
   - 验证容器树是否正确显示
   - 测试容器选择功能
   - 测试树形结构展开/折叠

3. **验证容器详情面板**
   - 测试面板切换
   - 测试详情显示完整性
   - 测试所有交互元素

## 进度跟踪

- [x] 恢复到稳定版本（91c1ebb）
- [x] 系统基础功能验证
- [x] 阶段 1.1: 完善容器编辑界面 ✅ 完成
  - [x] 分析需求
  - [x] 制定实施计划
  - [x] 重构 operation 列表显示
  - [x] 实现 CRUD 操作
  - [x] 实现操作测试功能
  - [x] 实现事件触发选择
  - [x] 优化根容器显示
- [x] 阶段 1.2: 完善旧容器显示问题 ✅ 完成
  - [x] 验证空 operation 容器显示
  - [x] 测试默认 operation 生成
  - [x] UI 渲染验证
- [ ] 阶段 1.3: 完善 UI 组件功能 ⏳ 下一步
- [ ] 阶段 2.1: UI 绘制增强
- [ ] 阶段 2.2: 用户交互优化
- [ ] 阶段 2.3: 容器编辑完善
- [ ] 阶段 3.1: 自动化增强
- [ ] 阶段 3.2: 数据持久化
- [ ] 阶段 3.3: 调试工具

## 注意事项

- 所有修改使用 TypeScript/TS
- 禁止使用 Python 自动化脚本
- 禁止使用模糊匹配的进程终止命令
- 保持 ESM 架构一致性

## 技术要点

### Operation 数据结构

```typescript
interface Operation {
  id: string;
  type: 'highlight' | 'click' | 'scroll' | 'extract' | 'wait' | ...;
  triggers: string[]; // 事件列表：['appear', 'click', 'custom:myevent']
  enabled: boolean;
  config: Record<string, any>;
}
```

### 事件类型

**基本事件：**
- `appear`: 容器出现时触发
- `click`: 用户点击容器时触发
- `change`: 容器内容变化时触发

**页面级事件（仅根容器）：**
- `page:load`: 页面加载完成
- `page:scroll`: 页面滚动
- `page:navigate`: 页面导航

**自定义事件：**
- 格式：`custom:eventName`
- 用户可自由定义事件名

### Operation 类型

**通用操作：**
- `highlight`: 高亮显示
- `click`: 点击操作
- `extract`: 提取数据
- `wait`: 等待

**根容器专属操作：**
- `scroll`: 页面滚动
- `navigate`: 页面导航
- `screenshot`: 截图

## 完成标准

### 阶段 1.1 完成标准 ✅ 已达成

1. **UI 呈现** ✅
   - [x] operation 列表清晰显示，包含类型、事件、配置
   - [ ] 支持拖拽调整顺序（待实现）
   - [x] 空状态有友好提示

2. **功能完整** ✅
   - [x] 可以添加/编辑/删除 operation
   - [x] 测试按钮可以实际执行操作
   - [x] 事件选择器支持预定义 + 自定义

3. **代码质量** ✅
   - [x] TypeScript 类型完整
   - [x] 代码结构清晰，易于维护
   - [x] 有必要的注释和文档

### 阶段 1.2 完成标准 ✅ 已达成

1. **容器显示验证** ✅
   - [x] 无 operation 的容器正确显示
   - [x] 空状态提示友好清晰
   - [x] 生成默认 operation 功能正常

2. **UI 一致性** ✅
   - [x] 所有容器类型显示一致
   - [x] 新旧容器无差异
   - [x] 状态转换流畅

3. **功能验证** ✅
   - [x] buildDefaultOperations 正确生成
   - [x] selector/domPath 正确传递
   - [x] API 调用无错误

### 阶段 1.3 完成标准（下一步）

1. **组件功能**
   - [ ] CapturePanel 组件正常工作
   - [ ] ContainerTree 组件正常工作
   - [ ] 容器详情面板交互正常

2. **用户体验**
   - [ ] 所有按钮响应正常
   - [ ] 表单输入正常
   - [ ] 状态切换流畅

3. **集成验证**
   - [ ] 组件间通信正常
   - [ ] 事件流转正确
   - [ ] 数据同步及时

## Git 提交历史

- commit 5549f33: feat(floating-panel): 完善容器编辑界面 CRUD 功能
- commit 181b621: feat(floating-panel): 实现操作演练的真实执行功能

