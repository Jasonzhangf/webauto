# Clock - 小红书 200 条压力测试巡检 (openclaw)

## 背景
正在进行小红书 200 条压力测试（keyword=openclaw, like-keywords="真牛逼,太强了,厉害"）。

## 当前阻塞点
任务刚启动，等待搜索完成和详情处理开始。

## 下次提醒要做的第一步
检查运行状态：
1. 检查最新的 runId 和日志路径
2. 确认搜索是否完成，链接数量是否 >= 200
3. 确认详情处理进度（openedNotes / commentsHarvestRuns）
4. 确认评论采集和点赞流程是否正常
5. 检查点赞命中数量（likesNewCount）

## 不能忘的检查项
- 目标：200 条帖子
- 点赞关键词：真牛逼,太强了,厉害
- 评论必须持久化（persist-comments=true）
- 环境模式：debug（遇到错误立即停止）
- 4-tab 轮转
- 关注点：评论采集速度、点赞命中率、recovery 次数
