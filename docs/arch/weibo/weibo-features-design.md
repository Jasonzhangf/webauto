# 微博功能补齐设计文档

## 1. 勘验结果汇总

### 1.1 微博热搜榜 (Weibo Hot Search) ✅ 可复用
**URL**: `https://s.weibo.com/top/summary`
**结构**:
- 表格结构：`<table>` 包含 52 行 (`<tr>`)
- 每行 3 列：`<td>` (排名) + `<td>` (标题链接) + `<td>` (热度标签：热/新/沸)
- 链接格式：`https://s.weibo.com/weibo?q=...&Refer=top`

**选择器**:
```javascript
const rows = document.querySelectorAll('table tr');
rows.forEach(row => {
  const cells = row.querySelectorAll('td');
  const rank = cells[0]?.textContent.trim();  // "1", "2", etc.
  const title = cells[1]?.querySelector('a')?.textContent.trim();
  const href = cells[1]?.querySelector('a')?.href;
  const tag = cells[2]?.textContent.trim();  // "热", "新", "沸", ""
});
```

### 1.2 特别关注列表 (Special Follow) ⚠️ 需验证
**URL**: `https://weibo.com/u/page/follow/{uid}?relate=fans`
**问题**: 需要先从当前用户主页获取 UID，然后跳转到关注列表页。

**发现**:
- 主页链接中包含 `follow` 入口
- 需先登录才能访问关注列表

### 1.3 User Profile 下载 ✅ 已有
- `weibo-user-profile-runner.mjs` 已存在
- 支持 `--user-ids` 参数

### 1.4 Detail 评论展开 ⚠️ 需增强
**当前问题**: 微博评论区有"展开"按钮，但现有代码未处理深层盖楼评论。

## 2. 功能补齐清单

| 功能 | 状态 | 负责人 | 预计完成 |
|------|------|--------|----------|
| 2.1 微博热搜 Producer | ⏳ 待开发 | Agent | 本次迭代 |
| 2.2 特别关注监控 Producer | ⏳ 待开发 | Agent | 本次迭代 |
| 2.3 评论展开增强 | ⏳ 待开发 | Agent | 本次迭代 |
| 2.4 评论覆盖率验证 | ⏳ 待开发 | Agent | 本次迭代 |

## 3. 实现方案

### 3.1 微博热搜 Producer
**文件**: `modules/camo-runtime/src/autoscript/action-providers/weibo/weibo-hot-search.mjs` (新建)

**逻辑**:
1. `goto` 到 `https://s.weibo.com/top/summary`
2. 提取表格数据 (rank, title, href, tag)
3. 返回热搜关键词列表

### 3.2 特别关注监控 Producer
**文件**: `modules/camo-runtime/src/autoscript/action-providers/weibo/follow-monitor.mjs` (新建)

**逻辑**:
1. 读取配置的特别关注 UID 列表
2. 遍历每个 UID 的主页
3. 提取最新帖子链接
4. 入队到 `~/.webauto/download/weibo/always-on/links.jsonl`

### 3.3 评论展开增强
**文件**: `modules/camo-runtime/src/autoscript/action-providers/weibo/comments-ops.mjs` (修改)

**新增**:
- `expandReplyThreads()` 函数
- 循环点击"展开"按钮
- 深层评论提取 (盖楼)

### 3.4 评论覆盖率验证
**文件**: `apps/webauto/entry/lib/weibo-consumer-runner.mjs` (修改)

**新增**:
- 验证 `collectedComments >= expectedCount * 0.9`
- 记录 `coverageRate` 到日志

## 4. 开发流程

1. **手动 camo 验证** (已完成热搜勘验)
2. **编写 Container 层模块** (weibo-hot-search.mjs 等)
3. **集成到 Producer/Consumer Runner**
4. **单功能 E2E 测试**
5. **Always-On 全链路测试**

## 5. 验收标准

| 功能 | 验收标准 |
|------|----------|
| 热搜 Producer | 成功提取 50 条热搜，入队成功 |
| 特别关注监控 | 成功提取 10 个关注用户的最新微博 |
| 评论展开 | 盖楼评论展开率 ≥ 90% |
| 覆盖率验证 | 日志输出 `coverage=95%` |
