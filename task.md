# WebAuto 任务追踪（小红书爬虫 - Workflow调试阶段 - 登录锚点抽象重构）

> 目标：实现基于 Workflow 的小红书深度采集（图片、全评论、去重），并确保调试过程高效、低风控。

## 核心原则
1. **Session 持久化**：禁止反复杀进程/重启服务。全程复用 `xiaohongshu_fresh` profile。
2. **原子化调试**：将大流程拆解为"状态检查"、"搜索"、"列表获取"、"详情进入"、"评论展开"等原子脚本，逐一验证。
3. **可视化确认**：利用高亮 (Highlight) 和截图 (Screenshot) 确认锚点和页面状态。
4. **关键字轮换**：oppo小平板 -> 手机膜 -> 雷军 -> 小米 -> 华为 -> 鸿蒙，避免单词高频请求。
5. **容器驱动登录锚点**（2025-01-06 重构）：登录状态判定完全基于容器匹配，禁止在 workflow/脚本中硬编码 DOM 逻辑。
   - 已登录：匹配 `*.login_anchor`（如 `xiaohongshu_search.login_anchor`）
   - 未登录：匹配 `xiaohongshu_login.login_guard`
   - 不确定：两类容器都不匹配
6. **容器树一致性**：所有页面必须从根容器开始匹配，目录结构与 DOM 层级严格对应（参考 `container-library/xiaohongshu/README.md`）。
7. **Session 命名规则**：所有浏览器会话按 `{platform}_{variant}[_{seq}]` 固定命名。
8. **调试脚本 Unattached 模式**：所有调试脚本必须复用现有会话，优先使用页面刷新而非重新导航。

## 登录锚点模型（新）

### 容器定义

| 状态 | 容器 ID | 选择器 | 位置 |
|------|----------|--------|------|
| 已登录 | `*.login_anchor` | `a.link-wrapper[title="我"]` | 每个根容器下 |
| 未登录 | `xiaohongshu_login.login_guard` | 登录页核心控件 | 登录页根容器下 |

### Workflow 使用规范

```typescript
// ✅ 正确：基于容器 ID
const result = await containers:match({ profile, url });
const loginAnchor = findContainer(result, /\.login_anchor$/);
if (loginAnchor) {
  // 已登录
}
```

```javascript
// ❌ 错误：硬编码 DOM
const avatar = await page.$('a[title="我"]');
if (avatar) { /* ... */ }
```

### 事件驱动

| 事件 | 触发条件 | 下一步 |
|------|----------|--------|
| `login:required` | 匹配到 `login_guard` | 停止并等待人工登录 |
| `login:ok` | 匹配到 `login_anchor` | 继续 workflow |
| `login:uncertain` | 两类容器都不匹配 | 跳转登录页或报错 |

## 调试辅助能力
- **浏览器 CLI + WS**：通过 `POST /v1/controller/action` 的 `browser:*` 指令及 `ws://127.0.0.1:7701/ws`。
- **容器 CLI**：`/v1/container/<containerId>/execute` 直接触发 `highlight`/`scroll`/`navigate` 等 Operation。
- **Bus 订阅**：连接 `ws://127.0.0.1:7701/bus` 订阅 `container:*`/`ui:*`/`login:*` 事件。
- **高亮 + 登录锚点**：借助 `ui:highlight` / `highlight` operation 定位元素。

## 当前状态 (2025-01-06 09:20)
- 服务：Unified API (7701) / Browser Service (7704) 运行中。
- 会话：`xiaohongshu_fresh` 存在，当前在详情页（explore），已登录（10 cookies）。
- Workflow：`XiaohongshuCrawlerBlock` 已实现，待重构为容器驱动模式。
- 容器：所有容器定义已完成，登录锚点模型已定义。
- 文档：已补充登录锚点约定到 `container-library/xiaohongshu/README.md`。

## 重构计划（按优先级排序）

### Phase 1: 容器化登录状态检查 ⏳

