# 统一拾取面板（拾取/操作/容器库）设计

本设计将“拾取（元素选择）”与“操作（动作执行）”“容器库（持久化管理）”整合到同一面板，顶部标签可随时切换，确保体验一致、可扩展、易维护。

## 面板结构
- 顶部标签：`拾取 / 操作 / 容器库`（固定在最上方，可随时切换）
- 右上角常驻，支持拖拽（后续实现）；面板内一切下拉均使用内置下拉组件，不产生面板外悬浮层

### 拾取（元素）
- 识别信息：
  - 识别类：优先 `tag.class1.class2...`，无类时用 `#id`，最后退化结构 `tag:nth-of-type()` 限制 4 层
  - 父容器/根容器：从容器索引向上回溯匹配，展示每层匹配容器（点击切换当前容器）
- 容器选择：
  - 默认选择“最近匹配容器”，勾选“选中父容器”切换上一级
  - 当前选择器（input，可编辑）
- 快捷操作（样式展示）：高亮、复制选择器等

### 操作（动作执行）
- 操作库（自动加载 + 过滤）：
  - 基础库：`actions-system/operations/index.json`
  - 站点库：`actions-system/sites/{site}/operations.json`
  - 合并去重，按元素能力过滤（input-like/clickable/scrollable/any）
- 参数输入：标准字符输入框
- 按键序列：快捷 Chips（Enter/Backspace/Tab/Escape/Space/↑↓←→/Ctrl+Enter/Shift+Enter），转为 `keyboard:sequence`
- 操作队列：
  - 队列项 `{ opKey, params, afterKeys? }`，拖拽排序、编辑/删除
  - 执行：按序 await，存在 `afterKeys` 时自动串接一次 `keyboard:sequence`
- 结果区：逐项记录 {opKey, ok, 摘要}

### 容器库（测试库）
- 列表：`containers/test/{site}/picks/*.json`（去重建议：`classChoice + containerId`）
- 操作：加载（Live 预览 + 执行）、编辑（队列/顺序/参数）、复制、删除
- 详情：与“拾取”页信息一致（类、容器树、选择器、URL、截图路径）

## 事件协议（Inpage → Node）
- `picker:operation` { opKey, selector }
- `picker:save` { selector, classChoice, containerId, containerSelector, containerTree, operations? }
- `picker:vk` { key, selector }

Node → Inpage：
- `__webautoShowResult(payload)` 用于将结果写入面板结果区

## 过滤与推荐
- 元素能力：
  - `inputLike`: input/textarea/contentEditable or `'value' in el`
  - `clickable`: `a,[role=button],button,[tabindex]` 等、或常见图标 `.woo-font--*`
  - `scrollable`: overflow 可滚动或视口外
- 目标匹配：操作定义中增加 `targets`（如 `['input','clickable','any']`），仅展示适配项；`category` 用于分组

## 持久化结构（示例）
```
{
  site, pageUrl, timestamp,
  selector, classChoice, containerId, containerSelector,
  containerTree: [ { depth, matches: [ { id, selector } ] } ],
  operations: [ { opKey, params, afterKeys? } ],
  snapshotPath
}
```

## 预登录与注入
- 统一从 preflow（Cookie 注入 + 登录验证）开始
- context.addInitScript 级注入，刷新/跳转/新开页均自动注入
- 无法加载完整面板时展示“简易面板”兜底

## 运行样式预览（无功能）
- 全面板：`node scripts/open-weibo-ui-mock-direct.cjs --cookies ~/.webauto/cookies/weibo.com-latest.json`
- 仅操作页：`node scripts/open-weibo-ui-mock-direct-ops.cjs --cookies ~/.webauto/cookies/weibo.com-latest.json`

## 后续实现要点
- 统一下拉组件：面板内部，自动翻转，上层 z-index
- 队列执行与结果落盘：逐项 await + 结果区显示 + 记录
- 站点库扩展：weibo 专用操作（展开、加载更多、打开评论、点赞、关注、转发等）

