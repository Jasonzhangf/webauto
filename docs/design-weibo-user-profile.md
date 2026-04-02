# 微博用户主页监控 — 设计文档

> 作者: SystemBot | 日期: 2026-04-02 | 状态: 待确认

---

## 1. 需求概述

在 webauto 现有的微博采集能力（search、timeline、detail）基础上，新增 **用户主页帖子采集** 模式，支持：

- 输入一个或多个微博用户 ID
- 自动打开用户主页
- 滚动翻页采集帖子列表
- 可选：对每条帖子执行 detail 采集（正文+图片+评论）
- 输出结构与现有 collect/detail 一致

### 核心用例

```
webauto weibo unified --task-type user-profile --profile weibo --user-ids 1402400261 --target 50
```

---

## 2. 现有架构分析

### 2.1 文件清单（已有）

| 文件 | 职责 |
|------|------|
| `apps/webauto/entry/weibo-unified.mjs` | 统一入口，支持 timeline/search 任务类型 |
| `apps/webauto/entry/lib/weibo-unified-runner.mjs` | 统一 runner，根据 taskType 分发 |
| `apps/webauto/entry/lib/weibo-collect-runner.mjs` | 搜索采集 runner |
| `apps/webauto/entry/lib/weibo-detail-runner.mjs` | 详情采集 runner |
| `modules/camo-runtime/.../weibo/persistence.mjs` | 输出目录解析、文件写入 |
| `modules/camo-runtime/.../weibo/harvest-ops.mjs` | 详情页采集核心逻辑 |
| `modules/camo-runtime/.../weibo/timeline-ops.mjs` | 时间线导航+滚动+采集 |
| `modules/camo-runtime/.../weibo/detail-flow-ops.mjs` | 详情页打开/关闭 |
| `modules/camo-runtime/.../weibo/comments-ops.mjs` | 评论面板操作 |

### 2.2 已有能力

- **timeline**: 首页 → 滚动 → 提取帖子卡片 → 写 links.jsonl
- **search**: 搜索页 → 翻页 → 提取帖子卡片 → 写 posts.jsonl + links.jsonl
- **detail**: 逐条打开帖子 → 采集正文/图片/评论 → 写入每个 postId 子目录

### 2.3 缺失能力

- 没有用户主页（`weibo.com/u/<uid>`）的导航和滚动逻辑
- unified runner 的 taskType 不支持 `user-profile`

---

## 3. 设计方案

### 3.1 新增文件

| 文件 | 职责 |
|------|------|
| `apps/webauto/entry/lib/weibo-user-profile-runner.mjs` | 用户主页采集 runner |
| `modules/camo-runtime/.../weibo/user-profile-ops.mjs` | 用户主页导航+滚动+提取 |

### 3.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `apps/webauto/entry/lib/weibo-unified-runner.mjs` | 新增 `user-profile` taskType 分支 |
| `apps/webauto/entry/weibo-unified.mjs` | 新增 `--user-ids` 参数定义 |

### 3.3 核心流程

```
用户输入 user-ids
    ↓
遍历每个 userId
    ↓
navigateToUserProfile(profileId, userId)
    → camo navigate → https://weibo.com/u/{userId}
    ↓
scrollUserProfileToBottom(profileId, { target, scrollDelay, maxEmptyScrolls })
    → 循环滚动 + 检测到底
    → 每次滚动后提取帖子卡片
    ↓
extractUserProfilePosts(profileId)
    → DOM 提取帖子链接列表
    → 去重（URL 级别）
    ↓
写入 links.jsonl
    ↓
[可选] 调用现有 runWeiboDetail() 逐条采集详情
    ↓
输出到 weibo/<env>/user-profile:<userId>/
```

### 3.4 DOM 选择器（待验证）

用户主页帖子卡片选择器（基于微博 web 版）：

```
帖子卡片容器: div[class*="vue-recycle-scroller__item-wrapper"] > div[class*="vue-recycle-scroller__item-view"]
帖子链接: a[href*="/status/"] 或 a[href*="weibo.com"][target="_blank"]
帖子正文: div[class*="wbpro-feed-content"] 或 span[class*="detail_wbtext"]
作者名: a[class*="head_name"] 或 a[usercard]
```

