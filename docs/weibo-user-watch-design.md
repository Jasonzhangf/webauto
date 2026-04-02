# Weibo User Watch — 详细设计文档

> Task: 针对特定微博用户进行新帖监听，检测到新帖后自动抓取 detail 并推送通知。
> Author: SystemBot (调研 + 设计)
> Date: 2026-03-31

---

## 1. 需求概述

### 核心功能
1. **用户监听列表管理** — 添加/删除/批量添加/批量删除/导出监听用户
2. **定时新帖检测** — daemon 每 30 分钟批量检查所有监听用户的时间线
3. **自动 detail 抓取** — 检测到新帖后，自动触发 `webauto weibo detail` 采集完整详情
4. **历史帖子爬取** — 对监听用户进行全量历史帖子爬取，按时间排序
5. **新帖推送通知** — 新帖 detail 抓取完成后通过 mailbox 通知 system agent 推送

### Non-Goals
- 不做评论监听（已有 comments 模块）
- 不做转发链追踪
- 不做用户关系分析

---

## 2. 监听列表管理设计

### 2.1 监听列表存储

**文件路径**: `~/.webauto/watch-list.json`

```json
{
  "version": 1,
  "updatedAt": "2026-03-31T12:00:00.000Z",
  "users": [
    {
      "userId": "5564927603",
      "userName": "无心简影",
      "profileUrl": "https://weibo.com/u/5564927603",
      "addedAt": "2026-03-31T12:00:00.000Z",
      "tags": ["猫", "摄影"],
      "lastCheckedAt": "2026-03-31T12:30:00.000Z",
      "lastPostId": "QyxMiAucT",
      "lastPostTime": "2026-03-30T16:00:00.000Z",
      "enabled": true
    }
  ]
}
```

### 2.2 CLI 命令设计

新增 `webauto weibo watch` 子命令组：

```bash
# 添加单个用户
webauto weibo watch add --user-id <uid> [--name <name>] [--tags <tag1,tag2>]

# 删除单个用户
webauto weibo watch remove --user-id <uid>

# 批量添加（从文件或 URL 列表）
webauto weibo watch add-batch --file <path>
# 文件格式：每行一个 userId 或 profileUrl
# 5564927603
# https://weibo.com/u/2107014571
# 2107014571

# 批量删除（从文件）
webauto weibo watch remove-batch --file <path>

# 列出所有监听用户
webauto weibo watch list [--json] [--enabled-only]

# 导出监听列表
webauto weibo watch export [--file <path>] [--format json|csv]

# 导入监听列表（合并模式）
webauto weibo watch import --file <path> [--mode merge|replace]

# 查看单个用户状态
webauto weibo watch status --user-id <uid>
```

### 2.3 文件模块

**新建文件**: `apps/webauto/entry/lib/watch-store.mjs`

```javascript
// 核心 API
export function loadWatchList()          // 读取 ~/.webauto/watch-list.json
export function saveWatchList(data)      // 写入
export function addWatchUser(user)       // 添加单个（去重检查）
export function removeWatchUser(userId)  // 删除单个
export function getWatchUser(userId)     // 查询单个
export function listWatchUsers(opts)     // 列表（支持 enabled-only 过滤）
export function addWatchUsersBatch(list) // 批量添加（返回成功/跳过/失败计数）
export function removeWatchUsersBatch(list) // 批量删除
export function updateWatchUser(userId, patch) // 更新 lastCheckedAt/lastPostId 等
export function exportWatchList(opts)    // 导出 JSON/CSV
export function importWatchList(payload, mode) // 导入
```

---

## 3. 定时新帖检测设计

### 3.1 检测流程

```
daemon 每 30 分钟触发 watch-check 任务
  → 加载 watch-list.json
  → 对每个 enabled 用户：
    → 访问用户主页 https://weibo.com/u/{userId}
    → 提取时间线前 N 条帖子（默认 10 条）
    → 对比 lastPostId：
      → 如果 firstPostId == lastPostId → 无新帖，跳过
      → 如果 firstPostId != lastPostId → 有新帖
        → 提取所有新帖 URL（直到遇到 lastPostId 为止）
        → 写入 watch-new-posts.jsonl（增量）
        → 更新 watch-list.json 的 lastPostId/lastPostTime
    → 更新 lastCheckedAt
```

### 3.2 用户主页 DOM 结构

```
URL: https://weibo.com/u/{userId}
页面与 timeline 使用相同的虚拟滚动架构：
  .vue-recycle-scroller__item-view → .wbpro-scroller-item
帖子提取逻辑可复用 timeline-ops.mjs 的 EXTRACT_TIMELINE_JS
```

### 3.3 Schedule 任务配置

```bash
# 注册 watch-check 定时任务（每 30 分钟）
webauto schedule add \
  --name "weibo-watch-check" \
  --schedule-type interval \
  --interval-minutes 30 \
  --command-type weibo-watch \
  --task-type watch \
  --profile weibo
```

### 3.4 新帖产出文件

**路径**: `~/.webauto/download/weibo/prod/watch/<date>/new-posts.jsonl`

每行一条 JSON：
```json
{
  "postId": "QxNew001",
  "url": "https://weibo.com/5564927603/QxNew001",
  "authorId": "5564927603",
  "authorName": "无心简影",
  "content": "新帖正文摘要...",
  "detectedAt": "2026-03-31T12:30:00.000Z",
  "detailFetched": false
}
```

---

## 4. 自动 Detail 抓取设计

### 4.1 触发机制

