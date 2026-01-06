# 小红书 Workflow 实施总结

## ✅ 已完成工作

### 1. 容器库架构
根据 `container-library/xiaohongshu/README.md`，完整实现了以下容器：

#### 根容器
- `xiaohongshu_search`: 搜索结果页 (`.feeds-page`)
- `xiaohongshu_detail`: 笔记详情页 (`.note-detail-mask`)
- `xiaohongshu_login`: 登录页
- `xiaohongshu_home`: 主页/推荐流

#### 搜索页容器层次
```
xiaohongshu_search/
├── login_anchor/          # 登录锚点
├── search_bar/            # 搜索框
└── search_result_list/    # 结果列表
    └── search_result_item/  # 单个结果项
```

**search_result_item 核心能力**:
- `extract`: 提取 title/link/detail_url/image/text/note_id/xsec_token
- `navigate`: 直接读取 `a[href*='/explore/']` 并执行 `window.location.href`
- `click`: 点击图片获取带 xtoken 的 URL

#### 详情页容器层次
```
xiaohongshu_detail/
├── login_anchor/
└── modal_shell/           # 详情模态框 (.note-detail-mask)
    ├── header/            # 作者信息
    ├── content/           # 正文
    ├── gallery/           # 图片区域
    └── comment_section/   # 评论区域
        ├── show_more_button/  # 展开更多回复
        ├── comment_item/      # 评论项
        ├── end_marker/        # "THE END" 标记
        └── empty_state/       # 无评论状态
```

**comment_section 核心能力**:
- `scroll`: 向下滚动加载更多评论
- `find-child`: 查找并触发 `show_more_button` 的自动点击
- 自动检测 `end_marker` 和 `empty_state` 判断评论加载完成

### 2. Workflow Block 实现

#### XiaohongshuCrawlerBlock
完整实现的主采集 Block，位于 `modules/workflow/blocks/XiaohongshuCrawlerBlock.ts`:

**核心功能**:
1. **登录守护**: `ensureLoginState()` - 检测登录页并等待人工登录
2. **搜索管理**: `runSearch()` + `ensureSearchPageContext()`
3. **列表采集**: `collectSearchItems()` - 基于容器树提取搜索结果
4. **详情导航**: `openDetailFromItem()` - 使用 `navigate` operation
5. **评论展开**: `scrollComments()` - 自动滚动并触发展开按钮
6. **数据提取**: `collectDetailData()` - 提取header/content/gallery/comments
7. **图片下载**: `saveNoteData()` - 保存 Markdown + 图片
8. **去重机制**: 基于已存在目录的 note_id 去重

**数据流**:
```
搜索页 → match SEARCH_ROOT → find SEARCH_LIST → extract SEARCH_ITEM
  ↓
navigate → wait DETAIL_ROOT → find MODAL_SHELL
  ↓
extract HEADER/CONTENT/GALLERY → scroll COMMENT_SECTION → extract COMMENT_ITEM
  ↓
save Markdown + images → close modal → back to search
```

### 3. Debug 脚本（新增）

创建了3个原子化调试脚本：

#### scripts/debug-xhs-status.mjs
- 获取当前 URL
- 截图当前页面
- 分析 DOM 摘要（`.note-item`、`#search-input`、登录锚点）
- 高亮关键元素

#### scripts/debug-xhs-search.mjs
- 确保在小红书页面
- 高亮搜索框
- 随机选择关键字（oppo小平板/手机膜/雷军/小米/华为/鸿蒙）
- 执行搜索并等待结果稳定

#### scripts/debug-xhs-detail.mjs
- 获取列表第一个笔记
- 高亮并打开详情页
- 检查详情页加载（Modal/Title/Comments）
- 自动展开评论（滚动 + 点击展开按钮）
- 统计评论数量和状态

