# WebAuto Floating Panel UI Redesign Plan

## 1. 核心目标
改造浮窗 UI，使其更加紧凑、实用，去除不必要的装饰（"花里胡哨"），回归信息展示与操作的本质。

**核心价值：** 清晰展示“什么消息（Trigger）对应什么操作（Operation）”，并提供便捷的添加/编辑入口。

## 2. 交互与视觉设计

### 2.1 整体布局 (Layout)
- **紧凑化**：大幅减少 Padding/Margin，消除无效空白区域。
- **状态栏**：
  - 移除顶部冗余的 "Health", "Mode" 等占位符（除非有实际错误）。
  - 仅保留关键状态指示（连接状态、录制状态）。
- **窗口记忆**：
  - 必须记录并恢复上次关闭时的窗口大小（Size）和位置（Position）。
  - 启动时避免默认窗口过小导致内容展示不全。

### 2.2 容器详情面板 (Container Details)
将原本的 "卡片流" 改为 "清单/表格" 视图。

#### Meta 信息区
- 使用紧凑的 Key-Value 网格（Grid）。
- 移除大标题和装饰性边框。
- 仅展示核心字段：Type, Match Count, Selector/Path (截断显示，Hover 展示全量)。

#### Operation 列表区
**设计原则：** 列表化，一行一条，类似表格或紧凑列表项。

| 触发器 (Trigger) | 动作类型 (Action) | 配置摘要 (Summary) | 操作 |
|------------------|-------------------|--------------------|------|
| `focused`        | `highlight`       | 2px solid blue     | [Edit] [Del] |
| `defocused`      | `highlight`       | none               | [Edit] [Del] |
| `click`          | `click`           | -                  | [Edit] [Del] |

- **视觉样式**：
  - 去除 "Card" 圆角和大背景块。
  - 使用简单的分割线或斑马纹。
  - 字体采用等宽字体或紧凑系统字体（10px/11px）。
  - **高亮状态**：选中某行时才有明显背景色。

- **交互逻辑**：
  - **查看/编辑**：点击行内任意位置展开微型编辑器（Inline Editor），或者直接在行内变为输入框（如果空间允许）。
  - **默认操作**：
    - 普通容器默认带 `focused` (高亮) 和 `defocused` (取消高亮)。
    - 根容器 (Root) 默认支持 `scroll` 等全局操作。
  - **快捷输入**：
    - 对于 `fill` (输入) 操作，提供常用快捷键按钮 (Enter, Tab, Esc)。

#### 快速添加区 (Quick Add)
- 放置在列表底部。
- **布局**：一行内完成添加。
  - `[下拉: 触发消息]` + `[下拉: 动作类型]` + `[+] 按钮`。
- **智能预设**：
  - 如果是根容器，动作下拉优先展示 `Scroll`, `Navigate`。
  - 如果是输入框容器，优先展示 `Fill`, `Click`。

### 2.3 图谱区域 (Graph)
- 保持现有功能，但优化与底部面板的分割线交互，确保拖拽顺滑。
- 根容器操作（如滚动）挂载在根节点上，选中根节点时在详情面板展示相关操作。

## 3. 详细改造计划

### Phase 1: 基础架构与配置持久化
1. **窗口状态记忆**：
   - 修改 `main/index.mts`，在 `close` 事件保存 `bounds` 到 `~/.webauto/floating-window-state.json`。
   - 启动时读取该文件设置初始大小和位置。
2. **清理冗余 UI**：
   - 删除 `index.html` 中无用的占位 div (Health/Mode占位过大问题)。
   - 压缩顶部 Title Bar 高度。

### Phase 2: Operation 列表重构
1. **重写 `operation-ui.mts`**：
   - 废弃 `renderOperationList` 中的 `.op-card` 结构。
   - 实现新的 Table/List 渲染逻辑。
   - 实现 "Trigger -> Action" 的直观映射视图。
2. **优化编辑器 `operation-helpers.ts`**：
   - 简化编辑器 DOM 结构，去除不必要的 JSON 预览（默认折叠，需要时再开）。
   - 强化 "Fill Value" 和 "Shortcuts" 的输入体验。

### Phase 3: 样式紧凑化 (CSS)
1. **重写 `ui-components.ts` / CSS**：
   - 全局缩小字体 (12px -> 11px/10px)。
   - 压缩 Form 控件的高度和 Padding。
   - 确保在小窗口下也能看到完整的 Operation 列表。

## 4. 进度跟踪
所有开发任务将记录在根目录 `task.md` 中。
