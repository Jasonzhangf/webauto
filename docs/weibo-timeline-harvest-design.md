# Weibo Timeline Harvest — Detailed Design Document

> Task: 定时刷新微博主页时间线，提取帖子，去重合并到固定目录的合并文件中。
> Author: SystemBot (调研 + 设计)
> Date: 2026-03-30

---

## 1. Requirements

### Core Functionality
- **定时刷新**微博主页（Home Feed / "关注"页）
- **提取**可见帖子（作者、正文、图片/视频 URL、发布时间、帖子链接、来源）
- **去重合并**：每次采集的帖子去重后追加到固定 JSONL 文件
- **合并文件**：所有帖子存储在 `posts.jsonl`，每行一条 JSON 记录
- **定时调度**：通过 webauto schedule 支持 cron-like 定时执行

### Non-Goals
- 不做帖子详情页深度采集（已有 weibo detail 模块）
- 不做评论采集（已有 comments 模块）
- 不做用户个人主页监控（已有 monitor 模块）

---

## 2. DOM Selector Verification (Evidence-Based)

### 2.1 Virtual Scrolling Architecture

微博主页使用 **vue-recycle-scroller** 虚拟滚动：

```
容器: .vue-recycle-scroller__item-view (固定 25 个 DOM 槽位)
  └── .wbpro-scroller-item (实际帖子数据)
        └── div._wrap_xxx (inner wrap, class name 含 hash，不可靠)
              ├── [post card — 详见 2.2]
              └── woo-panel-main (浮动弹窗容器，非帖子数据)
```

**关键发现：虚拟滚动导致 DOM 槽位与数据不一致**
- `.vue-recycle-scroller__item-view` 始终 25 个，style 设为 `translateY(-9999px)` 表示离屏
- 实际可见帖子通过 `.wbpro-scroller-item` 的 `getBoundingClientRect()` 判断是否在视口内
- **不可靠**用 `querySelectorAll(".vue-recycle-scroller__item-view")[i]` 取第 i 条帖子
- **必须**用视口可见性过滤或直接遍历 `.wbpro-scroller-item`

### 2.2 Post Card DOM (Verified 2026-03-30)

```
.wbpro-scroller-item (scroller 内每个帖子)
  └── .wbpro-feed-content (可能 1-2 个，第二个是引用转发的原帖)
        ├── .wbpro-feed-ogText  — 帖子正文（原始帖文字）
        ├── .wbpro-feed-reText  — 转发评论文字（仅转发帖有）
        ├── .wbpro-feed-pic     — 图片容器
        │     └── img           — 图片元素
        ├── video               — 视频元素（仅视频帖）
        ├── a[class*='name']    — 作者名链接
        ├── a[class*='time']    — 发布时间链接（含帖子 URL）
        └── a[class*='from']    — 来源（如 "来自 Xiaomi 17 Pro"）
```

### 2.3 Verified Selectors

| 字段 | Selector | 类型 | 备注 |
|------|----------|------|------|
| 帖子容器 | `.wbpro-scroller-item` | 稳定 | 每个 scroller item 一条帖子 |
| 帖子正文 | `.wbpro-feed-ogText` | 稳定 (wbpro-) | CSS module 前缀稳定 |
| 转发评论 | `.wbpro-feed-reText` | 稳定 | 仅转发帖存在 |
| 图片容器 | `.wbpro-feed-pic` | 稳定 | 内含 `img` 元素 |
| 图片元素 | `.wbpro-feed-pic img` | 稳定 | `src` 为图片 URL |
| 视频元素 | `video` | 标准元素 | 仅视频帖存在 |
| 作者名 | `a[class*='name']` | 部分 hash | class 含 `_name_` 但有 CSS module hash |
| 时间+帖子URL | `a[class*='time']` | 部分 hash | textContent 为 "X分钟前"，href 为帖子 URL |
| 来源 | `a[class*='from']` | 部分 hash | 如 "来自 iPhone 16 Pro" |

### 2.4 Scroll Pagination

