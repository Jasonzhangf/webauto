# Workflow Builder 架构设计

## 核心理念

**Workflow Builder 不是完全自动化的 DOM 分析工具，而是一个半自动化的工作流构建助手**

## 工作流程

### 1. 人工分析阶段（必须）
- 开发者打开浏览器，访问目标页面
- 使用浏览器 DevTools 手动分析 DOM 结构
- 识别关键容器的 CSS 选择器
- 记录容器的层级关系

### 2. 容器定义阶段（半自动）
- 开发者在 `container-library` 中创建容器定义 JSON
- 定义容器的 selectors、capabilities、operations
- WorkflowBuilder 提供验证和测试工具

### 3. 工作流构建阶段（自动化）
- WorkflowBuilder 根据容器定义自动匹配 DOM
- 自动生成高亮、提取、滚动等操作序列
- 提供实时反馈和状态订阅

### 4. 工作流执行阶段（自动化）
- 执行预定义的操作序列
- 监控状态，记录日志
- 提供错误恢复机制

## 为什么不能完全自动化 DOM 分析？

1. **语义理解问题**
   - 无法自动判断哪些 `<div>` 是"帖子容器"
   - 无法自动识别"作者"、"内容"、"时间戳"等字段

2. **动态性问题**
   - 微博等网站使用动态 class 名（如 `Feed_wrap_3g67Q`）
   - 需要人工识别稳定的结构模式

3. **业务逻辑问题**
   - 不同业务需要提取不同的数据
   - 需要人工定义提取规则

## WorkflowBuilder 提供的自动化能力

### ✅ 自动化部分
1. **容器匹配**：根据预定义的选择器自动匹配 DOM 节点
2. **操作执行**：自动执行高亮、提取、滚动等操作
3. **状态管理**：自动跟踪工作流状态和进度
4. **事件订阅**：自动监听容器出现、消失等事件
5. **数据去重**：自动去重提取的链接
6. **错误处理**：自动重试和错误恢复

### ❌ 需要人工的部分
1. **DOM 分析**：识别目标容器的选择器
2. **容器定义**：创建容器定义 JSON
3. **提取规则**：定义字段提取的 CSS 选择器
4. **业务逻辑**：决定提取哪些数据、如何处理

## 实际使用流程

### Step 1: 人工分析（一次性）
```bash
# 1. 开发者打开浏览器
open https://weibo.com

# 2. 使用 DevTools 分析
# - 找到 Feed 列表容器：main[class*='Main_wrap_'] div[class*='Home_feed_']
# - 找到单个帖子容器：article[class*='Feed_wrap_']
# - 找到作者字段：header a[href*='weibo.com']
```

### Step 2: 创建容器定义（一次性）
```json
{
  "id": "weibo_main_page.feed_post",
  "selectors": [
    { "css": "article[class*='Feed_wrap_']", "score": 1.0 }
  ],
  "operations": [
    {
      "type": "extract",
      "config": {
        "fields": {
          "author": "header a[href*='weibo.com']",
          "content": "div[class*='detail_wbtext']"
        }
      }
    }
  ]
}
```

### Step 3: 使用 WorkflowBuilder（自动化）
```typescript
const builder = new WorkflowBuilder();

// 订阅状态
builder.emitter.subscribe((event) => {
  console.log(event);
});

// 执行工作流
const result = await builder.buildWeiboFeedWorkflow({
  profile: 'weibo_fresh',
  url: 'https://weibo.com',
  targetCount: 50,
  scrollLimit: 30
});

console.log(`Extracted ${result.posts.length} posts`);
```

## 辅助工具

### 1. 容器验证工具
```bash
# 验证容器定义是否正确
node modules/workflow-builder/tools/validate-container.mjs weibo_main_page.feed_post
```

### 2. 选择器测试工具
```bash
# 测试选择器是否匹配目标元素
node modules/workflow-builder/tools/test-selector.mjs "article[class*='Feed_wrap_']"
```

### 3. 高亮预览工具
```bash
# 在浏览器中高亮匹配的元素
node modules/workflow-builder/tools/preview-highlight.mjs weibo_main_page.feed_post
```

## 总结

WorkflowBuilder 的定位是：
- ✅ 自动化执行预定义的工作流
- ✅ 自动化管理状态和事件
- ✅ 自动化处理滚动和分页
- ❌ 不自动分析 DOM（需要人工）
- ❌ 不自动生成容器定义（需要人工）
- ❌ 不自动推断业务逻辑（需要人工）

**核心价值**：将一次性的人工分析工作，转化为可复用的自动化工作流。
