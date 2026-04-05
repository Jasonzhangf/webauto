# Always-On 模式设计文档

## Summary

将当前的**顺序采集 → 顺序处理**改为 **Producer-Consumer 异步双线程模式**。

- **Producer**（定时 Schedule Job）：周期性搜索 + 队列低水位触发补货，基于已有输出文件去重
- **Consumer**（持久运行 Job）：持续从服务端队列取链接处理（点赞/下载/评论），处理完等待新链接
- **Queue**：复用当前 search-gate 服务端队列（claim/complete/release）
- **适用范围**：通用框架，XHS + Weibo 的所有 unified 任务都支持

## 架构对比

### 当前架构（顺序）

```
collect_links(50条) → open_detail → harvest/like → finalize → open_next_detail → ...
```

### 目标架构（Always-On Producer-Consumer）

```
Producer (Schedule Job, 周期触发)          Consumer (持久 Job, 持续运行)
┌─────────────────────────┐               ┌─────────────────────────┐
│ 1. 读取已有输出文件       │               │ 1. claimNextLink()      │
│    posts.jsonl/links.jsonl│              │ 2. open_detail(noteUrl) │
│    获取已处理 noteId Set  │               │ 3. comments_harvest     │
│                          │               │    / detail_harvest     │
│ 2. 搜索关键词             │               │    / feed_like          │
│    提取搜索结果           │               │ 4. completeLink()       │
│                          │               │ 5. 回到 1 (队列空则等待) │
│ 3. 去重: 新帖子 - 已处理   │               └───────────┬─────────────┘
│    未在 done Set 中的入队   │                           ↑
│                          │               Queue (search-gate 服务端)
│ 4. 低水位检查:            │               claim / complete / release
│    队列 < threshold?      │                           |
│    YES → 立即触发下一次搜索│                           |
│    NO  → 等待下次周期     │                           |
└─────────────────────────┘                           
```

## 关键设计决策

| 决策点 | 选择 | 说明 |
|--------|------|------|
| 队列共享方式 | 服务端队列（search-gate） | 多实例可共享，已有 claim/complete/release |
| Producer 调度 | 周期扫描 + 队列低水位触发 | 每 N 分钟扫描，队列低于阈值时触发补货 |
| Consumer 模式 | 持续运行 | 队列有链接就处理，处理完等待新链接 |
| 去重范围 | 基于已有输出文件 | 读取 posts.jsonl/links.jsonl 获取已处理 noteId |

## Daemon Schedule 配置示例

```jsonl
// Producer: 每 30 分钟扫描，队列低于 10 条时触发补货
{
  "id": "sched-prod-001",
  "name": "xhs-producer-seedance",
  "scheduleType": "interval",
  "intervalMinutes": 30,
  "commandType": "xhs-producer",
  "commandArgv": {
    "keyword": "seedance2.0",
    "profile": "xhs-qa-1",
    "minQueueDepth": 10,
    "maxLinksPerScan": 20,
    "dedupSource": "posts.jsonl"
  }
}

// Consumer: 持久运行（interval=0 表示队列为空时等待而非退出）
{
  "id": "sched-cons-001", 
  "name": "xhs-consumer-seedance",
  "scheduleType": "interval",
  "intervalMinutes": 0,
  "commandType": "xhs-consumer",
  "commandArgv": {
    "keyword": "seedance2.0",
    "profile": "xhs-qa-1",
    "tabCount": 4,
    "commentBudget": 50,
    "doComments": true,
    "doLikes": true
  }
}
```

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `apps/webauto/entry/lib/schedule-store.mjs` | 新增 commandType 支持 |
| `apps/webauto/entry/xhs-producer-runner.mjs` | Producer 入口（新建） |
| `apps/webauto/entry/xhs-consumer-runner.mjs` | Consumer 入口（新建） |
| `apps/webauto/entry/weibo-producer-runner.mjs` | Weibo Producer 入口（新建） |
| `apps/webauto/entry/weibo-consumer-runner.mjs` | Weibo Consumer 入口（新建） |
| `bin/webauto.mjs` | 注册新子命令 |

## Consumer 空队列等待机制

`claimXhsDetailLink` 返回 `{ link: null, exhausted: false }` 时：
1. 不抛 AUTOSCRIPT_DONE，sleep 30s 后重试
2. 每 60s emit `consumer_idle` heartbeat 事件
3. 收到 stop signal 或 daemon shutdown 时才退出

## Producer 去重逻辑

```javascript
// 读取已有输出文件
const postsPath = resolveOutputPath(env, keyword, 'posts.jsonl');
const existingNoteIds = new Set();
if (fs.existsSync(postsPath)) {
  const posts = readJsonlRows(postsPath);
  posts.forEach(p => existingNoteIds.add(p.noteId));
}

// 搜索并去重
const searchResults = await collectSearchResults(keyword, maxLinks);
const newLinks = searchResults.filter(l => !existingNoteIds.has(l.noteId));

// 入队
await initXhsDetailLinkQueue(...);
for (const link of newLinks) {
  await claimXhsDetailLink(link);
}
```
