# Detail 评论容器滚动手动验证（2026-03-06）

## 背景
用户要求 detail 评论采集必须满足：
- 所有操作只能落在可见元素上。
- 每个动作必须有明确承载容器。
- 评论滚动必须由评论上下文触发，不能误落到正文图片区。
- 手动验证先于自动验证。

## 本次修复
唯一修复点：`modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
- 移除 `focusCommentContext()` 中对 `readCommentFocusTarget()` / comment item 的点击。
- 收敛为固定链路：`comment entry -> comment total -> comment scroll container`。
- 如果点击评论入口后没有 `.total`，直接返回 `comment_panel_not_opened`，不再冒险点击评论项。

## 关联底层能力
已使用 camo 容器滚动原语：
- `camo scroll --selector '.comments-container, .comment-list, .comments-el, .note-scroller'`
- scroll 会先解析可见容器、点击容器中心，再以 `anchorX/anchorY` 发送 wheel。

## 手动验证环境
- profile: `xhs-qa-1`
- safe links source: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- 使用真实 `camo` 命令，不走搜索。

## 验证 1：note `699a5418000000000a03da5b`
URL:
`https://www.xiaohongshu.com/explore/699a5418000000000a03da5b?xsec_token=AB6XVHL-NdeF2E1AA4y3B0bYUt6WFOvxAEmcRQdO6cukE=&xsec_source=`

观察：
- `.total` = `共 8 条评论`
- `.note-scroller.scrollTop = 258`
- `.note-scroller.scrollHeight - clientHeight = 258`
- 说明该 note 已经在底部，没有额外下滚空间。

结论：
- 该 note 的有效滚动承载容器是 `.note-scroller`
- 之前“滚不动”并不是滚错位置，而是本身已经到底

## 验证 2：note `6997df4d00000000150207fd`
URL:
`https://www.xiaohongshu.com/explore/6997df4d00000000150207fd?xsec_token=ABSvUgwWKJ_dX9AvSM4ChDTpCwAVbFIVpcahTaMwG-AMU=&xsec_source=`

手动步骤：
1. `camo click xhs-qa-1 '.chat-wrapper' --highlight`
2. 等待 5s
3. `camo click xhs-qa-1 '.total' --highlight`
4. 等待 5s
5. `camo scroll xhs-qa-1 --selector '.comments-container, .comment-list, .comments-el, .note-scroller' --down --amount 220 --highlight`
6. 用 `camo devtools eval` 检查滚动结果

关键证据：
- 初始 `.note-scroller.scrollTop = 0`
- 初始 `maxScrollTop = 1705`
- 滚动后 `.note-scroller.scrollTop = 498`
- 命中的 scroll target: className = `note-scroller`

结论：
- 容器解析正确命中 `.note-scroller`
- 下滚真实生效，且作用域在 detail 右侧 note scroller，不是正文图片区误滚
- 当前需要保持“只点 entry / total / scroll container”，不要再点 comment item

## 当前结论
- detail 评论滚动的核心问题已收敛：必须容器锚定滚动，且 orchestrator 不能额外点 comment item。
- 当前手动链路已证明：至少在一个可滚动 note 上，scrollTop 会正确增长。
- 下一步应做 detail-only 最小自动验证，而不是 unified 全流程验证。

## 2026-03-06 补充复核

### 新现象
- 用户指出自动脚本仍然“重复打开同一链接 + 点击后不滚动”。
- 我重新复核后确认：
  - `open_next_detail` 的 safe-link 推进已经修到不再重复第一条；最新 run `85b9e2bc-d4cd-42d4-b99c-b1106128a993` 已顺序打开 4 个唯一 noteId。
  - 但评论滚动仍未真正可用。

### 最新手动证据
在 note `698de0c8000000001a01e38d` 上，直接读取容器状态：

- `.note-scroller.scrollTop = 0`
- `.note-scroller.scrollHeight = 4098`
- `.note-scroller.clientHeight = 1624`
- 第一条 `.comment-item.top = 528`

然后分别对这些元素发送协议级 `mouse:wheel`：

