# Executable Container Picker 模块

基于现有容器架构与事件驱动执行的“可执行容器拾取器”。用于在页面内交互式拾取元素，生成与当前工作流节点系统直接衔接的“可执行容器”定义，并完成父容器挂靠（无操作的占位父容器）。

## 目标
- 在页面内开启拾取模式：鼠标悬浮高亮候选元素，长按左键创建容器。
- 生成“可执行容器定义”（Executable Container Definition），其 runtime.events 映射到现有节点以事件驱动方式执行。
- 解析父容器：优先挂靠本页已有父容器；若无，按容器库索引生成父链“占位容器”，仅用于层级，无操作。
- 弹出就地操作菜单，操作项直接映射到 runtime.events/operations。

## 约束与对齐
- 容器定义来源与格式：以 `container-system/platforms/<site>/index.json` 及相关容器定义 JSON 为准；新增字段以 runtime 扩展的方式进行，保持兼容。
- 事件驱动执行：复用现有节点（例如 `EventDrivenOptionalClickNode`, `PlaywrightClickNode`, `ChatComposeNode`, `JavaScriptExecutionNode`）。
- 高亮：复用统一高亮服务 `src/modules/highlight/highlight-service.js`（`window.__webautoHighlight`）。
- 行为记录：复用 `BehaviorRecorder`。

## 架构
- in-page（页内脚本）：拾取/高亮、选择器生成、容器构建、父容器解析、实例注册、菜单与事件派发。
- node bridge（Node 侧桥接）：注入脚本与容器索引、接收页内事件、驱动节点执行、可选保存定义。

```
└─ src/modules/executable-container/
   ├─ inpage/
   │  ├─ picker.ts               # 拾取模式控制（start/stop）与事件绑定
   │  ├─ overlay-controller.ts   # 高亮与悬浮控件（复用统一高亮服务）
   │  ├─ selector-builder.ts     # 稳定选择器生成/唯一性验证
   │  ├─ container-builder.ts    # 生成可执行容器定义（含 runtime 映射）
   │  ├─ parent-resolver.ts      # 父容器解析与占位父容器链构建
   │  ├─ registry.ts             # 页内容器实例图（运行时）
   │  ├─ menu.ts                 # 可选操作菜单（映射到 runtime）
   │  └─ types.ts                # 本模块类型
   ├─ node/
   │  ├─ bridge.ts               # 注入/事件桥接/操作执行
   │  ├─ loader.ts               # 加载容器索引并注入 window.__containerIndex
   │  └─ save.ts                 # 可选：保存新容器定义
   ├─ schemas/
   │  └─ executable-container.schema.json  # runtime 扩展 JSON Schema
   └─ index.ts                  # 导出模块 API（薄封装）
```

## 可执行容器定义扩展（runtime）
在现有容器 JSON 基础上新增 `runtime` 字段，不破坏兼容：
- `runtime.events`: 该容器的事件清单，每个事件绑定一个“节点类型 + 参数”
  - `name`: 事件名（如 `appear`, `action:click`）
  - `node`: 节点类型（如 `EventDrivenOptionalClickNode`）
  - `params`: 节点参数（如 `selectors`, `maxWaitMs`, `highlight`）
  - `guards` 可选：前置条件（如父容器存在等）
- `runtime.operations`: 菜单操作声明，映射到某个 `events[*]` 或直接指定 `node+params`
  - `{ key, label, event? , node?, params? }`
- `runtime.flags`: `{ placeholder?: boolean }` 占位父容器标记
- `relationships`（可选）：`{ parentCandidates?: string[] }`

JSON Schema 见 `schemas/executable-container.schema.json`。

### 事件映射建议
- `appear/ready` → `EventDrivenOptionalClickNode`（`click:false`, `highlight:true`）
- `action:click` → `EventDrivenOptionalClickNode`（`click:true`）
- `action:type` → IM 优先 `ChatComposeNode`，通用可用 `JavaScriptExecutionNode`

## 页内 API
- `window.__webautoPicker.start(options?: StartOptions): void`
- `window.__webautoPicker.stop(): void`
- `window.__webautoPicker.getState(): { picking: boolean, instances: number }`

StartOptions：`{ site?: string, longPressMs?: number, minTargetSize?: number, highlight?: { color?: string, duration?: number, label?: string }, debug?: boolean }`

## Node 侧桥接 API
- `bridge.attach(page, { site, engine, recorder })`: 注入统一高亮与 picker，注入容器索引到 `window.__containerIndex`，注册事件回调。
- `bridge.startPicker(page, options)` / `bridge.stopPicker(page)`
- `bridge.executeOperation(page, executableContainer, opKey)`: 解析 `runtime.operations[opKey]` 并驱动对应节点执行。

## 父容器解析
优先本页已有父实例（沿 DOM 祖先链命中 PageContainerRegistry）；若无，则按容器索引命中最近祖先定义；仍无则创建占位父链（仅层级，无操作）。
- 判定：矩形包含 + DOM 祖先匹配
- 范围：同 frame；跨域 iframe 不处理

## 选择器策略
- 优先：`data-* / role` > 唯一 `id` > 语义 `class` 组合 > 结构定位（`:nth-of-type`）
- 剔除：哈希/可变 class（长度与字符集判定）
- 验证：`querySelectorAll` 唯一，滚动/resize 后稳定
- 备选：语义祖先 + 相对路径组合

