# 小红书脚本工作流说明

## 概述

小红书采集系统提供两套独立的工作流：

1. **搜索采集工作流（collect-content.mjs）**：搜索关键字 → 采集链接 → 采集详情与评论
2. **点赞工作流（like-comments.mjs）**：基于已采集链接 → 筛选评论 → 点赞

---

## 工作流 1：搜索采集（collect-content.mjs）

### 功能

完整采集指定关键字的帖子详情与评论内容。

### 流程

```
┌─────────────────┐
│  Phase 1: Boot  │  启动浏览器会话（xiaohongshu_fresh）
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Phase 2: Collect│  搜索关键字 + 采集安全链接（含 xsec_token）
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Phase 4: Harvest│  详情采集 + 评论采集 + 图片下载
└─────────────────┘
```

### 用法

```bash
# 完整采集（单 profile）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50 --env debug --profile xiaohongshu_fresh

# 完整采集（profilepool，Phase2 自动取第一个）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50 --env debug --profilepool xiaohongshu_batch

# 完整采集（手动 profiles 分片，Phase2 自动取第一个）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50 --env debug --profiles xiaohongshu_batch-1,xiaohongshu_batch-2

# 跳过 Phase 1（假设浏览器已启动）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机壳" --target 100 --skip-phase1 --profile xiaohongshu_fresh

# 跳过 Phase 2（假设链接已采集）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --skip-phase2 --profile xiaohongshu_fresh
```

### 输出

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
├── phase2-links.jsonl          # 采集的链接列表
├── {noteId_1}/
│   ├── README.md               # 详情内容（标题、正文、作者）
│   ├── images/                 # 图片文件
│   │   ├── 0.jpg
│   │   └── 1.jpg
│   └── comments.md             # 评论列表
├── {noteId_2}/
│   └── ...
└── run.log                     # 运行日志
```

---

## 工作流 2：点赞（like-comments.mjs）

### 功能

基于已采集的链接，筛选包含指定关键字的评论并点赞。

### 前置条件

**必须先运行搜索采集工作流**，确保存在 `~/.webauto/download/xiaohongshu/{env}/{keyword}/phase2-links.jsonl`

### 流程

```
┌─────────────────┐
│  Phase 1: Boot  │  启动浏览器会话（xiaohongshu_fresh）
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Phase 3: Interact│  轮转 5 Tab → 筛选评论 → 点赞
└─────────────────┘
```

### 用法

```bash
# 完整点赞流程
node scripts/xiaohongshu/like-comments.mjs \
  --keyword "手机膜" \
  --like-keywords "好评,推荐,质量好" \
  --env debug

# 跳过 Phase 1（假设浏览器已启动）
node scripts/xiaohongshu/like-comments.mjs \
  --keyword "手机膜" \
  --like-keywords "好评" \
  --skip-phase1
```

### 点赞策略

- **5 Tab 轮转**：打开 5 个浏览器 Tab，循环处理
- **每轮点赞 2 条**：每个 Tab 在当前帖子中点赞 2 条关键字评论后切换
- **关键字匹配**：评论内容包含任一指定关键字（如 "好评" 或 "推荐"）
- **已赞检测**：跳过已赞评论（检查 `.like-wrapper` 是否包含 `like-active` class）
- **视口约束**：只点赞当前视口可见的评论，滚动后重新匹配
- **系统级操作**：使用容器 click 操作，内部通过系统坐标点击，避免风控

### 输出

- 控制台日志：实时显示点赞进度
- 事件日志：`~/.webauto/download/xiaohongshu/{env}/{keyword}/run-events.jsonl`

---

## 独立 Phase 脚本

除了统一工作流，也可以单独运行各个 Phase：

| Phase | 脚本 | 功能 | 用法 |
|-------|------|------|------|
| Phase 1 | `phase1-boot.mjs` | 启动浏览器会话 + 登录检测 | `node scripts/xiaohongshu/phase1-boot.mjs` |
| Phase 2 | `phase2-collect.mjs` | 搜索 + 链接采集 | `node scripts/xiaohongshu/phase2-collect.mjs --keyword "手机膜" --target 50` |
| Phase 3 | `phase3-interact.mjs` | 评论点赞 | `node scripts/xiaohongshu/phase3-interact.mjs --keyword "手机膜" --like-keywords "好评"` |
| Phase 4 | `phase4-harvest.mjs` | 详情 + 评论采集 | `node scripts/xiaohongshu/phase4-harvest.mjs --keyword "手机膜"` |

---

## 使用场景

### 场景 1：完整内容采集

**目标**：采集某关键字的帖子详情和评论

```bash
# 一键完成
node scripts/xiaohongshu/collect-content.mjs --keyword "手机壳" --target 100 --env prod
```

### 场景 2：仅点赞已采集的帖子

**目标**：对已采集的帖子进行评论点赞（不重新采集内容）

```bash
# 前提：已运行过 collect-content.mjs 或 phase2-collect.mjs
node scripts/xiaohongshu/like-comments.mjs --keyword "手机壳" --like-keywords "好评,推荐" --env prod
```

### 场景 3：分步执行

**目标**：灵活控制每个阶段

```bash
# Step 1: 启动浏览器
node scripts/xiaohongshu/phase1-boot.mjs