- `.note-scroller`
- `.interaction-container`
- `.comments-container`
- `.comments-el`
- `.comment-item`

结果全部一样：

- `.note-scroller.scrollTop` 不变
- 第一条评论 `top` 不变
- `window.scrollY` 不变

这说明：当前协议级 wheel 没有驱动 detail 评论滚动。

### 反证
我随后直接用 JS 修改：

```js
document.querySelector('.note-scroller').scrollTop += 420
```

立即得到：

- `.note-scroller.scrollTop: 0 -> 420`
- 第一条 `.comment-item.top: 528 -> 108`
- `.total.top: 500 -> 80`

结论非常明确：

- 真实承载评论滚动的容器就是 `.note-scroller`
- `.comments-container` / `.comments-el` 只是内容块，不是可滚动容器
- 当前失败点不是“选错 comments 容器”，而是“协议级输入没有成功绑定到 `.note-scroller` 的滚动行为”

### 焦点验证
额外验证点击：

- 点击 `.chat-wrapper .count` 后，`activeElement = P.content-input`
- 点击 `.total` 后，`activeElement = P.content-input`
- 此时连续发送 `PageDown`，`.note-scroller.scrollTop` 仍不变

所以：

- `comment entry -> total` 这条链路会把焦点带到输入框
- 之后依赖 PageDown 也不能驱动评论滚动

### 当前结论更新
- 自动 detail 评论采集尚未完成。
- 下一步必须先手动验证：在不触发输入框焦点污染的前提下，什么协议级输入方式能真正推动 `.note-scroller`。
- 在这个验证完成前，不能继续假设现有 `mouse:wheel` / `PageDown` 自动链路可用。

## 2026-03-06 第二次手动验证与自动回归

### 手动验证结果
我直接对同一条 note 做了协议级最小实验，结论已经收敛：

1. 点击 `.note-scroller` 后，`activeElement` 仍然是 `BODY`
2. 第一次 `PageDown` 通常不动
3. 第二次 `PageDown` 开始明显推动 `.note-scroller`
4. 之后 `ArrowDown` / `Space` / `End` 也都会继续推动 `.note-scroller`

最小证据：

- before: `.note-scroller.scrollTop = 0`, `firstCommentTop = 528`
- after second `PageDown`: `.note-scroller.scrollTop = 1590`, `firstCommentTop = -1062`

这说明：

- 协议级可用路径不是 `mouse:wheel`
- 当前可工作的路径是：`click .note-scroller -> PageDown x2 起步 -> 再继续键盘滚动`

### 已落地修复
唯一修复点：`modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs`

`scrollBySelector()` 已改为：

- 先解析目标容器（当前 detail 评论链路会命中 `.note-scroller`）
- 点击该容器中心建立 BODY / 容器滚动上下文
- 等待 1200ms
- 垂直滚动改为键盘序列：
  - `PageDown` / `PageUp` 多步
  - 追加一次 `ArrowDown` / `ArrowUp` 收尾

### 最小自动验证
直接调用 `executeCommentsHarvestOperation()` 对单条 note 验证：

- before: `scrollTop = 0`
- after: `scrollTop = 2564`
- delta: `+2564`
- `firstCommentTop: 528 -> -2036`

说明自动 comments harvest 内部现在确实触发了真实滚动，不再是“点了但没滚”。

### 仍未完成的问题
随后跑 5 条 detail-only unified：

- runId: `00a48f30-39a9-4065-9253-a5d138f271d3`
- summary: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-06T13-32-14-474Z/summary.json`
- events: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-06T13-32-14-474Z/profiles/wave-001.xhs-qa-1.events.jsonl`

结果：

- 只打开了 1 条 note
- `comments_harvest` 在 unified 里超时 180s
- stop reason = `operation_timeout`

这说明当前阻塞点已经从“不会滚”转成“unified 编排阶段内 comments_harvest 没有正常返回 / 没有正确结束”。

### 更新后的结论
- 评论滚动绑定问题已确认并已有可工作的自动修复路径。
- 现在的下一阻塞点是 `comments_harvest` 在 unified 里的退出条件 / 返回路径，不再是容器选择问题。
