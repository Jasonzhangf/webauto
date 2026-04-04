# Shared Layer Refactoring Design

> **Status**: Draft  
> **Created**: 2026-04-04  
> **Epic**: bd webauto-shared-refactor  

---

## 0) Motivation

### Current Problems

1. **Code Duplication**: xhs/ and weibo/ 各自实现了相同的工具函数（trace、state、persistence、diagnostic-utils），逐字节相同或仅有 import 路径差异。
2. **weibo 缺少共享 DOM 层**: xhs 有完整的 `dom-ops.mjs`（772行），weibo 没有。每个 weibo 文件自行内联 `callAPI`/`sleep`/`devtoolsEval`。
3. **巨型文件**: `xhs/harvest-ops.mjs` 2635行，混杂了详情提取、评论采集、点赞、回复、trace、状态管理、持久化。
4. **编排混入底层**: 部分 xhs ops 文件直接调用 persistence/trace/state，应该由 runner 层编排。

### Goal

- 提取 `shared/` 层，零业务依赖
- xhs/weibo 通过 import 共享使用
- 编排逻辑保持在 runner 层（apps/webauto/entry/）
- 每个文件 < 500 行，职责单一

---

## 1) Layer Architecture

```
L0: shared/          ← 零业务依赖，纯工具函数
L1: action-providers/ ← 平台业务逻辑（DOM 选择器、提取脚本）
L2: entry/           ← 编排（runner、daemon、schedule）
```

### Import Direction（单向）

```
L2 (entry/) ──imports──> L1 (providers/) ──imports──> L0 (shared/)
     ↑                          ↑
     └────── forbidden ──────────┘   (L0/L1 不能 import L2)
     └────── forbidden ────────────────┘ (L1 不能 import 其他平台)
```

---

## 2) Target Directory Structure

```
modules/camo-runtime/src/autoscript/
├── shared/                          ← 新建
│   ├── api-client.mjs               ← callAPI, BROWSER_SERVICE_URL, withTimeout
│   ├── dom-ops.mjs                  ← sleep, clickPoint, pressKey, scrollBySelector,
│   │                                     fillInputValue, waitForAnchor, typeText,
│   │                                     clearAndType, resolveSelectorTarget,
│   │                                     highlightVisualTarget, clearVisualHighlight,
│   │                                     readLocation, evaluateReadonly, wheel
│   ├── eval-ops.mjs                 ← runEvaluateScript, extractEvaluateResultData,
│   │                                     extractScreenshotBase64, withOperationHighlight,
│   │                                     createEvaluateHandler
│   ├── persistence.mjs              ← ensureDir, readJsonlRows, appendJsonlRows,
│   │                                     writeJsonFile, mergeJsonl, savePngBase64
│   ├── trace.mjs                    ← emitOperationProgress, emitActionTrace,
│   │                                     buildTraceRecorder
│   ├── state.mjs                    ← createProfileStateManager (工厂函数)
│   └── diagnostic-utils.mjs         ← captureScreenshotToFile, sanitizeFileComponent
│
├── action-providers/
│   ├── xhs/
│   │   ├── index.mjs
│   │   ├── search-ops.mjs           (不变, 224行)
│   │   ├── search-gate-ops.mjs      (不变, 487行)
│   │   ├── collect-ops.mjs          (不变, 1151行)
│   │   ├── detail-ops.mjs           (不变, 307行)
│   │   ├── detail-flow-ops.mjs      (不变, 1391行)
│   │   ├── comments-ops.mjs         (不变, 1194行)
│   │   ├── auth-ops.mjs             (不变, 249行)
│   │   ├── dom-ops.mjs             ← 删除（迁移到 shared/）
│   │   ├── common.mjs              ← 删除（拆分到 shared/eval-ops + shared/api-client）
│   │   ├── persistence.mjs         ← 删除共享函数，仅保留 xhs 特有
│   │   ├── trace.mjs               ← 删除（迁移到 shared/）
│   │   ├── state.mjs               ← 重构为使用 shared/state 工厂
│   │   ├── diagnostic-utils.mjs    ← 删除（迁移到 shared/）
│   │   ├── utils.mjs               (保留 xhs 特有: normalizeInlineText, buildElementCollectability)
│   │   ├── tab-ops.mjs             (不变, 375行)
│   │   ├── tab-state.mjs           (不变, 286行)
│   │   ├── detail-slot-state.mjs   (不变, 155行)
│   │   ├── feed-like-*.mjs         (不变, ~800行合计)
│   │   └── like-rules.mjs          (不变, 57行)
│   │
│   └── weibo/
│       ├── index.mjs               (不变, 63行)
│       ├── timeline-ops.mjs        (不变, 158行)
│       ├── user-profile-ops.mjs    (不变, 268行)
│       ├── detail-ops.mjs          (不变, 179行)
│       ├── detail-flow-ops.mjs     (不变, 37行)
│       ├── comments-ops.mjs        (不变, 276行)
│       ├── video-ops.mjs           (不变, 115行)
│       ├── harvest-ops.mjs         (不变, 173行)
│       ├── persistence.mjs         ← 删除共享函数，仅保留 weibo 特有
│       ├── common.mjs              ← 删除（拆分到 shared/）
│       ├── trace.mjs               ← 删除（迁移到 shared/）
│       ├── state.mjs               ← 重构为使用 shared/state 工厂
│       └── diagnostic-utils.mjs    ← 删除（迁移到 shared/）
```

