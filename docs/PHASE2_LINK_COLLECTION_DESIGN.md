# Phase 2 链接采集设计文档

## 背景

小红书帖子链接存在**安全token机制**，直接使用 `href` 属性中的链接会触发风控或 404。

## 核心问题

### 问题 1: href 链接不可用

**错误做法**：
```javascript
const noteId = element.getAttribute('data-note-id');
const href = element.getAttribute('href'); // /explore/abc123
const url = `https://www.xiaohongshu.com${href}`; // ❌ 无 xsec_token
```

**后果**：
- 访问该链接会返回 404 或触发验证码
- 无法进行后续的详情采集

### 问题 2: 推荐流污染

在搜索结果页滚动过程中，可能混入推荐流中的帖子（不属于搜索结果）。

**风险**：
- 采集到与关键词无关的内容
- 数据质量下降

## 解决方案

### 方案：点击获取真实链接 + 搜索URL校验

#### 步骤 1: 记录搜索 URL

在开始采集前，保存当前搜索结果页的 URL：

```javascript
const searchUrl = await controllerAction('browser:execute', {
  profile: PROFILE,
  script: 'window.location.href'
});
// searchUrl 示例: https://www.xiaohongshu.com/search_result?keyword=华为&source=...
```

#### 步骤 2: 逐个点击帖子

通过容器操作点击搜索结果卡片：

```javascript
// 获取搜索结果列表
const items = await controllerAction('containers:inspect-container', {
  containerId: 'xiaohongshu_search.search_result_list',
  sessionId: PROFILE
});

const collectedLinks = [];

for (const item of items) {
  // 记录点击前的 URL（应该是搜索结果页）
  const beforeClickUrl = await getCurrentUrl();
  
  // 点击帖子卡片
  await controllerAction('container:operation', {
    containerId: item.id, // 具体帖子容器 ID
    operationId: 'click',
    sessionId: PROFILE
  });
  
  // 等待导航完成
  await delay(2000);
  
  // 获取详情页 URL（包含 xsec_token）
  const detailUrl = await getCurrentUrl();
  
  // 提取 note_id
  const noteId = extractNoteIdFromUrl(detailUrl);
  
  // 保存链接及其来源
  collectedLinks.push({
    noteId,
    detailUrl,      // 带 xsec_token 的安全链接
    searchUrl: beforeClickUrl // 点击前的搜索页 URL
  });
  
  // 返回搜索结果页（通过浏览器后退或点击返回按钮）
  await goBackToSearch();
}
```

#### 步骤 3: 校验搜索 URL

采集完成后，校验每个链接的来源：

```javascript
function validateSearchUrl(link, targetKeyword) {
  // 检查 searchUrl 是否包含目标关键词
  const url = new URL(link.searchUrl);
  const keyword = url.searchParams.get('keyword');
  
  if (keyword !== targetKeyword) {
    console.warn(`⚠️  链接来源不匹配: ${link.noteId}`);
    console.warn(`   期望关键词: ${targetKeyword}`);
    console.warn(`   实际关键词: ${keyword}`);
    return false;
  }
  
  return true;
}

// 过滤无效链接
const validLinks = collectedLinks.filter(link => 
  validateSearchUrl(link, targetKeyword)
);

console.log(`✅ 有效链接: ${validLinks.length}/${collectedLinks.length}`);
```

#### 步骤 4: 补充缺失数量

如果有效链接不足目标数量，继续采集：

```javascript
const targetCount = 10;
const missingCount = targetCount - validLinks.length;

if (missingCount > 0) {
  console.log(`📋 需要补充 ${missingCount} 条链接`);
  
  // 返回搜索结果页
  await navigateToSearch(targetKeyword);
  
  // 跳过已采集的帖子，继续采集
  const alreadyCollected = new Set(validLinks.map(l => l.noteId));
  
  // ... 继续采集直到满足数量
}
```

## 完整流程图

```
1. 执行搜索 → 到达搜索结果页
   ↓
2. 记录搜索 URL (searchUrl)
   ↓
3. 获取搜索结果列表容器
   ↓
4. for each 帖子卡片:
   4.1 记录当前 URL（beforeClickUrl）
   4.2 点击帖子
   4.3 等待导航 → 到达详情页
   4.4 获取详情页 URL（detailUrl，包含 xsec_token）
   4.5 保存 { noteId, detailUrl, searchUrl: beforeClickUrl }
   4.6 返回搜索结果页
   ↓
