# Actions System Design (Events & Operations)

## 1. 目标与范围
- 将“事件（events）”与“操作（operations）”从容器定义中抽离，形成可复用、可扩展、可站点覆盖的动作库。
- 支持事件驱动执行（如 appear、action:click、scroll:intoview 等），以及通用操作（高亮、复制选择器、点击等）。
- 作为 UI（拾取器菜单）与引擎（WorkflowEngine/Nodes）之间的契约层，提供稳定的 JSON Schema 与加载/合并规则。

## 2. 核心概念
- 事件（Event）
  - 含义：可被“触发”的动作，通常有等待/条件与副作用，如 appear（等待元素出现并高亮）、action:click（等待并点击）。
  - 绑定节点：通常映射到事件驱动类节点（如 EventDrivenOptionalClickNode）。
- 操作（Operation）
  - 含义：即刻执行的工具式动作（highlight、copy-selector、click-dom），或工作流集成操作。
  - 绑定节点：可映射到任意节点（JavaScriptExecutionNode、EventDrivenOptionalClickNode、PlaywrightClickNode 等）。
- 容器（Container）
  - 仍可在容器定义 runtime.events / runtime.operations 中声明专属动作，但优先使用公共库（actions-system）。

## 3. 目录与文件架构
```
actions-system/
  events/
    index.json                 # 全局事件清单（默认）
  operations/
    index.json                 # 全局操作清单（默认）
  schemas/
    events.schema.json         # 事件清单 JSON Schema（可选）
    operations.schema.json     # 操作清单 JSON Schema（可选）
  sites/
    <site>/
      events.json              # 站点覆盖事件（可选）
      operations.json          # 站点覆盖操作（可选）

src/modules/executable-container/node/
  actions-loader.cjs           # 运行时加载工具（读取全局 + 站点覆盖，以供注入/桥接）

docs/actions-system/DESIGN.md  # 本设计文档
```

## 4. 加载与合并策略
- 加载顺序（同名覆盖）：site 覆盖 > 全局默认
  - events: actions-system/sites/<site>/events.json → actions-system/events/index.json
  - operations: actions-system/sites/<site>/operations.json → actions-system/operations/index.json
- 站点解析：与容器库一致，优先域名式（weibo.com），回退短名（weibo）。
- 版本与兼容：清单含 `version` 字段；同 key 的事件/操作发生冲突时，采用后加载版本覆盖前者（提供 `deprecated` 标记与 `replacedBy` 字段便于迁移）。

## 5. JSON Schema（摘要）
- 事件（events.schema.json）：
  - `key` string：唯一键，如 `appear`、`action:click`
  - `label` string：显示名称
  - `node` string：绑定节点类型，如 `EventDrivenOptionalClickNode`
  - `params` object：传递给节点的配置（可含 `selectors`、`maxWaitMs`、`highlight` 等）
  - `meta` object：`group`、`tags`、`sites`、`deprecated` 等
- 操作（operations.schema.json）：
  - `key` string：唯一键，如 `highlight-green`
  - `label` string：显示名称
  - `node` string：绑定节点类型，如 `JavaScriptExecutionNode`
  - `params` object：传递给节点的配置
  - `meta` object：同上

## 6. 示例（事件）
```json
{
  "version": "1.0.0",
  "events": [
    {
      "key": "appear",
      "label": "元素出现(appear)",
      "node": "EventDrivenOptionalClickNode",
      "params": { "click": false, "highlight": true, "maxWaitMs": 8000 },
      "meta": { "group": "common", "tags": ["wait","highlight"] }
    },
    {
      "key": "action:click",
      "label": "点击(action:click)",
      "node": "EventDrivenOptionalClickNode",
      "params": { "click": true, "highlight": true, "maxWaitMs": 8000 },
      "meta": { "group": "common", "tags": ["click"] }
    }
  ]
}
```

