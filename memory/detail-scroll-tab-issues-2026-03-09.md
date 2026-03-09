# Detail 脚本问题诊断 (2026-03-09)

## 问题 1: Tab Pool 多 tab 失效

**现象**: 配置 `--tab-count 2`，但所有操作仍在 `tabIndex: 1`

**压力测试结果**:
- `switch-page` 命令正常工作
- `close-page` 返回 ok=true，但 tab 未真正关闭，变成 `about:newtab`
- webauto 侧 tab pool 逻辑可能未正确调用 camo 的 tab 命令

**根因**: camo `close-page` bug + webauto 未使用正确的 tab 管理 API

## 问题 2: 滚动停滞

**现象**: exitReason 全部是 `scroll_stalled_after_recovery`

**压力测试结果**:
- `mouse:wheel` 命令不带 anchor 时完全无效 (top 不变)
- `camo scroll --down --amount 300 --selector .note-scroller` 有效
- 滚动有效但 webauto 使用了错误的 API

**根因**: webauto 使用 `mouse:wheel` 而非 `scroll --selector`

## 问题 3: 评论覆盖率低

**现象**: 481 条预期只采 20 条 (4%)

**根因**: 滚动不工作导致无法加载新评论

## 问题 4: 点赞未执行

**现象**: 所有 reason=already_liked/null，无 reason=liked

**待验证**: 点赞按钮是否被正确点击，或状态检测有误

Tags: xhs, detail, scroll, tab-pool, bug
