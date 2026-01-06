# WebAuto 任务追踪（小红书容器驱动化改造完成）

> 目标：实现基于 Workflow 的小红书深度采集（图片、全评论、去重），并确保调试过程高效、低风控。

## 核心原则
1. **Session 持久化**：禁止反复杀进程/重启服务。全程复用 `xiaohongshu_fresh` profile。
2. **容器驱动**：登录状态判定完全基于容器匹配，禁止在 workflow/脚本中硬编码 DOM 逻辑。
3. **原子化调试**：将大流程拆解为"状态检查"、"搜索"、"列表获取"、"详情进入"、"评论展开"等原子脚本。
4. **可视化确认**：利用高亮和截图确认锚点和页面状态。
5. **Unattached 模式**：调试脚本复用现有会话，优先刷新而非重新导航。

## 容器驱动化 - 已完成 ✅

### 登录锚点模型

| 状态 | 容器 ID | 选择器 |
|------|----------|--------|
| 已登录 | `*.login_anchor` | `a.link-wrapper[title="我"]` |
| 未登录 | `xiaohongshu_login.login_guard` | 登录页核心控件 |

### 关键文件改造

| 文件 | 改造内容 |
|------|----------|
| `launcher/core/launcher.mjs` | 容器驱动登录检测（移除硬编码 DOM） |
| `modules/workflow/blocks/EnsureLoginBlock.ts` | 通用登录 Block（基于容器 ID） |
| `scripts/xiaohongshu/tests/status-v2.mjs` | 容器驱动状态检查 |
| `scripts/xiaohongshu/tests/phase1-session-login.mjs` | 容器驱动登录守护 |
| `scripts/debug-xhs-search.mjs` | Unattached 模式搜索验证 |
| `scripts/debug-xhs-detail.mjs` | Unattached 模式详情页交互 |

### 容器库完整结构

```
xiaohongshu/
├── home/
│   ├── container.json
│   ├── login_anchor/
│   ├── feed_list/
│   └── feed_item/
├── search/
│   ├── container.json
│   ├── login_anchor/
│   ├── search_bar/
│   └── search_result_list/
│       └── search_result_item/
├── detail/
│   ├── container.json
│   ├── login_anchor/
│   ├── modal_shell/
│   ├── header/
│   ├── content/
│   ├── gallery/
│   └── comment_section/
│       ├── container.json
│       ├── show_more_button/
│       ├── comment_item/
│       ├── end_marker/
│       └── empty_state/
└── login/
    ├── container.json
    ├── login_button/
    └── login_guard/
```

## 当前状态 (2025-01-06 09:40)

### ✅ 已完成

1. **容器驱动登录检测**
   - Launcher 使用容器匹配判定登录状态
   - 所有脚本移除硬编码 DOM 逻辑
   - EnsureLoginBlock 提供可复用的登录验证

2. **容器库完整**
   - 小红书所有页面容器定义完整
   - 登录锚点模型统一
   - 子容器层级清晰

3. **调试脚本优化**
   - Unattached 模式（不重启会话）
   - 优先刷新而非重新导航
   - 测试后恢复初始状态

4. **文档完善**
   - 登录锚点约定（`container-library/xiaohongshu/README.md`）
   - 容器驱动化改造总结（`docs/xiaohongshu-container-driven-summary.md`）
   - AGENTS.md 规则更新

5. **代码提交**
   - 已提交到 GitHub（commit: ceaf8d3）

### ⏳ 待完成

#### Phase 1: 功能验证
```bash
# 1. 检查会话状态
node scripts/xiaohongshu/tests/status-v2.mjs

# 2. 搜索验证
node scripts/debug-xhs-search.mjs

# 3. 详情页交互测试
node scripts/debug-xhs-detail.mjs
```

#### Phase 2: Workflow 集成
- [ ] 创建完整 XHS Workflow（基于 EnsureLoginBlock）
- [ ] 优化 XiaohongshuCrawlerBlock 使用新架构
- [ ] 小规模测试（5 条数据）

#### Phase 3: 稳定性优化
- [ ] 修复 Context Destroyed 问题
- [ ] 优化评论展开逻辑
- [ ] 增加错误恢复机制

## 登录检测流程

```
1. Launcher / Workflow 调用 containers:match
   ↓
2. 获取容器树（包含所有页面容器）
   ↓
3. 递归查找 *.login_anchor
   ↓
4a. 匹配到 → 已登录，继续流程
   ↓
4b. 未匹配到，查找 xiaohongshu_login.login_guard
   ↓
5a. 匹配到 → 未登录，等待人工登录后重试
   ↓
5b. 未匹配到 → 不确定状态，报错或导航
```

## 下一步行动

1. **功能验证**（优先）
   ```bash
   # 运行容器驱动状态检查
   node scripts/xiaohongshu/tests/status-v2.mjs
   
   # 验证搜索功能
   node scripts/debug-xhs-search.mjs
   
   # 验证详情页交互
   node scripts/debug-xhs-detail.mjs
   ```

2. **Workflow 创建**
   - 使用 EnsureLoginBlock + 其他 Block 组装完整 Workflow
   - 测试小规模采集（5 条数据）

3. **Bug 修复**
   - 修复 XiaohongshuCrawlerBlock 中的 Context Destroyed 问题
   - 根据实际测试结果调整容器选择器

## 参考文档

- `container-library/xiaohongshu/README.md` - 容器定义 + 登录锚点约定
- `docs/xiaohongshu-container-driven-summary.md` - 容器驱动化改造总结
- `docs/xiaohongshu-next-steps.md` - 详细任务清单
- `AGENTS.md` - 架构规则 + Unattached 模式规则
- `task.md` - 当前任务追踪

---

**最后更新**：2025-01-06 09:40
**状态**：容器驱动化改造完成，待功能验证
