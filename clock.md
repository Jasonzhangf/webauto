# Clock 任务

## 背景
openclaw 5 条测试已启动（runId: 71b766d2-a0f6-4e08-8d0d-02adc3b3a323），需要确认：
- tab 切换间隔是否在 2–5 秒随机范围内
- 评论滚动间隔是否在 0.5–2 秒随机范围内
- ensure_tab_pool / open_first_detail 是否正常推进

## 当前阻塞点
等待巡检结果：尚未确认 tab/scroll 间隔是否生效

## 下次提醒要做的第一步
查看最新 events.jsonl，核对 tab 切换与滚动间隔

## 不能忘的检查项
- ensure_tab_pool 是否完成
- open_first_detail 是否触发
- progress 是否 > 0
- tab 切换间隔是否符合 2–5s
- 滚动间隔是否符合 0.5–2s

## 建议内容示例
- 背景：正在准备 llms 包发布，已完成 build 和本地验证
- 当前阻塞点：等待 10 分钟后再检查 npm 包同步状态
- 下次提醒要做的第一步：运行 npm view 检查新版本是否可见
- 不能忘的检查项：确认 tag、版本号、release notes、install smoke test

## DELIVERY
（完成后在此记录交付证据）

## REVIEW
（审核结论）

## APPROVE
（审批记录）
