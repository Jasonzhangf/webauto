# Collect xsec_token 修复记录

## 问题

用户报告：collect 阶段落盘的链接没有 xsec_token，导致 detail 阶段访问 404。

## 根因分析

1. `executeCollectLinksOperation` 中使用 `resolved.searchUrl`（search_result 格式）而非 `resolved.detailUrl`（explore 格式）
2. `resolveSearchResultTokenLink` 函数中，当 token 存在时才生成 `detailUrl`，但之前代码使用了 `searchUrl`
3. 如果链接没有 token，`detailUrl` 会是空字符串，但代码没有校验

## 修复内容

### 文件：modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs

```javascript
// 修复前
const resolved = resolveSearchResultTokenLink(row.href);
if (!resolved?.searchUrl || !resolved.noteId) return null;
return {
  noteId: resolved.noteId,
  safeDetailUrl: resolved.searchUrl,  // 错误：使用 searchUrl
  noteUrl: resolved.searchUrl,        // 错误：使用 searchUrl
  ...
};

// 修复后
const resolved = resolveSearchResultTokenLink(row.href);
// Only persist links with valid token (detailUrl will be empty if token is missing/invalid)
if (!resolved?.detailUrl || !resolved.noteId) return null;
return {
  noteId: resolved.noteId,
  safeDetailUrl: resolved.detailUrl,  // 正确：使用 detailUrl
  noteUrl: resolved.detailUrl,        // 正确：使用 detailUrl
  ...
};

// 新增：当所有 token links 都无效时，滚动页面触发 DOM 更新
if (candidates.length === 0 && tokenLinks.length > 0) {
  await pressKey(profileId, 'PageDown');
  await sleep(400);
  continue;
}
```

## 验证结果

- **runId**: 7580ad53-4955-48e2-a860-337097d082eb
- **keyword**: AI技术
- **maxNotes**: 20
- **status**: running (20/20 processed)
- **commentsCollected**: 511
- **链接格式**: `/explore/{noteId}?xsec_token=...`（而非 `/search_result/`）
- **所有链接都有 xsec_token**: ✅

## 链接示例

```json
{
  "noteId": "6982e30c000000002102bf6b",
  "safeDetailUrl": "https://www.xiaohongshu.com/explore/6982e30c000000002102bf6b?xsec_token=ABYnMfqSMSa3tL_P0six4gQCbOEbsnYMknx5KNpPyMX7o=&source=web_explore_feed",
  "hasToken": true,
  "xsecToken": "ABYnMfqSMSa3tL_P0six4gQCbOEbsnYMknx5KNpPyMX7o="
}
```

## 影响

- collect 阶段落盘的链接现在都是有效的 explore 格式链接
- detail 阶段可以直接使用这些链接访问帖子
- 消除了 404 错误

Tags: collect, xsec_token, xhs, bugfix, 2026-03-13
