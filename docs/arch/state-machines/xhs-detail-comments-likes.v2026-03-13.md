# XHS Detail 评论+点赞状态机（v2026-03-13）

## 1. 适用范围
- 仅覆盖 `detail` 环节中的：
  - 正文采集
  - 评论抓取
  - 评论内点赞
  - 单帖结束后的下一步路由（同 tab 下条 / tab 轮转 / 结束）
- 不覆盖 `collect` 产链逻辑；`collect` 作为前置输入真源，不在本环节修改范围内。

## 2. 输入/输出真源
- 输入真源：`safe-detail-urls.jsonl`
- 输出真源：
  - `content.md`
  - `comments.jsonl` / `comments.md`
  - `likes.summary.json`
  - run events (`*.events.jsonl`)

## 3. 全局状态机（ASCII，审核版）

```text
[S0 DETAIL_IDLE]
      |
      v
[S1 OPEN_DETAIL_LINK]
  - open_first_detail / open_next_detail
  - 成功锚点: detail_modal=true 且 noteId 命中预期
  - 失败终态: AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED -> S8
      |
      v
[S2 HARVEST_BODY]
  - detail_harvest
  - 落盘: content.md
      |
      v
[S3 HARVEST_COMMENTS]
  - comments_harvest
  - 子循环(单轮):
      1) expand replies
      2) focus comment scroll anchor(.note-scroller)
      3) collect new comments
      4) inline like pass(可见评论关键词点赞)
  - 进度锚点:
      progress = (collectedRows.length 增长) OR (scrollSignature 变化)
      churn-only(可见评论顺序抖动) != progress
  - 退出条件:
      a) reached_bottom
      b) tab_comment_budget_reached(默认 50)
      c) scroll_stalled_after_recovery
      d) comments_empty
  - 新增锚点约束（2026-03-13）：
      - **reached_bottom 判定必须使用 derivedAtBottom**：
        (scrollTop + clientHeight >= scrollHeight - 1) 视为到底
      - **recovery 触发前必须确认未到底**：若已到底直接退出，不进入 recovery
      - **recovery 后必须重新计算 derivedAtBottom**，避免 `atBottom` 缺失导致无效 recovery
      - **避免重复 recovery**：已到底时禁止 recovery 循环
      |
      v
[S4 MATCH_GATE]
  - harvested 评论匹配检查（统计，不等于必点赞）
      |
      v
[S5 DETAIL_FINISH]
  - finalize_detail_link（仅做写盘/队列完成/锚点推进，不做 UI 关闭）
  - 默认把当前 link 标记 done（即使 slot.failed 也不回队列，避免同 link 重复 claim 卡死）
  - 仅当显式开启 `requeueFailedLinks=true` 时，失败 link 才回队列重试
  - wait_between_notes
      |
      v
[S6 ROUTE_NEXT]
  判定顺序:
    A) 当前 tab 评论累计 < 50  -> 请求下一链接(open_next_detail)
    B) 当前 tab 评论累计 >= 50 ->
         - 有下一个 tab 且 tabIndex < tabCount(<=4): 切下一个 tab
         - 无下一个 tab 且仍可开新 tab(<=4): 开新 tab 并切换
         - 无可用 tab 且无剩余链接: 进入清理关闭
  - 预算命中时先保存 resume anchor（2-comment pair）
      |
      +------------------------------+
      |                              |
      v                              v
 [S1 OPEN_DETAIL_LINK]            [S8 CLEANUP_AND_DONE]
                                   - 仅在终态做一次 detail 清理关闭（page:back / goto list）
                                   - 发出 AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED
```

## 4. 锚点（Anchor）定义
- `detail_modal` 可见：详情页上下文有效
- `detail_comment_item` 可见：评论上下文有效
- 评论滚动容器锚点：`.note-scroller`（或运行时等价容器）
- 安全链接锚点：`noteId + xsec_token` 一致
- 轮转锚点：
  - `tabIndex`
  - `tabBudget.used`
  - `tabBudget.limit(50)`
  - link queue claim/release 状态
- 评论进度锚点：
  - `collectedRows.length`（唯一增量真源）
  - `scrollSignature(top/clientHeight/scrollHeight/atBottom/atTop)`
  - `stagnationRounds`（无增长且无 scroll 位移的连续轮次）

## 5. 错误分类与修复优先级
1. **锚点漏洞（优先修）**
   - 现象：状态存在但找不到锚点、锚点误判、锚点丢失后无法恢复
2. **状态机缺口（次优先）**
   - 现象：状态迁移缺边/死循环/终态不可达

默认策略：先修锚点，再评估是否需要改状态机结构。

## 6. 版本演进规则
- 不覆盖旧状态机图，新增版本文件：
  - `xhs-detail-comments-likes.vYYYY-MM-DD.md`
- 每次状态机变更必须同时写 memory（含 runId、证据、迁移理由）。
- 用户审批后，AGENTS.md 的“唯一真源路径”再切换到新版本。