#### Task 1.1: 更新调试脚本为容器驱动模式 ✅
- [x] `scripts/xiaohongshu/tests/status-v2.mjs` - 完全基于容器匹配判定登录状态
- [x] `container-library/xiaohongshu/README.md` - 添加登录锚点约定文档

#### Task 1.2: 更新 Phase 1 脚本 ⏳
- [x] 更新 `scripts/xiaohongshu/tests/phase1-session-login.mjs`
  - 移除硬编码 DOM 逻辑（不再读取 `__INITIAL_STATE__` / avatar / cookie 做登录判断）
  - 改为调用 `containers:match` 并在容器树中查找 `*.login_anchor` / `xiaohongshu_login.login_guard`
  - 登录检测函数 `isLoggedIn()` 仅依赖容器状态：`logged_in` / `not_logged_in` / `uncertain`
  - 仍通过高亮登录相关容器辅助人工确认（`highlight` operation）

#### Task 1.3: 验证容器驱动登录检查 ⏳
```bash
# 运行 status-v2 验证容器匹配
node scripts/xiaohongshu/tests/status-v2.mjs

# 手动测试容器匹配
curl -X POST http://127.0.0.1:7701/v1/controller/action \
  -d '{"action":"containers:match","payload":{"profile":"xiaohongshu_fresh"}}'
```

### Phase 2: 通用 EnsureLoginBlock 创建 ⏳

#### Task 2.1: 创建通用登录块
- [x] 文件：`modules/workflow/blocks/EnsureLoginBlock.ts`
- [x] 功能（当前版本）：
  - 通过 Unified API `controller action` 调用 `containers:match` 查找登录相关容器
  - 匹配 `*.login_anchor` → 返回 `{ status: 'logged_in', containerId, url }`
  - 匹配 `xiaohongshu_login.login_guard` → 返回 `{ status: 'not_logged_in', containerId, url }`
  - 匹配不到 → 返回 `{ status: 'uncertain', reason }`
  - 不做自动登录，仅作为“登录态探针”，由上层 workflow 决定是等待人工登��还是跳转登录页

#### Task 2.2: 平台配置映射
```typescript
interface PlatformLoginConfig {
  loginAnchorIds: string[];  // ['xiaohongshu_home.login_anchor', ...]
  loginGuardId: string;      // 'xiaohongshu_login.login_guard'
}
```

### Phase 3: 通用 Workflow 框架创建 ⏳

#### Task 3.1: 定义通用 Block 集合
- [x] **EnsureSession** - 检查 session 存在性
- [x] **EnsureLogin** - 容器驱动登录检查（基于 EnsureLoginBlock）
- [ ] **GoToSearch** - 通过搜索容器触发输入+回车（新）
- [ ] **PickNote** - 通过 `search_result_list/item` 容器（新）
- [ ] **OpenDetail** - 通过 `navigate` 容器（新）
- [ ] **ExpandComments** - 通过 `comment_section` 容器（新）

#### Task 3.2: 平台配置
```typescript
interface PlatformConfig {
  site: string;                // 'xiaohongshu'
  loginAnchorIds: string[];
  loginGuardId: string;
  searchBarId: string;
  searchListId: string;
  searchItemId: string;
  detailRootId: string;
  commentSectionId: string;
}
```

#### Task 3.3: 第一个 XHS Workflow
```typescript
// 1）登录 Workflow（已落地）
// 文件：modules/workflow/workflows/XiaohongshuLoginWorkflow.ts
// 作用：EnsureSession + EnsureLogin 的组合，用于“登录到主页/搜索页”的基础步骤

// 2）后续采集 Workflow（规划中）
{
  id: 'xiaohongshu-collect-v2',
  name: '小红书关键词采集（容器驱动版）',
  platform: 'xiaohongshu',
  steps: [
    { blockName: 'EnsureSession', ... },
    { blockName: 'EnsureLogin', ... },
    { blockName: 'GoToSearch', ... },
    { blockName: 'PickNote', ... },
    { blockName: 'OpenDetail', ... },
    { blockName: 'ExpandComments', ... }
  ]
}
```

### Phase 4: 调试脚本重构完成 ⏳

