# Phase 2 详细设计：XHS 切换导入到 shared/

## 目标
将 xhs action-providers 的重复实现替换为 shared/ 模块的统一接口。减少代码重复，便于后续 weibo 切换（Phase 3）。

## 现状分析

### xhs 需要替换的文件

| xhs 文件 |行数 | shared 对应 | 替换方式 |
|----------|-----|-------------|----------|
| `dom-ops.mjs` | 407 | `shared/dom-ops.mjs` (223L) + 部分保留 | 导出 shared，保留 `fillInputValue`/`waitForAnchor`/`evaluateReadonly` |
| `common.mjs` | 129 | `shared/eval-ops.mjs` (168L) | 全导入 replace |
| `persistence.mjs` | 308 | `shared/persistence.mjs` (97L) | 全导入 replace |
| `trace.mjs` | 29 | `shared/trace.mjs` (29L) | 全导入 replace |
| `state.mjs` | 30 | `shared/state.mjs` 工厂 (91L) | 使用工厂创建状态管理 |
| `diagnostic-utils.mjs` | 21 | `shared/diagnostic-utils.mjs` (40L) | 全导入 replace |

### 需要保留在 xhs/dom-ops.mjs 的函数
- `evaluateReadonly` — 依赖 camo-runtime 的 `evaluate` 能力实现
- `highlightVisualTarget` / `clearVisualHighlight` — XHS 特有的可视化高亮逻辑
- `resolveSelectorTarget` — XHS 特有的选择器解析
- `fillInputValue` — XHS 特有实现（依赖 `evaluateReadonly`）
- `waitForAnchor` — XHS 特有实现（带轮询和超时）

### 影响范围
- **影响的文件**：xhs action-providers 下 10+ 文件
- **不影响**：weibo 模块、runner 层、daemon、API 服务
- **风险**：低，shared/ 是从 xhs 同源提取的，函数签名一致

## 方案设计

### 导入映射

**之前的 xhs/dom-ops.mjs 导出：**
```javascript
// xhs/dom-ops.mjs 导出 15+ 函数（含 L0 工具 + L1 XHS 特有）
export { evaluateReadonly, highlightVisualTarget, fillInputValue, 
         waitForAnchor, sleep, clickPoint, pressKey, typeText, 
         clearAndType, wheel, sleepRandom, withTimeout };
```

**新的 xhs/dom-ops.mjs：**
```javascript
// 从 shared/ 导入 L0 工具
export { sleep, clickPoint, pressKey, typeText, clearAndType, 
         wheel, sleepRandom, withTimeout } from '../shared/dom-ops.mjs';

// XHS 特有的 L1 函数保留在此文件
export { evaluateReadonly, highlightVisualTarget, fillInputValue, 
         waitForAnchor /* ... */ };
```

**其他文件的导入替换：**
```javascript
// 之前
import { buildTraceRecorder } from './trace.mjs';
// 之后
import { buildTraceRecorder } from '../shared/trace.mjs';

// 之前
import { mergeWeiboPosts, readJsonlRows } from './persistence.mjs';
// 之后
import { readJsonlRows, appendJsonlRows, writeJsonFile, 
         mergeJsonl } from '../shared/persistence.mjs';
```

### 替换清单

#### 1. xhs/dom-ops.mjs
- 删除：`sleep`, `withTimeout`, `sleepRandom`, `clickPoint`, `pressKey`, `typeText`, `clearAndType`, `wheel`
- 改为：`export { ... } from '../shared/dom-ops.mjs'`
- 保留：`evaluateReadonly`, `highlightVisualTarget`, `clearVisualHighlight`, `resolveSelectorTarget`, `fillInputValue`, `waitForAnchor`

#### 2. xhs/common.mjs
- **完全删除**，所有函数已在 `shared/eval-ops.mjs`
- 搜索 `from './common.mjs'` 替换为 `from '../shared/eval-ops.mjs'`

#### 3. xhs/persistence.mjs
- **完全删除**，所有函数已在 `shared/persistence.mjs`
- 搜索 `from './persistence.mjs'` 替换为 `from '../shared/persistence.mjs'`
- 注意：xhs persistence 可能有 `weiboPostDedupKey` 等 weibo 特有逻辑，需要检查

#### 4. xhs/trace.mjs → shared/trace.mjs
- 搜索 `from './trace.mjs'` 替换

#### 5. xhs/state.mjs
- 改为使用 `createProfileStateManager` 工厂

#### 6. xhs/diagnostic-utils.mjs → shared/diagnostic-utils.mjs
- 搜索 `from './diagnostic-utils.mjs'` 替换

## 实施顺序
1. 先改 `dom-ops.mjs`（最大影响面）
2. 改 `common.mjs` 引用
3. 改 `persistence.mjs` 引用
4. 改 `trace.mjs` 引用
5. 改 `state.mjs` 为工厂模式
6. 改 `diagnostic-utils.mjs` 引用
7. import 验证
8. 真机测试

## 验证计划
1. `node -e "import(...)"` 验证所有 xhs 模块
2. 手动 camo 测试 xhs unified 最小链路
3. daemon task 提交 E2E 验证
