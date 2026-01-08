# 小红书采集 Workflow 可靠性设计

## 目标

- **持久性任务状态保存**：进程崩溃/中断后可恢复
- **去重执行**：避免重复采集/重复写入
- **阶段回环**：每个阶段必须进入锚点并在结束时离开锚点
- **错误恢复**：失败后回到主页面/搜索页，恢复到安全起点继续执行
- **行为安全**：所有操作均在视口内、模拟用户行为

---

## 总体流程

```
Phase1: Session + Login
   ↓
Phase2: Search (SearchGate permit)
   ↓
Phase3: Detail (modal open → extract → close)
   ↓
Phase4: Comments (warmup → expand → close)
   ↓
Persist + Deduplicate + Resume
```

---

## 核心机制

### 1. 持久性任务状态保存

**状态文件路径**：
```
<repo>/xiaohongshu_data/.progress_<sessionId>.json
```

**状态结构**：
```json
{
  "version": 1,
  "sessionId": "xiaohongshu_fresh",
  "updatedAt": "2025-01-06T15:00:00.000Z",
  "keywordIndex": 2,
  "searchRound": 5,
  "collectedCount": 37,
  "seenNoteIds": ["<noteId1>", "<noteId2>"]
}
```

**保存时机**：
- 每采集 **N 条**（建议 N=5）保存一次
- 每完成一个 keyword 搜索后保存一次
- 发生异常前写入当前阶段状态

**恢复策略**：
- 读取 `.progress_<sessionId>.json`
- 恢复 `keywordIndex / searchRound / seenNoteIds`
- 跳过已采集 noteId

---

### 2. 去重执行

**去重依据**：
- noteId（从 URL 或 detail container 中提取）

**规则**：
- 采集前：若 noteId 已存在 → 直接跳过
- 写入前：再次检查 seenNoteIds，确保幂等

---

### 3. 阶段进入/离开锚点

每个阶段必须有明确的 **进入锚点** 和 **离开锚点**。

| 阶段 | 进入锚点 | 离开锚点 | 说明 |
|------|----------|----------|------|
| Phase2 Search | `xiaohongshu_search.search_bar` | `xiaohongshu_search.search_result_list` | 搜索框输入 → 搜索结果容器出现 |
| Phase3 Detail | `xiaohongshu_detail.modal_shell` | `xiaohongshu_search.search_result_list` | 详情 modal 打开 → 关闭回列表 |
| Phase4 Comments | `xiaohongshu_detail.comment_section` | `xiaohongshu_detail.modal_shell` | 评论区域出现 → 仍保持在详情页 |

**进入锚点验证**：
```ts
// 必须满足：容器存在 + rect 可见
verifyAnchor(containerId)
```

**离开锚点验证**：
```ts
// 必须满足：目标锚点出现，前一锚点消失或不可见
verifyExit(prevAnchorId, nextAnchorId)
```

---

### 4. 错误恢复机制

**目标**：发生错误时恢复到可控起点（主页面或搜索页）

#### 4.1 恢复策略

| 错误类型 | 恢复策略 |
|----------|----------|
| SearchGate 超时 | 等待窗口 + 重试搜索 |
| Search 失败 | 回到首页 → 重新进入搜索 |
| Detail 失败 | 关闭 modal → 回搜索列表 |
| Comment 失败 | 保持详情页 → 跳过评论 |
| Session 失效 | 调用 Phase1 登录恢复 |

#### 4.2 恢复流程示例

```ts
try {
  await openDetail(...);
  await extractDetail(...);
} catch (err) {
  // 1. 尝试关闭 modal
  await closeDetail(...).catch(() => ({}));

  // 2. 验证回到搜索列表
  const ok = await verifyAnchor('xiaohongshu_search.search_result_list');
  if (!ok) {
    // 3. 回首页重新进入搜索
    await navigateHome();
  }
}
```

---

### 5. 视口安全约束

所有操作必须满足：
- `rect.y < window.innerHeight`
- `rect.width > 0 && rect.height > 0`
- 仅操作可见元素

详见：`docs/arch/VIEWPORT_SAFETY.md`

---

## 关键执行策略

### 1. Phase1 只执行一次
- 登录成功后 **不重复执行 Phase1**
- 采集脚本仅做 **ensureLogin + verify**
- 若登录异常 → 引导人工运行 Phase1

### 2. SearchGate 强制节流
- 每次搜索必须先 `WaitSearchPermitBlock`
- SearchGate 不可用时 **暂停搜索**

### 3. 失败后回到主页面
- 任何阶段失败 → 统一恢复到搜索页或主页
- 禁止继续在异常状态下执行

---

## 推荐实现（伪代码）

```ts
const progress = new ProgressTracker(dataDir, sessionId);
const state = await progress.load();

if (state) restore(state);

for (keyword of keywords) {
  await ensureSearchPermit();
  await goToSearch(keyword);

  const list = await collectSearchList();
  for (item of list) {
    if (seenNoteIds.has(item.noteId)) continue;

    try {
      await openDetail(item.containerId);
      await extractDetail();
      await warmupComments();
      await expandComments();
    } catch (err) {
      await recoverToSearch();
      continue;
    } finally {
      await closeDetail();
    }

    saveProgress();
  }
}
```

---

## 验证清单

- [ ] 断点续采可恢复
- [ ] 采集过程无重复 noteId
- [ ] 每阶段进入/离开锚点均验证成功
- [ ] 失败后能回到搜索页
- [ ] SearchGate 节流正常
- [ ] 操作均在视口内

---

## 文件清单

- `scripts/xiaohongshu/tests/collect-100-workflow-v2.mjs`
- `modules/workflow/blocks/WaitSearchPermitBlock.ts`
- `modules/workflow/blocks/GoToSearchBlock.ts`
- `modules/workflow/blocks/OpenDetailBlock.ts`
- `modules/workflow/blocks/ExtractDetailBlock.ts`
- `modules/workflow/blocks/ExpandCommentsBlock.ts`
- `modules/workflow/blocks/CloseDetailBlock.ts`
- `docs/arch/VIEWPORT_SAFETY.md`

---

**版本**：v1.0