## 7. 示例（操作）
```json
{
  "version": "1.0.0",
  "operations": [
    {
      "key": "highlight-green",
      "label": "高亮(绿色)",
      "node": "JavaScriptExecutionNode",
      "params": {
        "script": "return (function(){ try{ const el=document.querySelector(window.__webautoTmpSelector||''); if(!el) return {ok:false}; window.__webautoHighlight?.createHighlight(el,{color:'#34c759',label:'PICK',duration:4000}); return {ok:true}; }catch(e){ return {ok:false,err:e.message}; } })();"
      },
      "meta": { "group": "ui", "tags": ["highlight"] }
    },
    {
      "key": "click-dom",
      "label": "点击(DOM)",
      "node": "EventDrivenOptionalClickNode",
      "params": { "click": true, "highlight": true, "maxWaitMs": 8000 },
      "meta": { "group": "click", "tags": ["dom"] }
    }
  ]
}
```

## 8. 运行时与 UI 集成
- 注入器（scripts/open-weibo-with-picker.cjs）
  - 读取 actions-system 事件/操作 → 注入为 `window.__webautoEvents`、`window.__webautoOps`
  - Pick 菜单：
    - 事件触发（picker:event）：`{ containerId, selector, eventKey }`
    - 操作执行（picker:operation）：`{ containerId, selector, opKey }`
- Node 侧桥接（建议）
  - 监听 `webauto_dispatch` 事件，对 `picker:event`/`picker:operation`：
    1) 在动作库中查找对应 key → 取得 `node` 与 `params`
    2) 将 `selector` 动态注入 params（如 `selectors: [selector]` 或 JS `script` 中注入全局 `__webautoTmpSelector`）
    3) 实例化节点并执行；记录行为与结果

## 9. 与容器的关系
- 容器仍可专有 runtime.events / runtime.operations（特例化）。
- UI 优先展示“容器选择（种类）”，默认选最近“匹配”或“父容器”。
- 操作/事件默认使用容器选择的 selector，或用户切换到 XPath/CSS 自定义选择器。

## 10. 扩展与站点覆盖
- 在 `actions-system/sites/<site>/` 下新增/覆盖事件与操作：
  - 与全局同 key 即覆盖；新增 key 则追加。
- 常见扩展：weibo.com 的 `action:expand`、`action:load-more`、`action:reply` 等；淘宝/1688 的聊天相关动作。

## 11. 验证与测试
- Schema 校验：在加载动作库时用 JSON Schema 验证（可加脚本 actions-validate.js）。
- 运行时验证：
  - UI 菜单展示可用事件/操作
  - 触发事件/操作后，上报 `picker:*` 结果与错误
- 建议集成 Playwright 端到端测试（打开测试页，注入动作库，自动触发若干事件/操作并断言）。

## 12. 命名与版本
- key 命名规范：
  - 事件：短语义，支持层次 `action:click` / `scroll:intoview`
  - 操作：短动词 `highlight-green` / `copy-selector`
- 版本策略：清单使用 `version`，节点与参数变更时 bump 版本；对 key 的兼容性变更使用 `deprecated` 与 `replacedBy`。

## 13. 未来工作
- 引入动作依赖/编排（如先滚动再点击）
- 支持多选择器策略与优先级（class > role > data-testid > id）
- 引入权限与安全控制（在自动点击/填入时）
- 提供事件/操作的可视化编排工具

---

## 附录 A：Schemas（简版）
- events.schema.json
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "label": { "type": "string" },
          "node": { "type": "string" },
          "params": { "type": "object", "additionalProperties": true },
          "meta": { "type": "object", "additionalProperties": true }
        },
        "required": ["key","node"]
      }
    }
  },
  "required": ["events"]
}
```
- operations.schema.json
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "operations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "label": { "type": "string" },
          "node": { "type": "string" },
          "params": { "type": "object", "additionalProperties": true },
          "meta": { "type": "object", "additionalProperties": true }
        },
        "required": ["key","node"]
      }
    }
  },
  "required": ["operations"]
}
```