---

## 3) Shared Module Detailed Design

### 3.1 `shared/api-client.mjs`

**Source**: xhs/common.mjs 的 callAPI 部分 + weibo/common.mjs 的 callAPI 部分

```javascript
// 导出
export { callAPI }                          // 统一的 browser-service HTTP 调用
export { BROWSER_SERVICE_URL }             // 从环境变量读取
export { withTimeout }                     // Promise 超时包装
```

**设计要点**:
- `BROWSER_SERVICE_URL` 从 `CAMO_BROWSER_HTTP_PROTO/HOST/PORT` 读取
- `callAPI(action, payload, options)` 统一签名
- `withTimeout(promise, ms, label)` 用于操作级超时

### 3.2 `shared/dom-ops.mjs`

**Source**: xhs/dom-ops.mjs（772行，完整迁移）

```javascript
// 导出
export { sleep, sleepRandom }               // 延迟
export { clickPoint }                       // 坐标点击
export { pressKey }                         // 键盘按键
export { typeText }                         // 文本输入（keyboard:type，保留但标记 deprecated）
export { clearAndType }                     // 全选+输入（保留但标记 deprecated）
export { fillInputValue }                   // 原生 value 设置（推荐文本输入方式）
export { scrollBySelector }                 // 选择器滚动
export { wheel }                            // 滚轮滚动
export { resolveSelectorTarget }            // 选择器解析
export { waitForAnchor }                    // 锚点轮询等待
export { highlightVisualTarget }            // 视觉高亮
export { clearVisualHighlight }             // 清除高亮
export { readLocation }                     // 读取 URL
export { evaluateReadonly }                 // 只读 JS 执行
```

**设计要点**:
- 所有函数依赖 `callAPI`（从 shared/api-client.mjs 导入）
- `typeText`/`clearAndType` 保留但添加 JSDoc 标记 `@deprecated use fillInputValue instead`
- 不包含任何平台特定逻辑

### 3.3 `shared/eval-ops.mjs`

**Source**: xhs/common.mjs 的 evaluate 部分

```javascript
// 导出
export { runEvaluateScript }                // evaluate + 高亮 + 超时 + JS 策略检查
export { extractEvaluateResultData }        // 从 evaluate 返回提取 data
export { extractScreenshotBase64 }          // 从 screenshot 返回提取 base64
export { withOperationHighlight }           // 视觉高亮包装
export { createEvaluateHandler }            // 快速创建 evaluate handler
```

**设计要点**:
- `runEvaluateScript` 需要接受 `allowUnsafeJs` 和 `timeoutMs`
- JS 策略检查（`assertNoForbiddenJsAction`）从 `js-policy.mjs` 导入
- 平台调用时可传 `allowUnsafeJs: true` 跳过策略检查

### 3.4 `shared/persistence.mjs`

**Source**: xhs/persistence.mjs 共享部分 + weibo/persistence.mjs 共享部分

```javascript
// 导出
export { ensureDir }                        // 递归创建目录
export { readJsonlRows }                    // 读取 JSONL
export { appendJsonlRows }                  // 追加 JSONL（含去重）
export { writeJsonFile }                    // 写 JSON
export { savePngBase64 }                    // 保存 base64 为 PNG
```

**平台特有保留在各自 persistence.mjs**:
- xhs: `resolveXhsOutputContext`, `mergeCommentsJsonl`, `writeCommentsMd`, `writeContentMarkdown`, `mergeLinksJsonl`, `makeLikeSignature`, `loadLikedSignatures`, `appendLikedSignature`
- weibo: `resolveWeiboOutputContext`, `weiboPostDedupKey`, `mergeWeiboPosts`, `writeWeiboLinks`, `writeCollectionMeta`, `appendLog`, `resolveTimelineOutputContext`, `resolveWeiboDetailOutputContext`, `writeDetailContent`, `writeDetailComments`, `writeDetailCommentsMd`, `writeDetailLinks`, `writeDetailMeta`

### 3.5 `shared/trace.mjs`

**Source**: 完全相同的 xhs/trace.mjs 和 weibo/trace.mjs

```javascript
// 导出
export { emitOperationProgress }            // 发送进度事件
export { emitActionTrace }                  // 批量发送 trace
export { buildTraceRecorder }               // 创建 trace 记录器
```

### 3.6 `shared/state.mjs`

**Source**: xhs/state.mjs 的 Map 管理模式 + weibo/state.mjs

```javascript
// 导出
export { createProfileStateManager }        // 工厂函数
// 返回: { getState, defaultState, clearPendingQueues, withSerializedLock }

function createProfileStateManager({ namespace, defaultState }) {
  // namespace: 'xhs' | 'weibo' | ...
  // defaultState: () => ({ ... })
  // 内部维护 Map<profileId, state>
}
```