### 4. Workflow 定义
`modules/workflow/definitions/xiaohongshu-collect-workflow.ts`:
```typescript
{
  id: 'xiaohongshu-collect',
  name: '小红书关键词采集',
  steps: [
    { blockName: 'StartBrowserService', ... },
    { blockName: 'EnsureSession', ... },
    { blockName: 'XiaohongshuCrawlerBlock', ... }
  ]
}
```

## 📋 调试计划（按 task.md）

### Step 1: 状态诊断 ✅
```bash
node scripts/debug-xhs-status.mjs
```
验证：
- 当前 URL
- DOM 结构
- 关键元素高亮

### Step 2: 搜索验证 ⏳
```bash
node scripts/debug-xhs-search.mjs
```
验证：
- 搜索框定位
- 关键字轮换
- 结果加载

### Step 3: 详情页交互 ⏳
```bash
node scripts/debug-xhs-detail.mjs
```
验证：
- 详情页打开
- 评论展开
- 数据完整性

### Step 4: 完整 Workflow ⏳
```bash
# 方式1: 直接调用 Block
node -e "import('./modules/workflow/blocks/XiaohongshuCrawlerBlock.ts').then(m => m.execute({ sessionId: 'xiaohongshu_fresh', keyword: 'oppo小平板', targetCount: 5 }))"

# 方式2: 通过 Workflow Runner
node scripts/run-xiaohongshu-workflow.ts
```

## 🔧 技术栈

- **统一 API**: `http://127.0.0.1:7701` (HTTP/WS/Bus)
- **Browser Service**: `http://127.0.0.1:7704` + `ws://127.0.0.1:8765`
- **容器操作**: `/v1/container/<containerId>/execute`
- **Controller 动作**: `/v1/controller/action`
- **事件总线**: `ws://127.0.0.1:7701/bus` (订阅 `container:*`/`ui:*`)

## 🚨 已知问题与对策

### 1. Navigation Context Destroyed
**问题**: 页面跳转时脚本执行被中断
**对策**: 
- `waitForDetailContext()` - 轮询等待详情容器出现
- `ensureSearchPageContext()` - 确保回到搜索页后重新匹配

### 2. 评论展开时机
**问题**: 动态加载的评论需要滚动触发
**对策**:
- `scrollComments()` - 多轮滚动 + `find-child` 触发 `show_more_button`
- 检测 `end_marker` 和 `empty_state` 判断结束

### 3. 图片下载反爬
**问题**: 小红书图片需要 UA + Cookie
**对策**:
- `fetchBrowserHeaders()` - 读取浏览器 UA 和 Cookie
- 重试机制（最多3次）

## 📁 输出结构

```
~/.webauto/download/xiaohongshu/{keyword}/
  ├── {title}_{noteId}/
  │   ├── content.md
  │   └── images/
  │       ├── 1.jpg
  │       ├── 2.jpg
  │       └── ...
  └── ...
```

### Markdown 格式
```markdown
# 标题

- **关键字**: oppo小平板
- **作者**: xxx | [主页](link)
- **Note ID**: 12345
- **评论统计**: 10 条 / 结尾标记：是 / 空状态：否

## 正文
（正文内容）

## 图片
![](./images/1.jpg)
![](./images/2.jpg)

## 评论（10）
### 1. 用户名 (userId)
- 时间：2025-01-05

评论内容...
```

## 🎯 下一步

1. **运行 Debug 脚本**: 验证当前 Session 状态
2. **调整容器定义**: 根据实际 DOM 微调选择器
3. **测试完整流程**: 5条数据小规模测试
4. **优化性能**: 减少等待时间、提高提取成功率
5. **扩展 Block**: 支持更多操作（如批量导出、数据分析）

## 📝 参考文档

- `container-library/xiaohongshu/README.md` - 容器定义规范
- `modules/workflow/blocks/XiaohongshuCrawlerBlock.ts` - 主采集逻辑
- `task.md` - 任务追踪与调试计划
- `AGENTS.md` - 架构设计原则