- **单次加载**：25 条 `.wbpro-scroller-item`
- **滚动加载**：`window.scrollTo(0, document.body.scrollHeight)` 触发新数据
- **等待策略**：滚动后等待 `.wbpro-scroller-item` 数量增长
- **文档高度增长**：验证记录 scroll 14044 → 27988，docHeight 21743 → 31586（3 次滚动）
- **注意**：scroller 数量始终 25（虚拟滚动复用），但内容已替换，需用帖子 URL 去重判断是否加载了新内容

### 2.5 Dedup Strategy

帖子唯一标识 = 帖子 URL（`https://weibo.com/{userId}/{postId}`）
- 从 `a[class*='time']` 的 `href` 提取
- 格式：`https://weibo.com/1687813073/Qyv4FxJov`
- 去重用 URL 的 path 部分（去掉 query string）

---

## 3. Architecture

### 3.1 Module Mapping (XHS ↔ Weibo)

| XHS Module | Weibo Module | Status |
|------------|-------------|--------|
| `xhs/harvest-ops.mjs` | `weibo/timeline-ops.mjs` | **NEW** |
| `xhs/persistence.mjs` | `weibo/persistence.mjs` | **EXISTING** (extend) |
| `xhs/search-ops.mjs` | `weibo/search-ops.mjs` | **EXISTING** |
| `lib/xhs-unified-runner.mjs` | `lib/weibo-unified-runner.mjs` | **NEW** |
| `xhs-unified.mjs` | `weibo-unified.mjs` | **NEW** (entry) |

### 3.2 New Files

```
~/github/webauto/
├── modules/camo-runtime/src/autoscript/action-providers/weibo/
│   └── timeline-ops.mjs              # NEW: timeline DOM extraction + scroll
├── apps/webauto/entry/
│   ├── weibo-unified.mjs             # NEW: entry point (mirrors xhs-unified.mjs)
│   └── lib/
│       └── weibo-unified-runner.mjs  # NEW: unified runner for timeline/search/monitor
```

### 3.3 Modified Files

```
~/github/webauto/
├── modules/camo-runtime/src/autoscript/action-providers/weibo/
│   └── persistence.mjs               # EXTEND: add resolveTimelineOutputContext()
├── apps/webauto/entry/
│   └── schedule.mjs                  # EXTEND: add weibo-timeline command routing
```

### 3.4 Output Path Convention

遵循现有 weibo persistence 规范：

```
~/.webauto/download/weibo/<env>/timeline:<date>/
├── collection-meta.json    # 元数据
├── posts.jsonl             # 去重后的帖子（追加写入）
├── links.jsonl             # 帖子链接
└── run.log                 # 执行日志
```

- `<env>`: 默认 `prod`
- `<date>`: 采集日期，格式 `YYYY-MM-DD`（如 `timeline:2026-03-30`）
- 每次定时运行追加新帖子到 `posts.jsonl`，不覆盖
- 同一天的多次采集共享同一个 `timeline:<date>` 目录

---

## 4. Detailed Design

### 4.1 `timeline-ops.mjs`

```javascript
// === timeline-ops.mjs ===
// 职责: 微博主页时间线 DOM 提取 + 滚动分页

/**
 * 从当前可见的 scroller items 中提取帖子
 * @param {object} opts
 * @param {number} opts.maxPosts - 最大采集数量 (default: 50)
 * @returns {Promise<{posts: Array<Post>, scrolled: number}>}
 */
export async function harvestTimeline({ maxPosts = 50 } = {}) { ... }

/**
 * 提取单个 .wbpro-scroller-item 的帖子数据
 * @param {Element} scrollerItem
 * @returns {Post|null}
 */
export function extractPostFromScrollerItem(scrollerItem) { ... }

/**
 * 滚动到底部加载更多内容
 * @returns {Promise<number>} 新增帖子数量
 */
export async function scrollForMore() { ... }

/**
 * 检查是否已到达时间线底部（无新内容加载）
 * @returns {boolean}
 */
export function hasReachedEnd() { ... }
```

