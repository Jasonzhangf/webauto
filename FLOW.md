# FLOW.md — Weibo Search Collect Task

## Task Overview
在 webauto 中实现 `webauto weibo collect` 命令，通过 camo CLI 访问微博搜索页面，采集不重复的搜索结果链接集合。支持 daemon 任务自动重试和完成。

## Verification Evidence (手动验证已完成 ✅)

### V1: 微博登录状态 ✅
- Profile: `weibo` (camo profile)
- 验证方法: `camo goto weibo https://weibo.com` → 截图确认已登录
- 证据: Cookie 包含 SUB/SUBP，页面显示首页内容流而非登录页

### V2: 微博搜索功能 ✅
- URL: `https://s.weibo.com/weibo?q=AI`
- 搜索结果页面正常加载，包含卡片列表
- CSS 选择器:
  - 搜索卡片: `.card-wrap[action-type="feed_list_item"]`
  - 作者名: `a.name` (非 `a.name-text`)
  - 正文: `p.txt[node-type="feed_list_content"]`
  - 帖子链接: `a[href*="weibo.com"][action-type="feed_list_item"]` 或 `.from a[href*="weibo.com"]`
- 每页约 20-21 条结果

### V3: 搜索结果链接可访问 ✅
- 访问 `https://weibo.com/1111681197/QyirofuLa` 成功
- 页面标题: "微博正文 - 微博"
- 截图证据: `/tmp/weibo-post-detail-verify.png`

### V4: 滚动和底部判断 ✅
- `window.scrollTo(0, document.body.scrollHeight)` 成功滚动
- nearBottom 判断: `(scrollY + clientHeight >= scrollHeight - 100)` → `true`
- 底部无无限滚动加载（卡片数始终 20，未增加）
- **结论: 微博搜索使用分页模式，非无限滚动**

### V5: 翻页功能和判断 ✅
- 底部分页导航: `a.next` (下一页) → `https://s.weibo.com/weibo?q=AI&page=2`
- 页码链接: 第1-50页，格式 `?q=AI&page=N`
- 末页判断: `a.next` 不存在或 disabled

## Architecture Design (平行于 XHS)

### 文件结构
```
modules/camo-runtime/src/autoscript/action-providers/
  weibo/
    search-ops.mjs       # 微博搜索操作（搜索、读取候选）
    collect-ops.mjs      # 微博链接采集操作（翻页、去重、持久化）
    dom-ops.mjs          # 微博专用 DOM 操作（复用或继承自公共 dom-ops）
    persistence.mjs      # 微博采集结果持久化（JSONL）
    auth-ops.mjs         # 微博登录检测
    utils.mjs            # 微博工具函数

apps/webauto/entry/
  weibo-collect.mjs      # 入口：webauto weibo collect
  lib/
    weibo-collect-runner.mjs   # 采集 runner（类似 xhs-collect-runner）
    weibo-collect-verify.mjs   # 采集结果验证
```

### CLI 入口设计
```bash
# 标准 CLI 命令
webauto weibo collect --profile weibo --keyword "AI" --max-notes 50 [--env debug] [--output-root <path>]

# Daemon 任务提交
webauto daemon task submit --detach -- weibo collect --profile weibo --keyword "AI" --max-notes 50
```

### 关键参数
- `--profile <id>`: camo profile ID（必须为已登录的微博 profile）
- `--keyword <kw>`: 搜索关键词
- `--max-notes <n>`: 目标链接数（默认 21，确保超过一页）
- `--env <name>`: 输出环境目录
- `--output-root <path>`: 自定义输出根目录

### 数据流
```
搜索 → 提取链接 → URL 去重(BloomFilter) → 翻页 → 重复直到达到目标数量或无更多页面 → 持久化 JSONL → 验证
```

### Collect 状态机
```
[INIT] → goto search URL → [COLLECTING]
[COLLECTING] → extract links → dedup → 
  if count >= target → [DONE]
  if has next page → goto next page → [COLLECTING]
  if no next page → [DONE]
[DONE] → persist JSONL → verify count → [COMPLETE]
```

### 终局条件
1. 达到目标数量 (`max-notes`)
2. 无更多页面 (`a.next` 不存在)
3. 连续 2 页无新增链接（全重复）

### 持久化格式 (JSONL)
复用 `collection-manager` 模块，platform='weibo'：
```json
{"id":"QyirofuLa","url":"https://weibo.com/1111681197/QyirofuLa","authorId":"1111681197","authorName":"来去之间","content":"...","collectedAt":"2026-03-29T04:00:00Z","publishedDate":"2026-03-29"}
```

### 输出目录
```
~/.webauto/download/weibo/<env>/search:<keyword>/links.jsonl
```

## Acceptance Criteria (验收标准)

### AC1: 标准 CLI 命令
**输入**: `WEBAUTO_DAEMON_BYPASS=1 webauto weibo collect --profile weibo --keyword "AI" --max-notes 30`
**预期**: 命令成功执行，退出码 0

### AC2: 搜索结果链接集合
- 输出 JSONL 文件存在且非空
- 链接数 >= max-notes
- 所有链接唯一（URL 去重）
- 所有链接可访问（返回 200 或页面标题包含"微博"）

### AC3: 去重验证
- 相同 URL 不重复出现
- BloomFilter 状态正确持久化
- 增量模式支持：再次运行相同关键词不重复采集已采集的链接

### AC4: Daemon 任务
- `webauto daemon task submit --detach -- weibo collect --profile weibo --keyword "AI" --max-notes 30` 成功提交
- Daemon 自动执行并完成
- 失败时自动重试（最多 3 次）

### AC5: 交付物
- 搜索结果 JSONL 文件（含 id, url, authorId, authorName, content, collectedAt, publishedDate）
- 运行截图（搜索页面 + 结果页面）
- 运行状态日志

## Implementation Steps (for Project Agent)

1. 创建 `modules/camo-runtime/src/autoscript/action-providers/weibo/` 目录
2. 实现 `search-ops.mjs`: 微博搜索 URL 导航、候选提取
3. 实现 `collect-ops.mjs`: 分页遍历、链接去重、JSONL 持久化
4. 实现 `persistence.mjs`: 输出上下文解析（`resolveWeiboOutputContext`）
5. 创建 `apps/webauto/entry/weibo-collect.mjs` 入口
6. 创建 `apps/webauto/entry/lib/weibo-collect-runner.mjs` 和 `weibo-collect-verify.mjs`
7. 修改 `bin/webauto.mjs` 将 `weibo` 占位替换为实际入口
8. 修改 `modules/camo-runtime/src/autoscript/action-providers/index.mjs` 注册 weibo
9. 端到端测试: `WEBAUTO_DAEMON_BYPASS=1 webauto weibo collect --profile weibo --keyword "AI" --max-notes 21`

## State
- Phase: IMPLEMENTATION_COMPLETE
