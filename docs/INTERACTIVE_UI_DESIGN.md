# 交互式 DOM 捕获 UI 设计方案

## 核心设计理念

**完全基于人工交互**，不依赖 AI 辅助，通过可视化界面让用户直观地选择和配置 DOM 元素。

## 架构设计

### 1. UI 布局

```
┌─────────────────────────────────────────────────────────┐
│                      工具栏                               │
│  [捕获模式] [容器管理] [操作配置] [消息映射] [保存]        │
├─────────────────────────┬───────────────────────────────┤
│                         │                               │
│    浏览器视图            │    右侧面板                    │
│                         │                               │
│  - 鼠标 hover 高亮       │  Tab 1: 容器列表              │
│  - 点击捕获元素          │    - 层级树状图               │
│  - 虚线框标记            │    - 容器属性                │
│                         │                               │
│                         │  Tab 2: 操作管理              │
│                         │    - 可用操作列表             │
│                         │    - 操作参数配置             │
│                         │                               │
│                         │  Tab 3: 消息映射              │
│                         │    - 触发条件                │
│                         │    - 操作序列                │
│                         │                               │
│                         │  Tab 4: 预览/调试             │
│                         │    - 实时日志                │
│                         │    - 状态监控                │
└─────────────────────────┴───────────────────────────────┘
```

### 2. 工作流程

#### 阶段 1: 页面访问
1. 用户选择 Profile（如 `weibo_fresh`）
2. 输入目标 URL
3. 系统加载浏览器并自动注入 Cookie

#### 阶段 2: 捕获模式
4. 用户点击"启动捕获模式"按钮
5. 浏览器进入特殊交互模式：
   - 鼠标移动时，hover 元素显示虚线高亮框
   - 点击元素被拦截，不触发实际点击
   - 点击时捕获该元素为容器

#### 阶段 3: 容器管理
6. 捕获的容器显示在右侧容器列表
7. 系统自动分析 DOM 层级关系，构建父子关系树
8. 用户可以：
   - 查看容器层级结构
   - 编辑容器名称和标签
   - 删除不需要的容器
   - 调整容器优先级

#### 阶段 4: 操作配置
9. 用户点击容器，进入操作管理 Tab
10. 为容器添加操作：
    - Highlight（高亮）
    - Extract（提取数据）
    - Click（点击）
    - Scroll（滚动）
    - Wait（等待）
11. 配置操作参数（如提取字段的 selector）

#### 阶段 5: 消息映射
12. 配置触发条件：
    - DOM 刷新时
    - 元素出现时
    - 滚动到底部时
    - 自定义事件
13. 为每个消息配置操作序列
14. 支持多操作按顺序执行

#### 阶段 6: 保存与测试
15. 保存容器配置为 JSON
16. 实时测试验证
17. 导出为可执行的 Workflow

## 技术实现

### 3. 核心模块

#### 3.1 DOMInspector（浏览器端）

**职责**: 在浏览器页面中注入交互脚本

**功能**:
- `start()`: 启动捕获模式
  - 创建覆盖层和高亮框
  - 监听鼠标移动和点击事件
  - 拦截点击事件
- `stop()`: 停止捕获模式
- `captureElement()`: 捕获元素信息
  - tagName
  - selector（自动生成）
  - 位置坐标
  - 文本内容预览

**实现位置**: `modules/workflow-builder/src/inspector/DOMInspector.ts`

#### 3.2 ContainerManager（管理端）

**职责**: 管理捕获的容器数据

**功能**:
- `addContainer()`: 添加容器
- `updateContainer()`: 更新容器
- `deleteContainer()`: 删除容器
- `buildHierarchy()`: 构建容器层级关系
- `saveToJSON()`: 导出容器配置

**数据结构**:
```typescript
interface Container {
  id: string;
  name: string;
  selector: string;
  parentId?: string;
  children: string[];
  operations: Operation[];
  messages: MessageMapping[];
  metadata: {
    tagName: string;
    rect: { x, y, width, height };
    textPreview: string;
  };
}
```

#### 3.3 OperationEditor（操作编辑器）

**职责**: 配置容器操作

**功能**:
- `addOperation()`: 添加操作
- `configureParams()`: 配置参数
- `testOperation()`: 测试操作
- `reorderOperations()`: 调整操作顺序

**支持的操作类型**:
```typescript
type OperationType = 
  | 'highlight'    // 高亮容器
  | 'extract'      // 提取数据
  | 'click'        // 点击
  | 'scroll'       // 滚动
  | 'wait'         // 等待
  | 'custom';      // 自定义脚本
```

#### 3.4 MessageMapper（消息映射）

**职责**: 配置事件触发和操作序列

**功能**:
- `addTrigger()`: 添加触发条件
- `mapOperation()`: 映射操作
- `setSequence()`: 设置执行序列

**系统消息**:
```typescript
type SystemMessage = 
  | 'dom:refresh'           // DOM 刷新
  | 'container:appeared'    // 容器出现
  | 'container:disappeared' // 容器消失
  | 'scroll:bottom'         // 滚动到底部
  | 'scroll:top';           // 滚动到顶部
```

### 4. UI 组件设计

#### 4.1 CapturePanel（捕获面板）

**组件**: React/Vue 组件