#### Task 4.1: 更新 debug 脚本
- [x] `debug-xhs-status.mjs` - 已符合 unattached 模式
- [x] `debug-xhs-search.mjs` - 已优化为 unattached 模式
- [x] `debug-xhs-detail.mjs` - 已优化为 unattached 模式（状态恢复）
- [ ] 更新为容器驱动登录检查

#### Task 4.2: 运行阶段测试
```bash
# Phase 1: 登录状态（容器驱动）
node scripts/xiaohongshu/tests/status-v2.mjs

# Phase 2: 搜索验证
node scripts/debug-xhs-search.mjs

# Phase 3: 详情页交互
node scripts/debug-xhs-detail.mjs
```

### Phase 5: Block 优化与集成 ⏳

#### Task 5.1: XiaohongshuCrawlerBlock 重构
- [ ] 移除硬编码 DOM 逻辑
- [ ] 改为容器 ID 驱动
- [ ] 优化 Context Destroyed 处理

#### Task 5.2: 完整 Workflow 测试
```bash
# 小规模测试
node scripts/run-xiaohongshu-workflow.ts --keyword "手机膜" --count 5

# 检查输出
ls -la ~/.webauto/download/xiaohongshu/手机膜/
```

### Phase 6: 稳定性与性能优化（后续）⏳

- [ ] 优化评论展开逻辑
- [ ] 增加并发控制
- [ ] 优化错误恢复机制
- [ ] 运行 50+ 条数据测试

### Phase 7: 启动器 / 一键启动脚本容器化登录检测 ⏳

#### Task 7.1: 启动器登录检测改为容器驱动 ✅
- [x] `launcher/core/launcher.mjs`
  - 为 `xiaohongshu_*` profile 引入容器驱动登录检测：通过 `containers:match` 查找 `*.login_anchor` / `xiaohongshu_login.login_guard`。
  - 仅当 profile 以 `xiaohongshu` 开头时走容器逻辑；其他平台（如 weibo）暂时保留旧的 DOM 逻辑。
  - 登录检测不再依赖小红书 DOM 结构（`a[title="我"]` 等），与容器库的“登录锚点约定”保持一致。
- [x] 保持启动流程：
  - `scripts/start-headful.mjs` 依旧只负责参数解析与调用 `launcher/core/launcher.mjs`。
  - Headful 启动后的“等待用户登录”循环仍然存在，但状态来源已经统一为容器驱动模型。

## 进度总结
- [x] 登录锚点模型定义（容器库 + 文档）
- [x] 容器化登录状态检查文档 + AGENTS 规则更新（登录锚点模型）
- [x] `status-v2.mjs` 脚本（完全基于容器驱动的登录检测）
- [x] Phase 1 登录脚本重构为容器驱动（`phase1-session-login.mjs`）
- [x] EnsureLoginBlock 创建（`modules/workflow/blocks/EnsureLoginBlock.ts`）
- [ ] 通用 Workflow 框架（EnsureLogin + GoToSearch + 评论展开等）
- [ ] 完整 Workflow 集成测试

## 下一步行动
1. 运行 `node scripts/xiaohongshu/tests/status-v2.mjs` + `phase1-session-login.mjs`，验证容器驱动的登录检查在一键启动后正常工作。
2. 基于 `EnsureLoginBlock` 和 `EnsureSession` 设计第一个小红书登录 Workflow（登录到主页 / 搜索页），并落地到 `modules/workflow/workflows/`。
3. 对应更新/新增 Phase 2/3 测试脚本（搜索页 / 详情页 + 评论展开），保证与当前容器库和 Workflow 一致。
4. 在集成 Workflow 上做小规模采集测试（5~10 条），验证图片、正文与评论链路。

## 参考文档
- `container-library/xiaohongshu/README.md` - 容器定义 + 登录锚点约定
- `modules/workflow/blocks/XiaohongshuCrawlerBlock.ts` - 当前采集逻辑
- `AGENTS.md` - 架构规则
- `docs/xiaohongshu-next-steps.md` - 详细任务清单
- `docs/xiaohongshu-workflow-summary.md` - 实施总结
