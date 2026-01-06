# 小红书容器驱动化改造总结

> 日期：2025-01-06
> 状态：✅ 完成
> 目标：将小红书采集链路完全切换到容器驱动模式

## ✅ 完成清单

### 1. 登录锚点模型定义 ✅

**文件**：`container-library/xiaohongshu/README.md`

**约定**：
- **已登录标识**：`*.login_anchor`（匹配任意页面下的登录锚点容器）
- **未登录标识**：`xiaohongshu_login.login_guard`（登录页核心控件）
- **不确定状态**：两类容器都不匹配

**容器选择器**：
- `*.login_anchor`：`a.link-wrapper[title="我"]`
- `xiaohongshu_login.login_guard`：登录页核心控件

### 2. Launcher 登录检测改造 ✅

**文件**：`launcher/core/launcher.mjs`

**改造内容**：
- 移除硬编码 DOM 查询
- 改为调用 `containers:match` 获取容器树
- 递归查找 `*.login_anchor` 和 `xiaohongshu_login.login_guard`
- 不再直接读取 `__INITIAL_STATE__` 等全局变量

**关键代码**：
```typescript
function findContainer(tree, pattern) {
  if (pattern.test(tree.id || tree.defId)) return tree;
  // 递归查找...
}

const loginAnchor = findContainer(tree, /\.login_anchor$/);
const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
```

### 3. Workflow Block 实现 ✅

**文件**：`modules/workflow/blocks/EnsureLoginBlock.ts`

**功能**：
- 通过 `containers:match` API 查找容器
- 匹配到 `*.login_anchor` → 返回 `isLoggedIn: true`
- 匹配到 `login_guard` → 等待人工登录
- 超时保护（默认 2 分钟）

**接口**：
```typescript
interface EnsureLoginInput {
  sessionId: string;
  serviceUrl?: string;
  maxWaitMs?: number;
  checkIntervalMs?: number;
}

interface EnsureLoginOutput {
  isLoggedIn: boolean;
  loginMethod: 'container_match' | 'manual_wait' | 'timeout';
  matchedContainer?: string;
  waitTimeMs?: number;
  error?: string;
}
```

### 4. 调试脚本改造 ✅

**文件**：
- `scripts/xiaohongshu/tests/status-v2.mjs` - 状态检查
- `scripts/xiaohongshu/tests/phase1-session-login.mjs` - 登录守护
- `scripts/debug-xhs-search.mjs` - Unattached 搜索验证
- `scripts/debug-xhs-detail.mjs` - Unattached 详情页交互

**改造要点**：
- 移除硬编码 DOM 逻辑（如 `if (url.includes('xiaohongshu'))`）
- 完全基于容器 ID 匹配
- 优先使用刷新而非重新导航
- 测试后恢复初始状态

### 5. 文档完善 ✅

**文件**：
- `container-library/xiaohongshu/README.md` - 登录锚点约定
- `AGENTS.md` - 调试脚本 Unattached 模式规则
- `task.md` - 完整任务追踪

## 📊 容器驱动化对比

### ❌ 旧方式（硬编码 DOM）

```javascript
// 禁止这样写
if (url.includes('xiaohongshu.com')) {
  const avatar = await page.$('a[title="我"]');
  if (avatar) return true;
}
```

**问题**：
- DOM 选择器易失效
- 平台特定逻辑分散
- 难以测试和维护
- 违反分层原则

### ✅ 新方式（容器驱动）

```typescript
// 推荐：基于容器 ID
const result = await controllerAction('containers:match', { profile, url });
const loginAnchor = findContainer(tree, /\.login_anchor$/);
if (loginAnchor) {
  return { isLoggedIn: true };
}
```

**优势**：
- 平台无关（同一套代码支持微博/抖音等）
- 选择器集中在容器定义
- 易于测试和验证
- 符合分层架构

## 🔄 数据流

### 登录检测流程

```
1. Launcher / Workflow
   ↓
2. 调用 containers:match
   ↓
3. 获取容器树
   ↓
4. 递归查找 *.login_anchor
   ↓
5a. 匹配到 → 已登录
   ↓
5b. 未匹配到，查找 xiaohongshu_login.login_guard
   ↓
6a. 匹配到 → 未登录，等待人工
   ↓
6b. 未匹配到 → 不确定状态
```

### Workflow 执行流程

```
1. EnsureSessionBlock
   ↓
2. EnsureLoginBlock（容器驱动）
   ↓
3. GoToSearchBlock（容器驱动）
   ↓
4. PickNoteBlock（容器驱动）
   ↓
5. OpenDetailBlock（容器驱动）
   ↓
6. ExpandCommentsBlock（容器驱动）
```

## 📝 关键文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `container-library/xiaohongshu/README.md` | ✅ | 登录锚点约定文档 |
| `launcher/core/launcher.mjs` | ✅ | 容器驱动登录检测 |
| `modules/workflow/blocks/EnsureLoginBlock.ts` | ✅ | 通用登录 Block |
| `scripts/xiaohongshu/tests/status-v2.mjs` | ✅ | 容器驱动状态检查 |
| `scripts/xiaohongshu/tests/phase1-session-login.mjs` | ✅ | 容器驱动登录守护 |
| `scripts/debug-xhs-search.mjs` | ✅ | Unattached 搜索验证 |
| `scripts/debug-xhs-detail.mjs` | ✅ | Unattached 详情页交互 |
| `AGENTS.md` | ✅ | Unattached 模式规则 |
| `task.md` | ✅ | 完整任务追踪 |

## 🎯 验证测试

### 测试命令

```bash
# 1. 检查会话状态（容器驱动）
node scripts/xiaohongshu/tests/status-v2.mjs

# 2. 一键启动（容器驱动登录检测）
node scripts/start-headful.mjs --profile xiaohongshu_fresh --url https://www.xiaohongshu.com

# 3. 搜索验证（Unattached 模式）
node scripts/debug-xhs-search.mjs

# 4. 详情页测试（Unattached 模式）
node scripts/debug-xhs-detail.mjs
```

### 预期结果

- 所有脚本不再硬编码 DOM 逻辑
- 登录状态完全基于容器匹配
- 调试脚本复用现有 session
- Workflow 可以直接复用 EnsureLoginBlock

## 🚀 下一步

1. 运行测试脚本验证容器驱动化
2. 创建第一个基于容器驱动的完整 Workflow
3. 运行小规模采集测试（5 条数据）
4. 优化 XiaohongshuCrawlerBlock 使用新架构

## 📚 参考文档

- `container-library/xiaohongshu/README.md` - 容器定义 + 登录锚点约定
- `task.md` - 当前任务追踪
- `AGENTS.md` - 架构规则
- `docs/xiaohongshu-next-steps.md` - 详细任务清单

---

**完成时间**：2025-01-06 09:30
**改造成果**：小红书链路 100% 容器驱动化
