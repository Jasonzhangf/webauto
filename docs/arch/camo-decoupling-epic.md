# Camo 框架业务耦合清理 Epic

## 背景
camo 是通用框架，不应包含业务特定逻辑。当前发现 4 处业务耦合：

| 文件 | 业务代码 | 行数 |
|------|---------|------|
| `checkpoint.mjs` | `XHS_CHECKPOINTS` 小红书选择器 | 9 |
| `tab-pool.mjs` | `isXhsHost` 平台判断 | 7 |
| `cookies.js` | weibo cookie 特殊处理 | 2 |
| `viewport.js` | `xiaohongshu_` profile 前缀 | 1 |

## 修复方案

### Phase 1: XHS_CHECKPOINTS 迁移 (高优先级)

**现状**:
```javascript
// camo/src/container/runtime-core/checkpoint.mjs
export const XHS_CHECKPOINTS = {
  search_ready: ['#search-input', 'input.search-input', ...],
  home_ready: ['.feeds-page', '.note-item', ...],
  detail_ready: ['.note-scroller', '.note-content', ...],
  comments_ready: ['.comments-container', '.comment-item', ...],
};
```

**修复**:
1. 在 webauto 创建 `lib/xhs-checkpoints.mjs`
2. camo 的 `detectCheckpoint` 接受 `selectors` 参数
3. webauto 调用时传入 XHS 选择器

### Phase 2: isXhsHost 通用化 (中优先级)

**现状**:
```javascript
const isXhsHost = host.includes('xiaohongshu.com');
```

**修复**:
改为 `isDetailSeedUrl(url)` 通用检测：
```javascript
function isDetailSeedUrl(url, knownHosts = ['xiaohongshu.com', 'weibo.com']) {
  const host = new URL(url).hostname.toLowerCase();
  return knownHosts.some(h => host.includes(h));
}
```

### Phase 3: cookies weibo 配置化 (低优先级)

**现状**:
```javascript
if (hostname.includes('weibo')) {
  targets.add('weibo.com-latest.json');
}
```

**修复**:
通过 `cookieDomains` 参数传入：
```javascript
function collectCookieFiles(currentUrl, { cookieDomains = [] } = {}) {
  // cookieDomains: ['weibo.com', 'xiaohongshu.com']
}
```

### Phase 4: viewport profile 前缀配置化 (低优先级)

**现状**:
```javascript
if (os.platform() === 'win32' && profileId.startsWith('xiaohongshu_')) {
  return 1;
}
```

**修复**:
通过环境变量 `CAMO_WINDOWS_DSF_PROFILES=xiaohongshu_,weibo_` 配置。

## 验收标准

1. camo 代码中 `grep -c "xiaohongshu\|xhs\|weibo\.com"` = 0
2. webauto 业务代码可独立修改 selector 配置
3. 新增平台无需修改 camo 框架

## 任务清单

- [ ] webauto-10201: Phase 1 - XHS_CHECKPOINTS 迁移
- [ ] webauto-10202: Phase 2 - isXhsHost 通用化
- [ ] webauto-10203: Phase 3 - cookies 配置化
- [ ] webauto-10204: Phase 4 - viewport 配置化
- [ ] webauto-10205: SKILL.md 更新
