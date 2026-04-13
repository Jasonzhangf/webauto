# webauto 项目记忆

项目创建时间: 2026-04-02T11:07:41.172Z
项目路径: /Users/fanzhang/github/webauto

Tags: project

---

## Control Hook Memory Patch
- idempotency_key: session-1774930001275-q6abwu|turn-1775130614901|hook.project.memory.update
- updated_at: 2026-04-02T11:50:15.054Z
- source_session: session-1774930001275-q6abwu
- source_turn: turn-1775130614901
- long_term: mailbox notify CLI works reliably for cross-agent messaging.

## Control Hook Memory Patch
- idempotency_key: session-1774930001275-q6abwu|turn-1775130691236|hook.project.memory.update
- updated_at: 2026-04-02T11:51:31.481Z
- source_session: session-1774930001275-q6abwu
- source_turn: turn-1775130691236
- long_term: mailbox CLI E2E ping works; target busy → message preserved in queue

## Control Hook Memory Patch
- idempotency_key: session-1775570486648-weibo-risk-control
- updated_at: 2026-04-07T14:30:00+08:00
- source_session: session-1775570486648-weibo
- long_term: |
  ### 微博风控硬规则（强制）
  
  **触发场景**: 微博网站自动化操作
  
  **强禁止操作**:
  1. ❌ 禁止用脚本/自动化"试探"页面寻找元素（频繁 click/goto/devtools 尝试不同 selector）
  2. ❌ 禁止在未发现目标元素时反复执行 click 操作
  3. ❌ 禁止用自动化操作"摸索"页面结构
  
  **正确做法**:
  1. ✅ 用户手动导航到目标页面 → 脚本只负责数据提取（devtools eval）
  2. ✅ 先用 devtools eval 探索页面结构 → 确定 selector → 单次精准 click
  3. ✅ 需要探索时：先截图 → 用户确认 → 再操作
  
  **风控信号**:
  - 登录页面打开后立即关闭
  - click 操作超时 30s
  - 页面重定向到登录页
  
  **Profile 使用规则**:
  - 微博操作只使用 xhs-qa-1 profile
  - 禁止使用 weibo-main profile
  
  **原则**: 脚本是"数据提取工具"，不是"页面探索工具"。探索工作由用户手动完成，脚本只负责在已知页面提取数据。

## 微博特别关注新帖监控功能 (2026-04-08)

### 功能概述
实现了微博"特别关注"分组用户的新帖监控功能：
- 动态发现特别关注分组 URL
- 提取用户列表并持久化
- 定时巡检用户主页新帖
- 数据持久化到 `~/.webauto/weibo-special-follow/prod/`

### 核心文件
- `modules/camo-runtime/src/autoscript/action-providers/weibo/selectors.mjs`
- `modules/camo-runtime/src/autoscript/action-providers/weibo/discover-special-follow.mjs`
- `modules/camo-runtime/src/autoscript/action-providers/weibo/extract-user-list.mjs`
- `modules/camo-runtime/src/autoscript/action-providers/weibo/detect-new-posts.mjs`
- `apps/webauto/entry/lib/weibo-special-follow-monitor-runner.mjs`
- `apps/webauto/entry/weibo-special-follow.mjs`

### CLI 命令
```bash
node apps/webauto/entry/weibo-special-follow.mjs status --profile xhs-qa-1
node apps/webauto/entry/weibo-special-follow.mjs update-user-list --profile xhs-qa-1
node apps/webauto/entry/weibo-special-follow.mjs inspect --profile xhs-qa-1
node apps/webauto/entry/weibo-special-follow.mjs start --profile xhs-qa-1 --interval 600000
```

### 关键发现
1. **微博分组导航**: 使用 `/mygroups?gid={gid}` 格式而非 `followGroup?tabid=`
2. **虚拟列表**: 用户列表使用 `.vue-recycle-scroller__item-view`
3. **微博链接格式**: `https://weibo.com/{uid}/{shortId}` (如 `QziBc5xN0`)
4. **帖子过滤**: 必须用 `isOwnPost` 过滤，只提取目标用户原创帖（排除转发帖）
5. **隐私用户**: 某些用户主页无 `article` 元素（隐私设置或无近期原创）

### 风控硬规则（强制）
- ❌ 禁止脚本试探寻找元素（高频自动化操作触发风控）
- ✅ 用户手动导航 → 脚本只提取数据
- ✅ 先截图确认 → 单次精准 click
- ✅ 巡检间隔至少 5 秒（`delayMs` 参数）

### 数据文件
- `users.json`: 特别关注用户列表
- `post-state.json`: 每个用户的最新 weiboId
- `new-posts.jsonl`: 发现的新帖记录（append-only）

### 自动同步功能 (2026-04-08)

**sync 命令**：用户手动导航到关注列表页 → 脚本提取特别关注用户列表 → 更新 users.json

**流程**：
1. 用户用 camo goto 导航到 `/u/page/follow/{uid}` 或 `mygroups` 页面
2. 运行 `sync --profile xhs-qa-1`
3. 脚本检测"特别关注" H3 标题，向上遍历父元素提取用户 UID

**关键修复**：模板字符串中的正则 `//u/(d+)/` 必须正确转义，使用 `JSON.stringify()` 生成脚本字符串。

### 设计文档

`docs/arch/weibo/weibo-special-follow-monitor-design.md` 包含完整的功能设计、CLI 命令、数据结构、风控规则。



### 2026-04-08: 微博特别关注监控功能验证完成

**功能状态**: ✅ 全部验证通过

**关键修复**:
- 用户名提取：从 `_cla` 区域下的空 class span 提取，不再包含帖子内容
- 页面类型支持：分组详情页（`followGroup?tabid=`）+ 关注列表页（`/page/follow`）

**数据验证**:
- `users.json`: 9 个用户完整，名称正确
- `post-state.json`: 7 个用户最新 weiboId（2 个用户主页无 article）
- `new-posts.jsonl`: 11 条新帖记录

**发现**:
- 分组详情页虚拟列表一次性加载全部用户，无需滚动
- `_cla` 区域包含用户名（空 class span），`_clb` 区域包含用户标签

---

### 2026-04-08: 微博特别关注监控功能完整验证

**验证状态**: ✅ 全部通过

**最终数据**:
- `users.json`: 9 个用户，名称正确提取
- `post-state.json`: 7 个用户最新 weiboId（2 个用户无原创帖）
- `updatedAt`: 2026-04-08T15:34:40.632Z

**CLI 命令验证**:
```bash
node apps/webauto/entry/weibo-special-follow.mjs sync --profile xhs-qa-1    # ✅
node apps/webauto/entry/weibo-special-follow.mjs inspect --profile xhs-qa-1  # ✅
node apps/webauto/entry/weibo-special-follow.mjs start --profile xhs-qa-1 --interval 300000  # ✅
```

**业务逻辑验证**:
- 只记录原创帖（转发帖不记录）
- 部分用户无原创内容时跳过（香港若燕、张牙舞爪的猪）
- 延迟保护生效（3s 间隔）

---