**状态管理**:
```typescript
interface CaptureState {
  mode: 'idle' | 'capturing' | 'editing';
  selectedProfile: string;
  targetUrl: string;
  captureMode: boolean;
  hoveredElement: ElementInfo | null;
  selectedElement: ElementInfo | null;
}
```

**交互**:
- 启动/停止捕获按钮
- Profile 选择器
- URL 输入框
- 捕获模式指示灯

#### 4.2 ContainerTree（容器树）

**组件**: 树状图组件

**功能**:
- 展示容器层级
- 支持拖拽调整父子关系
- 点击选中容器
- 右键菜单（编辑/删除/复制）

**可视化**:
```
□ weibo_main_page
  ├─ □ feed_list
  │   ├─ □ feed_item_1
  │   ├─ □ feed_item_2
  │   └─ □ feed_item_3
  └─ □ sidebar
```

#### 4.3 OperationList（操作列表）

**组件**: 可拖拽排序列表

**功能**:
- 显示容器的所有操作
- 拖拽调整执行顺序
- 展开/折叠操作参数
- 启用/禁用操作

#### 4.4 MessageMapEditor（消息映射编辑器）

**组件**: 连线图编辑器

**可视化**:
```
[dom:refresh] ──┬──> [highlight]
                └──> [extract]

[container:appeared] ──> [scroll:down]
```

### 5. 通信协议

#### 5.1 浏览器 ↔ 管理端

**通过 WebSocket 实时通信**:

```typescript
// 浏览器端 -> 管理端
{
  type: 'inspector:hover',
  payload: {
    selector: string,
    rect: { x, y, width, height },
    tagName: string,
    textPreview: string
  }
}

{
  type: 'inspector:select',
  payload: {
    selector: string,
    /* 同上 */
  }
}

// 管理端 -> 浏览器端
{
  type: 'inspector:start',
  payload: {}
}

{
  type: 'inspector:stop',
  payload: {}
}

{
  type: 'container:highlight',
  payload: {
    selector: string,
    style: string
  }
}
```

#### 5.2 状态同步

**EventBus 订阅**:
```typescript
eventBus.on('container:added', (container) => {
  // 更新 UI
});

eventBus.on('operation:executed', (result) => {
  // 显示执行结果
});

eventBus.on('workflow:status', (status) => {
  // 更新工作流状态
});
```

### 6. 实现步骤

#### Step 1: 完善 DOMInspector
- [x] 基础 hover 高亮
- [ ] 点击捕获
- [ ] WebSocket 通信
- [ ] 选择器生成优化

#### Step 2: 实现 ContainerManager
- [ ] 容器数据结构
- [ ] CRUD 操作
- [ ] 层级关系构建
- [ ] JSON 导入/导出

#### Step 3: 开发 UI 面板
- [ ] 捕获面板
- [ ] 容器树组件
- [ ] 操作编辑器
- [ ] 消息映射编辑器

#### Step 4: 集成与测试
- [ ] 浏览器端集成
- [ ] WebSocket 通信测试
- [ ] 端到端测试
- [ ] 微博案例验证

#### Step 5: 文档与示例
- [ ] 用户手册
- [ ] 视频教程
- [ ] 示例 Workflow
- [ ] 最佳实践

## 7. 微博爬取示例流程

### 目标: 爬取微博首页 50 个帖子

**操作步骤**:

1. **启动捕获模式**
   - Profile: `weibo_fresh`
   - URL: `https://weibo.com`

2. **捕获容器**
   - 点击 Feed 列表容器 → 命名为 `feed_list`
   - 点击单个帖子容器 → 命名为 `feed_item`
   - 点击帖子内的链接 → 命名为 `post_link`

3. **配置操作**
   - `feed_list`:
     - Highlight（虚线框）
     - Scroll（向下滚动）
   - `feed_item`:
     - Highlight（实线框）
     - Extract（提取链接和作者）
   - `post_link`:
     - Extract（href 和 text）

4. **配置消息映射**
   - `dom:refresh` → Highlight `feed_list`
   - `container:appeared (feed_item)` → Extract → Scroll（如果未达到 50 个）
   - `scroll:bottom` → Trigger load more

5. **保存与测试**
   - 导出配置为 `weibo_feed_workflow.json`
   - 运行测试，验证爬取逻辑
   - 查看实时日志

6. **执行**
   - 运行 Workflow
   - 监控进度（已爬取 X/50）
   - 获取去重后的帖子列表

## 8. 技术栈

- **前端**: React + TypeScript
- **状态管理**: Zustand / Jotai
- **UI 组件**: shadcn/ui + Radix UI
- **可视化**: React Flow (连线图)
- **通信**: WebSocket (ws)
- **浏览器端**: Vanilla JS (注入脚本)

## 9. 开发优先级

### P0（高优先级）
1. DOMInspector WebSocket 通信
2. ContainerManager 基础 CRUD
3. 捕获面板 UI
4. 容器树组件

### P1（中优先级）
1. 操作编辑器
2. 消息映射编辑器
3. 实时预览
4. 导入/导出

### P2（低优先级）
1. 高级选择器生成
2. 批量操作
3. 模板库
4. 性能优化

---

**最终目标**: 让非技术用户也能通过点击和配置，轻松构建复杂的 Web 自动化工作流。