**设计要点**:
- `xhs/state.mjs` 改为 `createProfileStateManager({ namespace: 'xhs', defaultState: defaultXhsProfileState })`
- `weibo/state.mjs` 改为 `createProfileStateManager({ namespace: 'weibo', defaultState: defaultWeiboProfileState })`
- `clearPendingQueues` 和 `withSerializedLock` 逻辑保留在工厂内

### 3.7 `shared/diagnostic-utils.mjs`

**Source**: xhs/diagnostic-utils.mjs + weibo/diagnostic-utils.mjs（统一版）

```javascript
// 导出
export { captureScreenshotToFile }          // 截图保存到文件
export { sanitizeFileComponent }            // 文件名安全处理
```

---

## 4) xhs/harvest-ops.mjs 拆分方案

### Current State

2635 行，7 个 export 函数，每个 100-1500 行不等。

### Target

| 新文件 | 来源函数 | 预估行数 |
|--------|----------|----------|
| `detail-harvest-ops.mjs` | `executeDetailHarvestOperation` | ~200 |
| `comments-harvest-ops.mjs` | `executeCommentsHarvestOperation` | ~500 |
| `comment-match-ops.mjs` | `executeCommentMatchOperation` | ~100 |
| `comment-like-ops.mjs` | `executeCommentLikeOperation` | ~200 |
| `comment-reply-ops.mjs` | `executeCommentReplyOperation` | ~100 |
| `expand-replies-ops.mjs` | `executeExpandRepliesOperation` | ~150 |
| `harvest-helpers.mjs` | 共享内部函数（shouldPauseForTabBudget, resolveCommentFocusTarget, readXhsRuntimeState, ensureDetailInteractionState） | ~300 |
| `index.mjs` | 统一 re-export | ~20 |

**Import 变化**:
- `harvest-helpers.mjs` 提供 `readXhsRuntimeState`, `ensureDetailInteractionState` 等给各子模块
- 各子模块 import `harvest-helpers.mjs` + `shared/*` + `./comments-ops.mjs` 等
- 原来的 `harvest-ops.mjs` 删除，`index.mjs` 做统一导出

---

## 5) Migration Strategy

### Phase 1: Extract shared/ (无破坏性)
1. 创建 `shared/` 目录和所有模块
2. 内容直接从 xhs 拷贝，移除 xhs 特有逻辑
3. xhs/weibo 暂不修改 import（兼容性不受影响）
4. **验证**: `node -e "import('./shared/api-client.mjs')"` 全部可加载

### Phase 2: xhs 切换 import
1. xhs 各文件 import 从 `./dom-ops.mjs` 改为 `../../shared/dom-ops.mjs`
2. xhs/common.mjs 删除，改为 re-export shared
3. xhs/trace.mjs 删除，改为 re-export shared
4. xhs/diagnostic-utils.mjs 删除，改为 re-export shared
5. xhs/state.mjs 重构为使用 shared/state 工厂
6. xhs/persistence.mjs 删除共享函数，保留平台特有
7. **验证**: 运行一条 xhs unified 最小链路

### Phase 3: weibo 切换 import
1. weibo/common.mjs 删除，改为 re-export shared
2. weibo 各文件 `callAPI`/`sleep`/`devtoolsEval` 改为 import shared
3. weibo/trace.mjs 删除，改为 re-export shared
4. weibo/state.mjs 重构为使用 shared/state 工厂
5. weibo/persistence.mjs 删除共享函数，保留平台特有
6. weibo/diagnostic-utils.mjs 删除，改为 re-export shared
7. **验证**: 运行一条 weibo unified 最小链路

### Phase 4: 拆分 xhs/harvest-ops.mjs
1. 创建各子模块文件
2. 迁移函数体
3. `harvest-ops.mjs` 改为 re-export index
4. **验证**: 运行一条 xhs unified 完整链路（含 detail + comments）

---

## 6) Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Import 路径错误导致运行时崩溃 | 每个 Phase 后运行最小链路验证 |
| Circular dependency | shared/ 不 import 任何 provider/ |
| 遗漏 xhs/weibo 特有逻辑被误删 | 逐函数对比，平台特有函数保留在原位 |
| camo 框架层 vendor 同步冲突 | shared/ 仅在 webauto，不进入 @web-auto/camo |

---

## 7) Acceptance Criteria

- [ ] `shared/` 目录下所有模块可独立加载
- [ ] xhs 全部功能（search/collect/detail/comments/like/reply）通过最小链路验证
- [ ] weibo 全部功能（timeline/detail/video/user-profile）通过最小链路验证
- [ ] 0 个 `rg "callAPI.*function\|function sleep" modules/camo-runtime/src/autoscript/action-providers/` 命中（共享函数不再重复定义）
- [ ] 所有文件 < 600 行（除 detail-flow-ops.mjs 1391行 和 collect-ops.mjs 1151行 暂保留）
