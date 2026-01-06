# 小红书 Workflow - 下一步任务清单

## ✅ 已完成

1. **容器库架构** - 完整实现了搜索页、详情页、评论区等所有容器定义
2. **Workflow Block** - `XiaohongshuCrawlerBlock.ts` 实现了完整采集逻辑
3. **Debug 脚本** - 创建了 `debug-xhs-status/search/detail.mjs` 三个阶段测试脚本
4. **AGENTS.md 规则** - 新增"调试脚本必须保持浏览器会话不被破坏"规则

## 📋 当前问题分析

### 问题 1: 调试脚本频繁重启浏览器 ❌
**现状**:
- `scripts/xiaohongshu-test-comments.mjs` 中有 `startBrowserSession()` 逻辑
- 每次运行都可能调用 `start-headful.mjs` 启动新会话
- 破坏了现有 session 状态

**需要修改**:
- `xiaohongshu-test-comments.mjs`
- 其他可能启动新session的测试脚本

### 问题 2: 频繁导航到同一页面 ❌
**现状**:
- `debug-xhs-search.mjs` 中有 `ensureSearchPage()` 会直接跳转
- 没有先检查当前URL是否已经在目标页面

**需要修改**:
- 在导航前先检查 `getCurrentUrl()`
- 如果已在目标页，只刷新而不重新导航

### 问题 3: 脚本不是 unattached 模式 ❌
**现状**:
- 测试脚本直接操作浏览器，可能改变会话状态
- 没有明确的"只读"或"非侵入"模式

**需要改进**:
- 明确标记哪些操作是只读的（如 status 检查）
- 哪些操作会改变状态（如 search、navigate）
- 提供恢复机制（如记录初始 URL，测试后恢复）

## 🎯 下一步任务（按优先级排序）

### Task 1: 修改现有调试脚本为 unattached 模式 ⏳

**目标**: 让调试脚本复用现有 session，不重启浏览器

**子任务**:

1. **修改 `debug-xhs-status.mjs`** ✅
   - ✅ 已经符合要求：仅读取状态，不改变页面
   - ✅ 使用现有 PROFILE，不启动新session
   
2. **修改 `debug-xhs-search.mjs`** ⏳
   - [ ] `ensureSearchPage()` 改为先检查当前URL
   - [ ] 如果已在搜索页，优先使用 `location.reload()` 而非重新导航
   - [ ] 记录初始URL，测试完成后可选恢复
   
3. **修改 `debug-xhs-detail.mjs`** ⏳
   - [ ] 检查当前是否已在搜索页
   - [ ] 测试完成后关闭详情模态，恢复到搜索页
   - [ ] 不强制导航，优先使用现有页面状态

4. **修改 `xiaohongshu-test-comments.mjs`** ⏳
   - [ ] 移除 `startBrowserSession()` 自动启动逻辑
   - [ ] 改为检测session不存在时，提示用户手动启动
   - [ ] 或者提供 `--ensure-session` flag，明确需要时才启动

**修改原则**:
```javascript
// ❌ 旧方式 - 直接导航
async function ensureSearchPage() {
  await controllerAction('browser:execute', {
    script: `window.location.href = 'https://www.xiaohongshu.com'`
  });
}

// ✅ 新方式 - 检查后刷新或导航
async function ensureSearchPage() {
  const url = await getCurrentUrl();
  if (url.includes('xiaohongshu.com/search_result')) {
    console.log('   ✅ 已在搜索页，刷新...');
    await controllerAction('browser:execute', {
      script: 'location.reload()'
    });
  } else if (url.includes('xiaohongshu.com')) {
    console.log('   ⚠️  在小红书其他页面，导航到搜索...');
    await controllerAction('browser:execute', {
      script: `window.location.href = 'https://www.xiaohongshu.com/search_result?...'`
    });
  } else {
    console.log('   ❌ 不在小红书页面，请先手动导航');
    process.exit(1);
  }
}
```

### Task 2: 创建 Session 检查脚本 ⏳

**目标**: 提供统一的 session 状态检查工具

**文件**: `scripts/check-xiaohongshu-session.mjs`

**功能**:
- 检查 `xiaohongshu_fresh` session 是否存在
- 显示当前 URL
- 显示登录状态
- 显示 Cookie 过期时间
- 给出启动建议（如果 session 不存在）

