# Post-Anchor Verification Design（操作后锚点验证）

## 1. 核心原则

**每个 DOM 写操作执行后，必须验证锚点确认页面状态符合预期。**

### 操作分类

| 类型 | 操作 | 是否改变 DOM | 是否需要锚点验证 |
|------|------|-------------|----------------|
| **读操作** | evaluate, query selector, get_url | ❌ 不改变 | ❌ 不需要 |
| **写操作** | click, type, press key, scroll, goto, fill input | ✅ 改变 | ✅ **必须** |

### 为什么点击是写操作

点击可能触发：
- 页面跳转（搜索按钮 → 搜索结果页）
- 弹窗出现（"展开全文" → 内容展开）
- Tab 切换（详情页关闭/打开）
- 风控拦截（验证码页面）

点击后不验证锚点 = 盲操作，不知道页面变成了什么状态。

## 2. 验证流程

```
[操作执行前]
├── 检查 preAnchor（可选：验证当前在预期页面）
│   └── 失败 → 恢复到预期页面 → 重试
│
[操作执行]
├── click / pressKey / scroll / goto / fillInputValue
│
[操作执行后] ← 必须验证
├── 检查 postAnchor���验证页面变到了预期状态）
│   ├── 成功 → 继续下一步操作
│   ├── 失败（页面在风控页）→ 触发风控恢复流程
│   ├── 失败（页面在无关详情页）→ 导航回首页 → 重试
│   └── 失败（页面在登录页）→ 暂停任务，等待手动登录
```

## 3. 锚点类型

| 锚点类型 | 例子 | 说明 |
|----------|------|------|
| **exist** | `.feeds-page exist` | 容器存在（不要求可见） |
| **visible** | `.note-item visible > 0` | 至少一个元素可见 |
| **url_contains** | `url contains /search_result` | URL 包含特定路径 |
| **url_exact** | `url === xiaohongshu.com` | URL 完全匹配 |
| **title_contains** | `title contains 小红书` | 标题包含特定文字 |
| **not_exist** | `.captcha-dialog not exist` | 特定元素不存在（风控未触发） |

## 4. 实现方案

### 4.1 autoscript operation 定义

每个 operation 定义新增 `postAnchors` 字段：

```javascript
// 示例：submit_search 操作
{
  id: 'submit_search',
  postAnchors: [
    { type: 'exist', selector: '#search-result, [class*="search-result"]' },
    { type: 'visible', selector: '.note-item', minCount: 1 },
  ],
  postAnchorTimeoutMs: 5000,  // 等待锚点出现的最长等待时间
}

// 示例：open_detail 操作
{
  id: 'open_detail',
  postAnchors: [
    { type: 'exist', selector: '.note-detail-mask, [class*="detail"]' },
    { type: 'not_exist', selector: '.captcha-dialog' },
  ],
}

// 示例：click "展开全文"
{
  id: 'expand_text',
  postAnchors: [
    { type: 'not_exist', selector: 'span.expand' },  // 展开按钮消失
  ],
}
```

### 4.2 runtime.mjs executeOperation 增强

```javascript
async function executeOperation(operation, context) {
  // 1. 执行操作
  const result = await operation.execute(context);
  
  // 2. 判断是否为 DOM 写操作
  if (isDomWriteOperation(operation)) {
    // 3. 执行后锚点验证
    const anchorResult = await verifyPostAnchors(operation, context, {
      timeoutMs: operation.postAnchorTimeoutMs || 5000,
    });
    
    if (!anchorResult.ok) {
      // 4. 锚点验证失败 → 记录 + 决策
      emitOperationProgress(context, {
        kind: 'post_anchor_failed',
        operationId: operation.id,
        expected: anchorResult.expected,
        actual: anchorResult.actual,
      });
      
      // 5. 根据失败类型决策
      if (anchorResult.isRiskControl) {
        // 风控页面 → 暂停任务
        return { ...result, postAnchorStatus: 'risk_control' };
      } else if (anchorResult.isLoginPage) {
        // 登录页 → 暂停任务
        return { ...result, postAnchorStatus: 'login_required' };
      } else {
        // 其他页面 → 标记为异常，由编排层决定恢复策略
        return { ...result, postAnchorStatus: 'unexpected_page' };
      }
    }
    
    return { ...result, postAnchorStatus: 'ok' };
  }
  
  return result;
}
```

### 4.3 DOM 写操作判断

```javascript
const DOM_WRITE_OPERATIONS = new Set([
  'click', 'clickPoint', 'typeText', 'clearAndType',
  'pressKey', 'keyboard_press',
  'scroll', 'scrollBySelector', 'wheel',
  'goto',
  'fillInputValue',
  'mouse_click', 'mouse_move',
]);

function isDomWriteOperation(operation) {
  return DOM_WRITE_OPERATIONS.has(operation.id) 
    || DOM_WRITE_OPERATIONS.has(operation.action)
    || operation.isDomWrite === true;
}
```

### 4.4 验证函数

```javascript
async function verifyPostAnchors(operation, context, { timeoutMs = 5000 }) {
  const anchors = operation.postAnchors;
  if (!anchors || anchors.length === 0) return { ok: true };
  
  const profileId = context.profileId;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const results = await evaluateReadonly(profileId, buildAnchorCheckScript(anchors));
    
    if (results.allPassed) {
      return { ok: true };
    }
    
    // 检查是否在风控/登录页
    if (results.isRiskControl) {
      return { ok: false, isRiskControl: true, actual: results };
    }
    if (results.isLoginPage) {
      return { ok: false, isLoginPage: true, actual: results };
    }
    
    await sleep(300);  // 锚点轮询间隔
  }
  
  return { ok: false, actual: 'timeout' };
}
```

## 5. 当前缺失锚点的操作清单（需要补全）

| 操作 | 当前状态 | 需要的 postAnchor |
|------|----------|-------------------|
| `submit_search` | ❌ 无 | `#search-result exist` |
| `open_first_detail` | ❌ 无 | `.note-detail-mask exist` |
| `close_detail` | ❌ 无 | `.note-detail-mask not_exist` |
| `click expand` | ❌ 无 | `span.expand not_exist` |
| `tab_switch` | ❌ 无 | `新 tab URL contains expected` |
| `fillInputValue` | ❌ 无 | `input has value` |
| `goto home` | ❌ 无 | `.feeds-page exist` |
| `collect_links` | ❌ 无 | `.note-item visible > 0` |
| `comments_harvest` | ❌ 无 | `评论区 exist` |

## 6. 恢复策略

| 锚点失败类型 | 恢复策略 |
|-------------|----------|
| `unexpected_page` | 导航回首页 → 重新搜索 |
| `risk_control` | 等待风控冷却 → 重试 |
| `login_required` | 暂停任务 → 等待手动登录 |
| `timeout` | 重试一次 → 失败则标记为异常 |

## 7. 验证标准

修复后，以下场景不应再发生：
1. ❌ 浏览器在详情页 → 任务执行搜索 → 0 条链接 → 空跑 1 小时
2. ❌ 点击后页面跳转到风控页 → 继续执行操作 → 无效数据
3. ❌ Tab 切换失败 → 在错误 tab 执行操作 → 数据混乱

每个操作执行后，日志必须包含 `postAnchorStatus: 'ok'` 或具体的失败原因。