## UI/交互
- 悬浮工具条：开/关拾取、实例数、清理高亮、设置入口
- 高亮：`window.__webautoHighlight.createHighlight`，拾取中 label: `PICK`，长按创建时 label: `NEW`
- 长按：默认 600ms，Shift 可降至 300ms；Esc 退出
- 菜单：展示 `runtime.operations`，如 高亮/点击/复制选择器/标注类型/保存定义；占位父不展示操作

## 容器库分层与存储
- 新增双库结构：`containers/staging`（测试/候选库）与 `containers/approved`（验证/生产库）。
- 目录结构与 `container-system/platforms/<site>/` 保持一致（`interactive-elements/`, `containers/`, `indicators/`）。
- 新增容器默认保存到：`containers/test/<site>/…`；验证通过后迁移到 `containers/validated/<site>/…`。
- `index.json` 在两个库各自维护，测试库自动更新，验证库经审批更新。

### Loader 与 Save 策略
- Loader 优先顺序：`containers/approved` → `containers/staging` → 兼容 `container-system/platforms`（回退）。
- Save 默认写入 `containers/staging/<site>/containers/`，支持自定义 `baseDir`。

### 迁移既有库
- 将 `container-system/platforms/<site>/` 复制到 `containers/staging/<site>/`，生成或修复 `index.json`。
- 重新验证通过的部分进入 `containers/approved/<site>/`，并更新其 `index.json`。

## 与现有系统对接
- 节点执行：沿用 `src/core/workflow/nodes/*`
- 高亮服务：沿用 `src/modules/highlight/highlight-service.js`
- 行为记录：沿用 `src/core/workflow/BehaviorRecorder.js`
- 容器索引注入：`container-system/platforms/<site>/index.json` → `window.__containerIndex`
  - 新库优先：优先注入 `containers/validated/<site>/index.json`，回退 `containers/test/<site>/index.json`，再回退到 `container-system/platforms/<site>/index.json`

## 配置
- start(options): `site`, `longPressMs`, `minTargetSize`, `highlight`, `debug`
- bridge: `librarySource`, `saveEnabled`, `savePath`

## 测试与验证
- 单测（TS）：selector-builder、parent-resolver、registry
- 集成（Playwright）：本地测试页注入 picker，模拟 mousemove/mousedown 长按，断言：高亮出现、收到 `container:created`、执行菜单“点击”触发节点执行并记录结果
- 指标：高亮延迟 < 100ms；长按触发 > 98%；选择器唯一性 > 95%；父命中 > 90%

## 边界与回退
- 多 iframe：仅当前 frame 生效
- 虚拟滚动：动态跟随；分离则取消构建
- 样式干扰：overlay `pointer-events:none`，菜单高 `z-index`
- 选择器不稳：提供“锁定选择器”操作（runtime 增加 `lockedSelector`）

## 开发任务计划
1) 基础设施与骨架
- [ ] inpage: overlay-controller, element-picker（picker.ts）, types
- [ ] node: bridge 注入与事件桥、loader 注入索引
- [ ] schemas: runtime JSON Schema

2) 核心能力
- [ ] selector-builder：稳定选择器生成与唯一性验证
- [ ] registry：容器实例图（插入/挂靠/查询/去重）
- [ ] parent-resolver：本页命中/库命中/占位父链
- [ ] container-builder：可执行容器定义组装（含 runtime 映射模板）

3) UI/交互
- [ ] menu：就地浮窗 + operations 映射
- [ ] picker：长按/环形进度/退出、拾取状态与统计

4) Node 联动
- [ ] bridge.executeOperation：解析 runtime.operations → 调用对应节点并记录
- [ ] save：可选保存定义（延后）

5) 测试
- [ ] 单测：selector-builder / parent-resolver / registry
- [ ] 集成：本地测试页 + Playwright 脚本

6) 文档与示例
- [ ] README 使用说明与集成示例

7) 库分层与迁移
- [ ] 新建 `containers/staging` 与 `containers/approved` 目录与索引初始化
- [ ] 迁移 `container-system/platforms/<site>/` → `containers/staging/<site>/`
- [ ] 校验并逐步发布到验证库，落盘 `containers/approved/<site>/index.json`

里程碑（建议）
- M1：README + 骨架与基础注入（本提交）
- M2：selector-builder/registry/parent-resolver 初版通过单测
- M3：container-builder/menu/picker 完成，能创建可执行容器
- M4：bridge.executeOperation 打通真实节点执行，完成集成测试
- M5：保存定义与索引更新（可选）
- M6：库分层落地与既有库迁移（staging → approved）

---

## 使用（概览）
Node 侧桥接：

```js
import bridge from "./node/bridge";

await bridge.attach(page, { site: 'weibo', engine, recorder });
await bridge.startPicker(page, { longPressMs: 600 });
// 用户在页面中长按创建容器 → 事件回到 Node 侧
// 选择菜单“点击” → bridge.executeOperation(...)
```

页内 API：

```js
window.__webautoPicker.start({ site: 'weibo' });
// ...
window.__webautoPicker.stop();
```