**用法**:
```bash
node scripts/check-xiaohongshu-session.mjs
```

### Task 3: 更新测试脚本文档 ⏳

**目标**: 明确测试流程和最佳实践

**文件**: `docs/testing-xiaohongshu.md`

**内容**:
1. **Session 管理规范**
   - 启动 session：`node scripts/start-headful.mjs --profile xiaohongshu_fresh --url https://www.xiaohongshu.com`
   - 检查 session：`node scripts/check-xiaohongshu-session.mjs`
   - Session 应保持运行，不要频繁重启

2. **测试流程**
   ```bash
   # 1. 启动 session（仅首次或session丢失时）
   node scripts/start-headful.mjs --profile xiaohongshu_fresh --url https://www.xiaohongshu.com
   
   # 2. 运行阶段测试（session 保持运行）
   node scripts/debug-xhs-status.mjs    # Step 1: 状态诊断
   node scripts/debug-xhs-search.mjs    # Step 2: 搜索验证
   node scripts/debug-xhs-detail.mjs    # Step 3: 详情页交互
   
   # 3. 完整 workflow 测试
   node scripts/run-xiaohongshu-workflow.ts --keyword "oppo小平板" --count 5
   ```

3. **调试技巧**
   - 使用 Bus 订阅监听事件：`wscat -c ws://127.0.0.1:7701/bus`
   - 查看容器匹配日志：检查 `container:match` 事件
   - 截图调试：在脚本中增加 `takeScreenshot()` 调用

### Task 4: 优化 XiaohongshuCrawlerBlock ⏳

**目标**: 根据实际测试结果优化 Block 逻辑

**待优化点**:
1. **Context Destroyed 处理**
   - [ ] 增加 retry 机制
   - [ ] 优化 `waitForDetailContext()` 的轮询策略
   
2. **评论展开优化**
   - [ ] 根据实际 DOM 调整滚动距离和次数
   - [ ] 优化 `show_more_button` 的查找逻辑
   
3. **图片下载优化**
   - [ ] 增加并发控制
   - [ ] 优化重试策略
   
4. **性能优化**
   - [ ] 减少不必要的等待时间
   - [ ] 并行处理部分操作

### Task 5: 小规模验证测试 ⏳

**目标**: 运行完整 workflow，采集 5 条数据验证

**步骤**:
```bash
# 1. 确保 session 运行
node scripts/check-xiaohongshu-session.mjs

# 2. 运行 workflow（小规模）
node scripts/run-xiaohongshu-workflow.ts --keyword "手机膜" --count 5

# 3. 检查输出
ls -la ~/.webauto/download/xiaohongshu/手机膜/

# 4. 验证数据完整性
# - Markdown 格式正确
# - 图片下载成功
# - 评论数据完整
```

## 🔄 迭代计划

### 第一轮：基础功能验证（本周）
- [x] 创建调试脚本
- [x] 补充 AGENTS.md 规则
- [ ] 修改脚本为 unattached 模式
- [ ] 运行 5 条数据测试

### 第二轮：稳定性优化（下周）
- [ ] 优化 Context Destroyed 问题
- [ ] 优化评论展开逻辑
- [ ] 增加错误恢复机制
- [ ] 运行 50 条数据测试

### 第三轮：性能优化（后续）
- [ ] 并行采集优化
- [ ] 图片下载优化
- [ ] 增加增量采集支持
- [ ] 运行 200+ 条数据测试

## 📊 预期成果

- ✅ 调试流程清晰，session 状态稳定
- ✅ 容器匹配成功率 > 95%
- ✅ 评论展开成功率 > 90%
- ✅ 图片下载成功率 > 85%
- ✅ 平均每条数据采集时间 < 30秒

## 🚨 风险提示

1. **反爬策略变化**：小红书可能随时调整 DOM 结构或增加反爬措施
2. **评论加载时机**：动态加载的评论可能需要更长等待时间
3. **图片防盗链**：图片 URL 可能短期有效，需要及时下载

## 📝 相关文档

- `container-library/xiaohongshu/README.md` - 容器定义
- `modules/workflow/blocks/XiaohongshuCrawlerBlock.ts` - 采集逻辑
- `task.md` - 任务追踪
- `AGENTS.md` - 架构规则
- `docs/xiaohongshu-workflow-summary.md` - 实施总结