> **注意**: 这些选择器需要在实际浏览器中验证确认，作为 Phase 1 调研的一部分。

### 3.5 数据流

```
输入: userId[] + target 数量
  ↓
user-profile-ops.mjs
  → navigateToUserProfile(profileId, userId)
  → scrollUserProfileToBottom({ target, scrollDelay, maxEmptyScrolls })
  → extractUserProfilePosts() → [{ id, url, authorId, authorName, content }]
  ↓
user-profile-runner.mjs
  → 去重合并
  → 写入 links.jsonl / posts.jsonl
  → [可选] 逐条 detail 采集
  ↓
输出目录:
  <output-root>/weibo/<env>/user-profile:<userId>/
  ├── posts.jsonl          # 帖子摘要列表
  ├── links.jsonl          # 帖子链接列表（供 detail 使用）
  ├── collection-meta.json # 采集元数据
  ├── run.log              # 运行日志
  └── <postId>/            # [如果启用 detail]
      ├── content.md
      ├── comments.md
      ├── images/
      ├── links.json
      └── detail-meta.json
```

### 3.6 参数设计

新增参数（在 weibo-unified.mjs 中）：

```javascript
'user-ids': { type: 'string' },  // 逗号分隔的用户 ID 列表
'with-detail': { type: 'string', default: 'false' },  // 是否自动采集详情
```

### 3.7 输出上下文

复用 `resolveWeiboOutputContext` 和 `resolveWeiboDetailOutputContext`，keyword 设为 `user-profile:<userId>`。

### 3.8 到底检测

```javascript
const bottomSelector = 'div[class*="_box_1px0u"]';  // 已有的到底选择器
const bottomText = '没有更多';
```

---

## 4. 验收标准（AC）

| AC# | 标准 | 验证方式 |
|-----|------|----------|
| AC-1 | `weibo-unified --task-type user-profile --user-ids <uid> --target 10` 正常执行 | 命令行运行无报错，输出 JSON `{ ok: true }` |
| AC-2 | 正确导航到用户主页 | camo screenshot 验证 URL 为 `weibo.com/u/<uid>` |
| AC-3 | 滚动采集帖子数量 >= target | 检查 links.jsonl 行数 |
| AC-4 | 到底检测生效 | run.log 中出现 bottom detected 记录 |
| AC-5 | 去重正确 | links.jsonl 中无重复 URL |
| AC-6 | 输出目录结构正确 | 文件存在性检查 |
| AC-7 | `--with-detail true` 时每条帖子有完整详情 | 检查 postId 子目录内容 |
| AC-8 | 50 条压力测试通过 | 单用户 50 条采集成功率 > 90% |

---

## 5. 测试回归流程

### Phase 1: 最小验证（单条）
```bash
WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo unified \
  --task-type user-profile --profile weibo \
  --user-ids 1402400261 --target 1 --env test
```
验证: 导航成功 + 1 条帖子提取

### Phase 2: 多条验证
```bash
WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo unified \
  --task-type user-profile --profile weibo \
  --user-ids 1402400261 --target 10 --env test
```
验证: 10 条帖子 + 到底检测 + links.jsonl 去重

### Phase 3: 含详情验证
```bash
WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo unified \
  --task-type user-profile --profile weibo \
  --user-ids 1402400261 --target 3 --with-detail true --env test
```
验证: 3 条帖子的 content.md + comments.md + images/ 完整

### Phase 4: 压力测试（50 条）
```bash
WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo unified \
  --task-type user-profile --profile weibo \
  --user-ids 1402400261 --target 50 --env test
```
验证: 成功率 > 90%

---

## 6. 风险与边界

- **选择器失效**: 微博前端经常更新，选择器可能需要定期维护
- **反爬策略**: 高频滚动可能触发验证码，建议 interval 2-5s 随机
- **长帖列表**: 某些大 V 有数万条帖子，target 参数必须限制
- **登录状态**: 必须保持 weibo profile 登录状态

---

## 7. 实现优先级

1. **P0**: user-profile-ops.mjs（导航+滚动+提取）— 核心能力
2. **P0**: user-profile-runner.mjs（编排+持久化）— 管道串联
3. **P1**: unified runner 集成 — 任务类型分发
4. **P2**: with-detail 自动详情采集 — 锦上添花
