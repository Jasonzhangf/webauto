# 浮窗 UI 与交互改造设计文档

## 1. 概述

本此改造旨在提升 WebAuto 浮窗（Floating Panel）的用户体验，重点在于 Operation 的展示与编辑区域。目前的实现主要依赖内联样式，视觉层次不明晰，编辑体验较为原始。

**核心目标：**
1.  **视觉升级**：统一色调、间距和字体，去除内联样式，建立清晰的 CSS 类体系。
2.  **交互优化**：引入卡片式列表、折叠/展开机制、更友好的表单控件。
3.  **编辑体验**：增强 JSON 配置的可读性与编辑便捷性。

## 2. 视觉设计规范

### 2.1 基础色调 (VSCode Dark Theme 风格)
- **背景色**:
  - 主背景: `#1e1e1e`
  - 面板/卡片背景: `#252526`
  - 输入框背景: `#3c3c3c`
- **边框/分割线**: `#3e3e3e` (普通), `#007acc` (焦点/激活)
- **文本**:
  - 主要: `#cccccc`
  - 次要/标签: `#999999`
  - 高亮/链接: `#3794ff`
  - 代码/值: `#dcdcaa` (黄色系), `#ce9178` (橙色系)
- **状态色**:
  - 成功: `#4CAF50`
  - 警告: `#cca700`
  - 错误: `#f44336`

### 2.2 排版
- **字体**: system-ui, -apple-system, sans-serif
- **字号**:
  - 标题: 12px (Bold)
  - 正文/标签: 11px
  - 辅助/代码: 10px

## 3. 组件设计方案

### 3.1 Operation 列表 (Operation List)

目前列表项信息过载且拥挤。

**改造方案：**
- **卡片式布局**：每个 Operation 作为一个独立的卡片容器。
- **两态设计**：
  - **预览态 (Default)**：
    - 左侧：启用/禁用开关 (Toggle Switch)。
    - 中间：Operation ID (加粗), Type (Badge), Triggers (简略 Tags)。
    - 右侧：快捷操作图标 (Edit, Delete)。
  - **详情态 (Expanded)**：
    - 点击卡片空白处或“Edit”按钮展开。
    - 展示完整的配置编辑器。

### 3.2 Operation 编辑器 (Operation Editor)

目前编辑器是简单的表单堆叠。

**改造方案：**
- **布局**：
  - 顶部：类型选择 (Select) 与 ID 输入。
  - 中部：触发器 (Triggers) 选择区。使用 Chip/Tag 选择器替代单纯的 Checkbox 列表，节省空间。
  - 底部：配置 (Config) 编辑区。
- **Config JSON 编辑器**：
  - **样式**：仿 IDE 风格，深色背景，等宽字体。
  - **功能**：
    - 提供“格式化”按钮 (Prettify)。
    - 输入时的基本 JSON 校验（边框变红提示）。
- **操作栏**：
  - 底部右侧放置“保存”和“取消”按钮，主次分明。

### 3.3 CSS 架构

不再使用 `style="..."` 内联样式。在 `apps/floating-panel/src/renderer/index.html` 或单独的 `.css` 文件中定义：

```css
/* 示例类名规划 */
.op-list-container {}
.op-card {
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  border-radius: 4px;
}
.op-card.active { border-color: var(--focus-color); }

.op-header { display: flex; align-items: center; ... }
.op-badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; ... }

.op-editor { padding: 8px; background: var(--editor-bg); }
.op-input { background: var(--input-bg); border: 1px solid var(--border-color); ... }
.op-json-textarea { font-family: 'Menlo', 'Monaco', monospace; ... }
```

## 4. 交互逻辑

1.  **新增 Operation**：
    - 列表底部显示明确的 “+ Add Operation” 按钮（全宽或显著样式）。
    - 点击后在列表末尾插入一个空白/默认的编辑态卡片。

2.  **编辑与保存**：
    - 编辑状态下，点击“保存”仅更新内存中的对象并刷新 UI 为预览态。
    - 点击“取消”回滚更改并收起。
    - **注意**：实际持久化到后端需要触发 `graph.mjs` 中的保存逻辑（需确保 API 兼容）。

3.  **拖拽排序 (可选)**：
    - 预留拖拽手柄 (Drag Handle) 区域，未来支持调整执行顺序。

## 5. 迁移计划

1.  **CSS 准备**：在 `index.html` 中添加新的 `<style>` 块，定义 CSS 变量和基础类。
2.  **重构渲染函数**：
    - 修改 `operation-helpers.ts` 中的 `renderOperationList`，生成新的 HTML 结构。
    - 修改 `renderOperationEditor`，适配新的表单布局。
3.  **事件绑定更新**：
    - 在 `operation-ui.mts` 或 `index.mts` 中更新事件代理逻辑，适配新的类名 (如 `.op-card`, `.btn-save`)。
4.  **测试验证**：
    - 验证添加、编辑、删除、显隐开关功能的正确性。


## 6. 实施更新 (Final Implementation Status)

### 6.1 Operation 分组
- 列表视图已改为按 **Trigger** 分组显示（如 `[CLICK]`, `[APPEAR]`）。
- 每个分组内的 Operation 支持拖拽排序（通过全局索引映射）。

### 6.2 增强型编辑器
- **类型固定**：Operation 创建后类型固定，编辑器中仅作为标签显示，不可更改。
- **Input/Fill 支持**：针对 `input` 和 `fill` 类型，增加了专用的 `Value` 输入框。
- **虚拟按键**：提供 `Enter`, `Tab`, `Esc` 等虚拟按键，点击即可追加到 Value 输入框。
- **JSON 隐藏**：默认隐藏 Raw JSON Config，提供 Toggle 按钮查看。

### 6.3 交互细节
- 拖拽手柄 (`⋮⋮`) 位于每行左侧。
- 编辑器内联展开，支持取消/保存。
