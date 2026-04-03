
## 背景

feed-like 露营攻略测试，验证点赞功能是否正确工作。

## 当前阻塞点

camo session 以 headless=True 运行，导致搜索结果页渲染不完整（visibleNoteCount=0），
feed_like_scan_empty 返回 0 个候选。`--foreground` 参数未生效。

## 下次提醒要做的第一步

确认如何正确启动 camo 为 headful 模式，然后重跑 feed-like 测试。

## 不能忘的检查项

- job_1774429437783_76b5eee3 已完成，但 feed_like_done=0, scan_empty
- 已提交 4 个修复 commit（timeout 保护、liked 检测、preShot 返回）
- camo session 状态：headless=True, url=https://www.xiaohongshu.com/explore
- 需要用户协助确认 camo headful 启动方式

## 巡检记录

- [17:05] 第1次巡检 job_1774429437783_76b5eee3
  - 状态：completed (script_complete)
  - feed_like_done: 0, feed_like_click_failed: 0
  - feed_like_scan_empty - 没有找到候选
  - 根因：camo headless=True，submit_search 报 visibleNoteCount=0
  - 尝试 `camo start xhs-qa-1 --foreground` 但 session 仍显示 headless=True
  - 需要用户协助

- [17:16] 第2次巡检
  - 确认 headless 问题仍未解决
  - 等待用户确认 camo headful 启动方式