#### Post Data Structure

```typescript
interface TimelinePost {
  id: string;            // 从 URL path 提取: "Qyv4FxJov"
  url: string;           // 完整 URL: "https://weibo.com/1687813073/Qyv4FxJov"
  author: string;        // 作者名
  authorId: string;      // 从 author href 提取
  authorUrl: string;     // 作者主页 URL
  ogText: string;        // 帖子正文
  reText: string|null;   // 转发评论 (仅转发帖)
  images: string[];      // 图片 URL 列表
  hasVideo: boolean;     // 是否含视频
  timeText: string;      // "X分钟前" 等相对时间
  from: string|null;     // 来源设备
  collectedAt: string;   // ISO8601 采集时间
}
```

#### DOM Extraction JS (for devtools eval)

```javascript
const EXTRACT_POST_JS = `(() => {
  const items = document.querySelectorAll('.wbpro-scroller-item');
  const posts = [];
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) continue; // skip off-screen
    const author = item.querySelector("a[class*='name']");
    const timeLink = item.querySelector("a[class*='time']");
    const ogText = item.querySelector(".wbpro-feed-ogText");
    const reText = item.querySelector(".wbpro-feed-reText");
    const pics = item.querySelectorAll(".wbpro-feed-pic img");
    const video = item.querySelector("video");
    const from = item.querySelector("a[class*='from']");
    const url = timeLink ? timeLink.href.split('?')[0] : null;
    if (!url) continue;
    posts.push({
      id: url.split('/').pop(),
      url,
      author: author ? author.textContent.trim() : null,
      authorUrl: author ? author.href : null,
      ogText: ogText ? ogText.textContent.trim() : null,
      reText: reText ? reText.textContent.trim() : null,
      images: Array.from(pics).map(img => img.src).filter(Boolean),
      hasVideo: !!video,
      timeText: timeLink ? timeLink.textContent.trim() : null,
      from: from ? from.textContent.trim() : null
    });
  }
  return JSON.stringify({ posts, count: posts.length });
})()`;
```

#### Scroll Strategy

```
1. 记录当前 posts set (URL 去重)
2. window.scrollTo(0, document.body.scrollHeight)
3. 等待 2-3 秒 (锚点: wbpro-scroller-item 数量变化或新 URL 出现)
4. 提取新帖子，与已有 set 对比
5. 如果有新帖子 → 继续滚动
6. 如果连续 2 次滚动无新帖子 → 停止
7. 达到 maxPosts → 停止
```

### 4.2 `persistence.mjs` Extension

新增 `resolveTimelineOutputContext()`:

```javascript
export function resolveTimelineOutputContext({ params = {}, state = {} } = {}) {
  const dateRaw = String(params.date || state.date || new Date().toISOString().slice(0, 10)).trim();
  const envRaw = String(params.env || state.env || 'prod').trim();
  const root = resolveDownloadRoot(
    params.outputRoot || params.downloadRoot || params.rootDir
    || state.outputRoot || state.downloadRoot || state.rootDir,
  );
  const date = sanitizeForPath(dateRaw, 'unknown');
  const env = sanitizeForPath(envRaw, 'prod');
  const collectionDir = path.join(root, 'weibo', env, `timeline:${date}`);
  return {
    root,
    env,
    date,
    collectionDir,
    postsPath: path.join(collectionDir, 'posts.jsonl'),
    linksPath: path.join(collectionDir, 'links.jsonl'),
    metaPath: path.join(collectionDir, 'collection-meta.json'),
    logPath: path.join(collectionDir, 'run.log'),
  };
}
```

### 4.3 `weibo-unified-runner.mjs`

