# 2026-03-12 Unified 最小实跑：评论+点赞链路（卡 running）

Tags: xhs, unified, comments, likes, detail, stuck-running, link_finalize_only, open_next_detail, run-report

## 目标
在已有 safe-detail-urls 的前提下，跑一轮 unified（max-notes=1）验证评论抓取与点赞链路。

## 命令
```bash
node bin/webauto.mjs xhs unified \
  --profile xhs-qa-1 \
  --keyword "seedance2.0" \
  --max-notes 1 \
  --do-comments true \
  --persist-comments true \
  --do-likes true \
  --like-keywords "真牛逼,太强了" \
  --max-likes 2 \
  --env debug \
  --tab-count 1 \
  --output-root ./.tmp/min-smoke-comments-like
```

## 运行结果（runId）
- runId: `787482e0-a911-4f73-a440-3f89b2e71135`
- 状态：`running`（progress=1/1），截至 2026-03-12T03:51:22Z 无终态
- 关键时间：
  - startedAt: `2026-03-12T03:44:41.788Z`
  - updatedAt(stale): `2026-03-12T03:46:34.180Z`

## 关键证据
- 事件日志：
  - `./.tmp/min-smoke-comments-like/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T03-44-25-570Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- open_first_detail 成功：opened=true，进入 explore + xsec_token
- comments_harvest 完成：`commentsAdded=37`，`exitReason=scroll_stalled_after_recovery`
- comment_match_gate：`matchCount=2/354`（harvested 命中），但可见点赞 pass `likedCount=0`
- close_detail：`method=link_finalize_only`，`released=true`
- wait_between_notes 完成后：
  - 未出现 `open_next_detail operation_start/done`
  - 持续出现 `detail_modal/detail_comment_item/detail_discover_button exist + tick` 循环

## 产物
- 评论：`/Users/fanzhang/.webauto/download/xiaohongshu/debug/seedance2.0/69909a1f000000001600bd3e/comments.jsonl`（37 行）
- 点赞汇总：`./.tmp/min-smoke-comments-like/xiaohongshu/debug/seedance2.0/69909a1f000000001600bd3e/likes.summary.json`
- safe links：`./.tmp/min-smoke-comments-like/xiaohongshu/debug/seedance2.0/safe-detail-urls.jsonl`（3 行）

## 结论
- 评论抓取链路已执行并落盘。
- 点赞未发生（可见命中 0；harvested 命中 2）。
- 终态机存在卡点：close->wait 后未切到 open_next/detail done，任务卡 running。
