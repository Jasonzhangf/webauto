# Workflow Builder UI 设计方案

## 核心理念

**所见即所得 (WYSIWYG) 的交互式工作流构建器**

不再依赖 AI 猜测，而是通过直观的 UI + 浏览器交互，让用户直接定义容器和操作。

## 界面布局

```
┌─────────────────────────┬──────────────────────────────────────────┐
│  浏览器视图 (Left)        │  交互控制台 (Right)                        │
│                         │                                          │
│  ┌───────────────────┐  │  ┌───────────────┐ ┌───────────────┐     │
│  │ 微博              │  │  │  容器管理      │ │  操作配置      │     │
│  │ ┌───────────────┐ │  │  └───────────────┘ └───────────────┘     │
│  │ │ 🟨 Feed List  │ │  │                                          │
│  │ │ ┌───────────┐ │ │  │  [+] 启动捕获模式 (Inspector)             │
│  │ │ │ 🟦 Post   │ │ │  │                                          │
│  │ │ └───────────┘ │ │  │  ▼ 已捕获容器                            │
│  │ └───────────────┘ │  │    ▶ weibo_main_page.feed_list           │
│  └───────────────────┘  │      └─ weibo_main_page.feed_post        │
│                         │                                          │
│                         │  [ 容器详情 ]                             │
│                         │  ID: weibo_main_page.feed_post           │
│                         │  Selector: article[class*='Feed_wrap']   │
│                         │  Type: content                           │
│                         │                                          │
│                         │  [ 事件与操作映射 ]                        │
│                         │  Event: container:discovered             │
│                         │    1. highlight (style='blue')           │
│                         │    2. extract (fields={...})             │
│                         │                                          │
└─────────────────────────┴──────────────────────────────────────────┘
```

## 交互流程

### 1. 启动捕获模式
- 点击 UI 上的 "启动捕获模式"
- 浏览器注入 `DOMInspector` 脚本
- 鼠标悬停在浏览器元素上时，显示虚线框高亮
- 此时点击浏览器元素**不会触发页面跳转**，而是被拦截

### 2. 捕获容器
- 左键点击目标元素（例如 Feed 列表）
- UI 收到选择事件，弹窗确认：
  - 容器名称建议：`container_123`
  - 选择器：`div[class*='Home_feed']`
- 用户确认后，该元素被添加到右侧 "已捕获容器" 树中

### 3. 定义层级关系
- 再次捕获子元素（例如 Post）
- UI 自动检测 DOM 包含关系
- 询问用户：`Post` 是 `Feed List` 的子容器吗？
- 确认后，自动建立父子关系：`Feed List` -> `Post`

### 4. 配置操作 (Operation)
- 在右侧树中选择容器
- 添加操作：
  - **Highlight**: 出现时高亮
  - **Extract**: 提取字段（再次使用 Inspector 选择子元素作为字段）
  - **Scroll**: 滚动加载
  - **Click**: 点击操作

### 5. 绑定事件 (Event Binding)
- 定义什么时候触发操作
- 默认事件：`container:discovered` (容器出现时)
- 配置 Action：
  ```json
  {
    "event": "container:discovered",
    "actions": [
      { "type": "highlight", "config": { "color": "blue" } },
      { "type": "extract", "config": { "fields": { "author": "..." } } }
    ]
  }
  ```

### 6. 导出与执行
- 点击 "导出 Workflow"
- 生成 JSON 配置文件
- 直接加载运行

## 核心优势

1. **精确性**：用户直接点击，无需 AI 猜测
2. **直观性**：所见即所得，实时高亮反馈
3. **灵活性**：手动调整选择器和层级关系
4. **低门槛**：不需要懂复杂的 DOM 结构，只需点击即可

## 技术实现

### 1. 浏览器端 (Inspector)
- 使用 `document.elementFromPoint` 获取 Hover 元素
- 使用 `event.preventDefault()` 拦截点击
- 通过 WebSocket 发送选择信息到 UI

### 2. UI 端 (React/Vue)
- WebSocket 接收浏览器事件
- 维护容器树状态
- 提供属性编辑和操作配置界面

### 3. 控制端 (Node.js)
- 协调浏览器和 UI
- 保存和加载配置
- 执行预览

## 示例：提取微博帖子

1. **启动**: 打开微博首页，启动 Inspector
2. **捕获列表**: 鼠标悬停在 Feed 列表外框，点击 -> 命名为 `feed_list`
3. **捕获帖子**: 鼠标悬停在第一条帖子，点击 -> 命名为 `feed_post`
4. **关联**: UI 提示 `feed_post` 在 `feed_list` 内，确认父子关系
5. **提取字段**: 
   - 选中 `feed_post` -> 添加 Extract 操作
   - 点击 "选择字段" -> 浏览器中点击 "作者名" -> 命名为 `author`
   - 点击 "选择字段" -> 浏览器中点击 "内容" -> 命名为 `content`
6. **保存**: 生成配置文件

## 下一步计划

1. 实现 `DOMInspector` 类（已完成初步原型）
2. 开发简易的 Web UI（使用 React/Vite）
3. 集成到现有的 `unified-api` 服务中