watch-check 检测到新帖后，自动生成 links.jsonl 文件，然后调用 detail：

```bash
# 自动生成
~/.webauto/download/weibo/prod/watch/<date>/links.jsonl

# 自动调用
webauto weibo detail -p weibo --links-file <watch-dir>/links.jsonl \
  --content-enabled --images-enabled --comments-enabled
```

### 4.2 Detail 输出结构

```
~/.webauto/download/weibo/prod/watch/<date>/
├── new-posts.jsonl          # 新帖发现记录
├── links.jsonl              # 自动生成的链接文件
├── collection-meta.json     # 采集元数据
├── run.log                  # 运行日志
├── {postId}/                # 每个帖子的 detail 目录
│   ├── content.md           # 正文 Markdown
│   ├── comments.md          # 评论 Markdown
│   ├── comments.jsonl       # 评论 JSONL
│   ├── detail-meta.json     # 帖子元数据
│   ├── links.json           # 外链
│   └── images/              # 图片目录
```

### 4.3 与现有 detail 模块的关系

完全复用现有 `webauto weibo detail` 命令，不修改 detail 代码。
只需在 watch-check 流程中自动调用 detail 命令并传入 links.jsonl。

---

## 5. 历史帖子爬取设计

### 5.1 命令

```bash
# 爬取单个用户的历史帖子
webauto weibo watch history --user-id <uid> \
  --max-posts 200 \
  --fetch-detail true

# 爬取所有监听用户的历史帖子
webauto weibo watch history --all \
  --max-posts 100 \
  --fetch-detail true
```

### 5.2 流程

```
1. 访问用户主页
2. 滚动加载帖子（复用 timeline-ops.mjs 的滚动逻辑）
3. 提取所有帖子 URL（去重）
4. 写入 links.jsonl
5. 调用 webauto weibo detail 抓取详情
6. 所有 detail 完成后，按发布时间排序生成合并文件
```

### 5.3 时间排序合并

detail 抓取完成后，读取所有 `detail-meta.json` 中的 `publishedAt` 字段，按时间倒序排序，生成合并索引：

**文件**: `~/.webauto/download/weibo/prod/watch-history/<userId>/merged-index.jsonl`

```json
{"postId": "QyOld100", "url": "...", "publishedAt": "2025-01-15T10:00:00.000Z", "authorId": "5564927603", "authorName": "无心简影"}
{"postId": "QyOld099", "url": "...", "publishedAt": "2025-01-14T08:00:00.000Z", "authorId": "5564927603", "authorName": "无心简影"}
```

---

## 6. 架构映射

### 6.1 新建文件

| 文件路径 | 职责 |
|---------|------|
| `apps/webauto/entry/lib/watch-store.mjs` | 监听列表 CRUD 存储 |
| `apps/webauto/entry/lib/watch-runner.mjs` | watch 命令执行逻辑（check/history/detail-chaining） |
| `apps/webauto/entry/weibo-watch.mjs` | CLI 入口（`webauto weibo watch` 子命令） |

### 6.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `bin/webauto.mjs` | 添加 `watch` 子命令路由 |
| `apps/webauto/entry/lib/schedule-store.mjs` | `SUPPORTED_COMMAND_TYPES` 添加 `weibo-watch` |
| `apps/webauto/entry/schedule.mjs` | 添加 `weibo-watch` command-type 路由 |

### 6.3 复用模块（不修改）

| 模块 | 用途 |
|------|------|
| `weibo/timeline-ops.mjs` | 用户主页帖子提取（复用 `harvestTimeline` + `navigateToWeiboHomepage`） |
| `weibo/persistence.mjs` | JSONL 输出格式 |
| `weibo/detail-flow-ops.mjs` | detail 采集流程 |
| `lib/schedule-store.mjs` | 定时任务管理 |

---

## 7. 推送通知设计

### 7.1 与现有 timeline 推送对齐

复用现有 cron → delta → mailbox 通知 → system agent 读取总结 → 推送流程：

```
cron: 0 7-21 * * * ~/.finger/scripts/weibo_watch_push.sh
  → 读取 watch-new-posts.jsonl delta
  → myfinger mailbox notify --target finger-system-agent \
      --message "weibo-watch: N 条新帖待推送" \
      --title "微博用户监听更新"
  → system agent 被唤醒
  → 读取 detail 内容
  → 总结后推送给用户
```

### 7.2 推送脚本

**新建**: `~/.finger/scripts/weibo_watch_push.sh`（与 `weibo_timeline_push.sh` 平行）

### 7.3 静默时间

与 timeline 一致：22:00 - 7:00 不推送。

---

## 8. 验收标准

- **AC-1**: `webauto weibo watch add/remove/list/export/import` 命令全部可用
- **AC-2**: `webauto weibo watch add-batch --file` 批量添加，返回成功/跳过/失败计数
- **AC-3**: `webauto weibo watch remove-batch --file` 批量删除
- **AC-4**: `watch-list.json` 格式正确，字段完整
- **AC-5**: `webauto schedule add --command-type weibo-watch` 注册定时任务成功
- **AC-6**: watch-check 每 30 分钟运行，检测到新帖写入 `new-posts.jsonl`
- **AC-7**: 新帖自动触发 detail 抓取，输出目录结构正确
- **AC-8**: `webauto weibo watch history --user-id` 完成历史爬取，按时间排序
- **AC-9**: 所有新建文件通过 `node --check` 语法检查
- **AC-10**: 现有 timeline/detail/search 功能不受影响