```javascript
// 镜像 xhs-unified-runner.mjs 结构
// 支持 task-type: timeline | search | monitor

export async function runUnified(argv) {
  const taskType = argv['task-type'] || argv.taskType || 'timeline';
  switch (taskType) {
    case 'timeline':
      return runTimeline(argv);
    case 'search':
      return runSearch(argv);
    case 'monitor':
      return runMonitor(argv);
    default:
      throw new Error(`Unknown task-type: ${taskType}`);
  }
}

async function runTimeline(argv) {
  const profile = argv.profile || 'weibo';
  const maxPosts = parseInt(argv.target || argv.max || '50', 10);
  const ctx = resolveTimelineOutputContext({ params: argv });
  
  // 1. 导航到微博主页
  // 2. 循环: 提取 + 滚动 (timeline-ops)
  // 3. 去重合并 (mergeWeiboPosts)
  // 4. 写 links + meta
  // 5. 返回统计
}
```

### 4.4 `weibo-unified.mjs` (Entry)

```javascript
// 镜像 xhs-unified.mjs
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { printUnifiedHelp, runUnified } from './lib/weibo-unified-runner.mjs';

export { runUnified } from './lib/weibo-unified-runner.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printUnifiedHelp();
    return;
  }
  await runUnified(argv);
}
```

### 4.5 Schedule Integration

`schedule.mjs` 已有 `weibo-*` 路由（line 279-284），无需修改路由逻辑。
��认 `weibo` command-type 路由到 `weibo-unified.mjs`，task-type 默认 `timeline`。

调度命令示例：
```bash
webauto schedule add \
  --command-type weibo-timeline \
  --profile weibo \
  --target 100 \
  --cron '0 */4 * * *'
```

---

## 5. Configuration Parameters

| Parameter | CLI Flag | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| task-type | `--task-type` | string | `timeline` | 任务类型 |
| profile | `--profile` | string | `weibo` | Camoufox profile ID |
| target | `--target` | number | `50` | 最大采集帖子数 |
| env | `--env` | string | `prod` | 环境标识 |
| date | `--date` | string | today | 采集日期 |
| outputRoot | `--output-root` | string | `~/.webauto/download` | 输出根目录 |
| scrollDelay | `--scroll-delay` | number | `2500` | 滚动间隔 ms |
| maxEmptyScrolls | `--max-empty-scrolls` | number | `2` | 连续空滚动停止阈值 |

---

## 6. Error Handling

| 场景 | 处理方式 |
|------|----------|
| 微博未登录 | 检测 title 非 "微博"，报错退出 |
| 网络中断 | scroll 后无新内容，maxEmptyScrolls 触发停止 |
| DOM 变更 | ogText/timeLink 为空时跳过该帖子，记 warn log |
| 文件写入失败 | try/catch + 重试 1 次 |
| 进程中断 | 已写入的 posts.jsonl 保持完整（行级追加） |

---

## 7. Acceptance Criteria

- [ ] **AC-1**: `weibo-unified.mjs` 入口文件可被 schedule.mjs 正确 import
- [ ] **AC-2**: `timeline-ops.mjs` 可从微博主页提取帖子，包含 author/ogText/url/images/timeText
- [ ] **AC-3**: 滚动加载可正常分页，每次滚动获取新帖子
- [ ] **AC-4**: 去重逻辑正确：相同 URL 的帖子不重复写入 posts.jsonl
- [ ] **AC-5**: 输出路径符合 `~/.webauto/download/weibo/<env>/timeline:<date>/posts.jsonl`
- [ ] **AC-6**: 单次采集 50 条帖子，成功率 ≥ 90%
- [ ] **AC-7**: 所有新增文件通过 `node --check` 语法检查
- [ ] **AC-8**: 现有 weibo search/collect 功能不受影响

---

## 8. Test Verification Flow

1. `node --check` 所有新增/修改文件
2. 单帖提取验证：`camo devtools eval weibo` 运行提取脚本，确认 1 条帖子字段完整
3. 多帖提取验证：滚动 2 次后提取，确认 ≥ 30 条帖子
4. 去重验证：同一页面提取 2 次，确认 posts.jsonl 条目数 = 去重后的唯一帖子数
5. 完整流程：`node weibo-unified.mjs --target 50` 执行完整采集
6. 回归验证：确认 `webauto schedule list` 可正常列出 weibo 任务
