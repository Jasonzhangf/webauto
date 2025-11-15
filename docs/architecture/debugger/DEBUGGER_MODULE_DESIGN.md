# 调试模块设计（容器选择与容器库编辑）

本设计定义“容器调试模块”的整体方案，覆盖：
- 浏览器端容器选择与高亮 Overlay（鼠标悬浮蓝色高亮、点击选中、红色重高亮）
- 保存容器的交互流程（根/子容器、父容器选择与路径高亮、落库至 staging）
- Web 容器编辑器（查看根容器 → 树状结构 → 单容器编辑 → operation 配置）
- 服务端接口（依赖 Workflow API 与 Container Engine，通过 contextId 与 sessionId 接力）
- Cookie 注入保障与安全边界

## 目标与约束
- 容器=砖块：只提供“定位 + 操作原语”，不关心流程与编排
- Workflow=编排：只关心流程与目标，通过容器的 operation 推进步骤
- 选择器：仅使用 CSS class 选择器（不使用 XPath / 不依赖 id）
- 高亮策略：
  - 悬浮：蓝色（hover，短时）
  - 选中：红色（select，显式调用）
  - 执行：绿色（engine focus，非阻塞）

## 架构与模块

```
Browser Page (with Overlay)
└─ Picker Overlay (top-right menu)
   ├─ HoverInspector (blue highlight)
   ├─ SelectorBuilder (class-only selector, show class list)
   ├─ SelectionManager (left-click to select, red re-highlight)
   └─ SaveWizard (root/parent select → confirm → persist)

Container Engine (7703)
├─ DebugController (REST)
│  ├─ /v1/debug/picker/* (install/toggle/state)
│  ├─ /v1/debug/highlight/test (selector preview red)
│  ├─ /v1/debug/container/save (persist to staging/index)
│  ├─ /v1/debug/library/* (roots/tree/get/update)
│  └─ /v1/debug/context/* (create/graph/focus - 复用已有)
└─ LibraryService (staging/approved 文件操作 + schema 校验)

Workflow API (7701)
└─ Browser primitives (eval/highlight/mouse/keyboard)
   └─ dev/picker/install (已有) 注入基础 Overlay/脚本
```

## Cookie 注入保障
- 依赖 Workflow API 中会话拉起的 Cookie 注入与保存逻辑（`sessionLaunchController` 已注入 InitScript 与 cookies 持久化/加载）
- 调试时要求：
  - 在进入页面前确保 cookie 已注入（preflow/attach 后调用 Container Engine context.create 时自动完成）
  - 如果站点切换或 host 改变，保持 cookies 注入监听

## 浏览器 Overlay 交互
- 顶部右上角菜单（可开关）：显示状态、当前选择器与按钮（预览、保存、取消）
- Hover 模式（打开时生效）：
  - 鼠标移动时计算“候选容器区域”，蓝色高亮 hover 元素或它的最佳容器区域（启发式向上聚合至具有语义 class 的父节点）
  - 菜单显示该元素的类名列表与生成的 class 选择器（如 `.search.input.main`）与命中数量
- 选择（左键）：
  - 选中该容器，菜单进入“选中态”，显示 class 选择器与“红色重高亮”按钮
  - 点击“红色重高亮”：调用服务端 `/v1/debug/highlight/test` 对该选择器命中的所有元素批量红色高亮
- 保存向导（SaveWizard）：
  1) 容器类型：根容器 or 子容器
  2) 父容器选择：默认上一级父容器（可展开更高层级），需显示“候选父容器树”（来自当前 context 的 ContainerGraph 或库中已存在的根树）
  3) 路径确认：高亮“根 → ... → 父 → 当前容器”的关系路径（连线或路径动画），用户点击“确认”
  4) 第二次点击“保存”：持久化到库（staging），包含：
     - ContainerDefV2：`id/name/type/selectors/classes/runMode/operations(默认 find-child)/pagination?`
     - 更新 `libs/containers/staging/<site>/index.json`（append + regenerate `searchIndex`）
  - 失败回滚：显示错误并保留临时状态