5. 校验所有链接的 searchUrl
   ↓
6. 过滤掉 searchUrl 不匹配的链接
   ↓
7. 如果有效链接不足，返回步骤 3 继续采集
   ↓
8. 返回有效链接列表
```

## 数据结构

### 采集结果

```typescript
interface CollectedLink {
  noteId: string;           // 帖子 ID（从 URL 提取）
  detailUrl: string;        // 详情页完整 URL（包含 xsec_token）
  searchUrl: string;        // 点击前的搜索页 URL
  title?: string;           // 帖子标题（可选）
  timestamp: number;        // 采集时间戳
}
```

### 校验结果

```typescript
interface ValidationResult {
  valid: CollectedLink[];    // 有效链接
  invalid: CollectedLink[];  // 无效链接
  missingCount: number;      // 需要补充的数量
}
```

## 错误处理

### 错误 1: 导航失败

**场景**：点击帖子后未成功导航到详情页

**处理**：
```javascript
const detailUrl = await waitForDetailUrl(5000); // 等待最多 5 秒
if (!detailUrl || !detailUrl.includes('xsec_token')) {
  console.warn('⚠️  未获取到有效详情链接，跳过');
  await goBackToSearch();
  continue; // 跳过当前帖子
}
```

### 错误 2: 无法返回搜索页

**场景**：从详情页返回时失败

**处理**：
```javascript
async function goBackToSearch() {
  // 方法 1: 浏览器后退
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'history.back()'
  });
  
  await delay(2000);
  
  // 验证是否回到搜索页
  const currentUrl = await getCurrentUrl();
  if (!currentUrl.includes('/search_result')) {
    // 方法 2: 点击返回按钮（容器操作）
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_detail.back_button',
      operationId: 'click',
      sessionId: PROFILE
    });
    await delay(2000);
  }
}
```

### 错误 3: 校验失败率过高

**场景**：超过 30% 的链接 searchUrl 不匹配

**处理**：
```javascript
const invalidRate = invalidLinks.length / collectedLinks.length;

if (invalidRate > 0.3) {
  console.error('❌ 链接校验失败率过高，可能存在以下问题：');
  console.error('   1. 搜索结果页混入了推荐流');
  console.error('   2. 页面滚动过快，采集到非目标内容');
  console.error('   3. 容器定义不准确');
  
  // 建议：降低滚动速度，增加等待时间
  throw new Error('Link validation failed');
}
```

## 性能优化

### 优化 1: 批量采集 + 延迟校验

不在每次点击后立即校验，而是先采集完整批次再统一校验：

```javascript
// 先采集 20 条（不校验）
const batchSize = 20;
const batch = await collectBatch(batchSize);

// 批量校验
const valid = batch.filter(link => validateSearchUrl(link, keyword));

// 根据校验结果决定是否继续采集
```

### 优化 2: 缓存已访问的 noteId

避免重复采集同一篇帖子：

```javascript
const visitedNoteIds = new Set();

for (const item of items) {
  const noteId = extractNoteId(item);
  if (visitedNoteIds.has(noteId)) {
    console.log(`⏭️  跳过已访问: ${noteId}`);
    continue;
  }
  
  // ... 采集逻辑
  
  visitedNoteIds.add(noteId);
}
```

## 测试用例

### 测试 1: 正常采集

- 关键词: "华为"
- 目标数量: 5
- 预期: 所有链接 searchUrl 都包含 `keyword=华为`

### 测试 2: 推荐流污染

- 模拟场景: 滚动时混入推荐内容
- 预期: 校验后过滤掉推荐流链接，补充正确数量

### 测试 3: 导航失败恢复

- 模拟场景: 某个帖子点击后无法加载
- 预期: 跳过该帖子，继续采集其他帖子

## 参考实现

当前实现位于：
- `scripts/xiaohongshu/tests/phase1-4-full-collect.mjs`（行 3087-3220）
- 关键函数: `collectSearchResultsWithSafeUrl()`

## 总结

### 核心原则

1. **禁止使用 href**：必须点击后获取真实 URL
2. **记录来源**：保存 searchUrl 用于校验
3. **校验过滤**：移除 searchUrl 不匹配的链接
4. **补充数量**：确保最终结果满足目标数量

### 优势

- ✅ 获取带 xsec_token 的安全链接
- ✅ 避免推荐流污染
- ✅ 提高数据准确性
- ✅ 符合平台风控要求