# Step 2: 采集链接
node scripts/xiaohongshu/phase2-collect.mjs --keyword "手机膜" --target 50

# Step 3A: 点赞评论
node scripts/xiaohongshu/phase3-interact.mjs --keyword "手机膜" --like-keywords "好评"

# Step 3B: 采集详情（可选，与 3A 独立）
node scripts/xiaohongshu/phase4-harvest.mjs --keyword "手机膜"
```

---

## 常见问题

### Q1: 两个工作流可以同时运行吗？

**不可以**。两个工作流都依赖同一个浏览器会话（`xiaohongshu_fresh`），同时运行会产生冲突。必须顺序执行。

### Q2: 点赞工作流依赖哪些前置数据？

必须存在 `~/.webauto/download/xiaohongshu/{env}/{keyword}/phase2-links.jsonl`，该文件由 Phase 2 或搜索采集工作流生成。

### Q3: 如何避免重复点赞？

Phase 3 会自动检测评论的 `like-active` class，跳过已赞评论。

### Q4: 点赞失败如何排查？

1. 检查是否在视口内（Phase 3 只点赞可见评论）
2. 查看日志中的 `like-wrapper` class 状态
3. 确认容器定义正确（`container-library/xiaohongshu/detail/comment_section/comment_item/container.json`）

### Q5: 如何修改并发 Tab 数量？

编辑 `phase3-interact.mjs` 中的 `tabCount` 变量（默认 5）。

---

## 技术架构

### 模块依赖

```
搜索采集工作流:
  collect-content.mjs
    ├── phase1-boot.mjs
    ├── phase2-collect.mjs
    │   └── Phase2SearchBlock + Phase2CollectLinksBlock
    └── phase4-harvest.mjs
        └── Phase34ValidateLinksBlock + Phase34ProcessSingleNoteBlock

点赞工作流:
  like-comments.mjs
    ├── phase1-boot.mjs
    └── phase3-interact.mjs
        └── Phase3InteractBlock + Phase34OpenTabsBlock + Phase34CloseTabsBlock
```

### 容器依赖

- **Phase 2**: `xiaohongshu_search.search_result_item`
- **Phase 3**: `xiaohongshu_detail.comment_section.comment_item` (含 click 操作)
- **Phase 4**: `xiaohongshu_detail.content_anchor`, `xiaohongshu_detail.comment_section.comment_item`

---

## 变更日志

### 2025-01-29
- ✅ 创建 `collect-content.mjs` 统一搜索采集工作流
- ✅ 创建 `like-comments.mjs` 统一点赞工作流
- ✅ 重命名 `phase1-start.mjs` → `phase1-boot.mjs`
- ✅ 重命名 `phase3-4-collect.mjs` → `phase4-harvest.mjs`
- ✅ 新增 `phase3-interact.mjs` 点赞脚本
- ✅ 扩展 `comment_item` 容器，添加 `like_status` 提取器和 `click` 操作

---

## 参考文档

- [../../../modules/xiaohongshu/app/README.md](../../../modules/xiaohongshu/app/README.md) - Phase Block 详细设计
- [../../../container-library/xiaohongshu/README.md](../../../container-library/xiaohongshu/README.md) - 容器定义
- [../../../AGENTS.md](../../../AGENTS.md) - 系统级操作规则