## Web 容器编辑器（DevTools Web UI）
- 入口：`http://localhost:7703/devtools`（容器引擎服务静态托管）
- 列表页：显示当前站点的根容器列表（从 staging/approved 加载）
- 树状页：点击根容器显示树（parent→children），点击任意容器在右侧打开属性面板：
  - 基本信息：`id/name/type/scope/pagePatterns`
  - 定位：`selectors`（class 列表，可增删类、即时预览命中数）
  - 关系：`children/dependsOn`（可增删）
  - 行为：`runMode/operations[]/pagination`（配置 operation 与参数）
  - 操作：
    - 预览高亮：对当前容器/选择器在浏览器中高亮
    - 验证：调用 Container Engine 的“校验”逻辑（可复用 discoverChildren 局部验证）
    - 保存：写回 staging 文件并更新 index

## 服务端接口（建议）
- Picker
  - POST `/v1/debug/picker/install` { sessionId } → 调用 Workflow API `/v1/dev/picker/install` 注入脚本
  - POST `/v1/debug/picker/toggle` { sessionId, enabled } → 切换 Overlay 行为
  - GET  `/v1/debug/picker/state` { sessionId } → 返回 Overlay 状态（开/关、选中元素、生成选择器）
- 高亮与预览
  - POST `/v1/debug/highlight/test` { sessionId, selector:{ classes:string[] }, color:'#ff3b30', persist?:true } → 红色高亮匹配集合
- 保存
  - POST `/v1/debug/container/save` { site, def:ContainerDefV2, parentId?:string, rootId?:string, mode?:'staging'|'approved' }
    - 行为：schema 校验 → 去重/命名 → 写 `containers/staging/<site>/<...>.json` → 更新 `index.json`
    - 返回：`{ success, fileName, indexUpdated:true }`
- 库浏览/编辑
  - GET `/v1/debug/library/roots?site=...` → 根容器列表
  - GET `/v1/debug/library/tree?site=...&rootId=...` → 树结构
  - GET `/v1/debug/library/container/:id?site=...` → 容器详情
  - POST `/v1/debug/library/container/update` { site, def } → 覆盖更新并重建 index

说明：所有接口均支持以 `contextId` 代替 `sessionId`（容器服务可从 context 获取 sessionId）。

## 数据结构
- 参考 `libs/containers/schema/container.v2.schema.json`
- 关键字段约定：
  - `selectors[].classes`：class 名最小集合（Click 选中时从元素 class 提取，允许用户删减至不歧义）
  - `operations` 默认 `[ { type:'find-child' } ]`；容器本身不编排
  - `pagination`：对列表类容器按需设置（scroll/click）

## 关键流程图

选择与保存（简化）：
```
[打开菜单] → [Hover 蓝色高亮] → [左键选中]
  → 显示 class 选择器 + 预览命中数
  → [红色重高亮] (可选)
  → [保存] → 选择根/父容器 → 路径高亮 Root→...→当前
  → [确认保存] → 校验/落库/更新 index → 提示成功
```

Web 编辑器：
```
[根列表] → [点击某根] → [树状结构]
  → [点击容器] → 右侧属性面板（基本/定位/关系/行为）
  → [高亮预览/验证] → [保存]
```

## 实施要点
- Overlay：基于现有 `/v1/dev/picker/install` 扩展功能（hover 蓝、select 红、菜单 UI、事件总线）
- 高亮通道统一到 Workflow API `/v1/browser/highlight`（颜色按需）
- 文件持久化：沿用 staging 目录结构与 index 生成脚本；新增接口封装生成/校验
- 权限与安全：
  - 接口默认仅允许本机访问；可通过环境变量开启外部访问
  - 写库操作需显式启用 `DEBUG_WRITE_ENABLED=1`

## 验收标准
- 可在 1688 主页开启 Overlay，鼠标悬浮蓝色高亮，左键选中并红色重高亮；菜单显示 class 选择器
- 可通过保存向导把选中容器保存到 staging，并正确挂在选定父容器下；index 更新成功
- Web 编辑器可列出根容器、展开树、编辑任意容器属性并保存
- 容器引擎与 Workflow 编排仍解耦：容器仅提供定位与操作；Workflow 才定义流程

