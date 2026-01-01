# Workflow Builder 使用指南

## 概述

Workflow Builder 提供两种模式：
1. **AI 辅助交互式构建** - 使用 AI 自动分析 DOM 并生成容器定义
2. **自动化执行** - 基于已定义的容器自动执行工作流

## 前置条件

### 1. 启动 WebAuto 服务
```bash
node scripts/start-headful.mjs
```

### 2. 启动本地 AI 服务（用于 DOM 分析）
```bash
# 确保本地 AI 服务运行在 http://127.0.0.1:5555
# 支持 OpenAI 兼容的 API 接口 /v1/chat/completions
# 无需 API Key
```

## 使用流程

### 模式 1: AI 辅助交互式构建容器

#### Step 1: 启动交互式构建器
```bash
node scripts/build-container.mjs weibo_fresh https://weibo.com
```

#### Step 2: 回答交互式问题

**问题 1: 容器描述**
```
容器描述: 微博首页的 Feed 列表容器
```

AI 会分析页面 HTML 并建议选择器：
```
AI 建议的选择器: main[class*='Main_wrap_'] div[class*='Home_feed_']
置信度: 0.95
说明: 这是微博首页的主 Feed 容器...
```

**问题 2: 确认或修改选择器**
```
是否满意这个选择器？(y/n): y
```

**问题 3: 是否需要分析子容器**
```
是否需要分析子容器？(y/n): y
子容器描述（例如：单个帖子容器）: 单个微博帖子
```

**问题 4: 定义字段**
```
字段名（如 author）: author
author 的描述: 发帖人的用户名链接

字段名（如 author）: content
content 的描述: 帖子的文本内容

字段名（如 author）: timestamp
timestamp 的描述: 发帖时间

字段名（如 author）: [空行结束]
```

**问题 5: 保存容器定义**
```
容器 ID（如 weibo_main_page.feed_list）: weibo_main_page.feed_list
容器类型（page/collection/content）: collection
是否保存到文件？(y/n): y
```

#### Step 3: 生成的容器定义

```json
{
  "id": "weibo_main_page.feed_list",
  "name": "自动生成的容器 - weibo_main_page.feed_list",
  "type": "collection",
  "capabilities": ["highlight", "extract"],
  "selectors": [
    {
      "css": "main[class*='Main_wrap_'] div[class*='Home_feed_']",
      "variant": "primary",
      "score": 1.0
    }
  ],
  "operations": [
    {
      "type": "extract",
      "config": {
        "fields": {
          "author": "header a[href*='weibo.com']",
          "content": "div[class*='detail_wbtext']",
          "timestamp": "time"
        }
      }
    }
  ]
}
```

### 模式 2: 自动化执行工作流

#### Step 1: 确保容器定义已存在
确认 `container-library/weibo/weibo_main_page/` 下有相关容器定义。

#### Step 2: 运行工作流
```typescript
import { WorkflowBuilder } from '@webauto/workflow-builder';

const builder = new WorkflowBuilder();

// 订阅事件
builder.emitter.subscribe((event) => {
  if (event.type === 'workflow:status') {
    console.log(`[${event.payload.phase}] ${event.payload.message}`);
  } else if (event.type === 'workflow:log') {
    console.log(`[${event.payload.level}] ${event.payload.message}`);
  }
});

// 执行工作流
const result = await builder.buildWeiboFeedWorkflow({
  profile: 'weibo_fresh',
  url: 'https://weibo.com',
  targetCount: 50,
  scrollLimit: 30,
  highlight: {
    containerStyle: '3px dashed #fbbc05',
    postStyle: '2px solid #2196F3',
    extractStyle: '2px solid #00C853'
  }
});

console.log(`提取了 ${result.posts.length} 个帖子`);
console.log(`去重后的链接: ${result.dedupedLinks.length} 个`);
```

## 示例：完整的微博 Feed 提取流程

### 1. 构建容器定义（一次性）
```bash
# 启动服务
node scripts/start-headful.mjs

# 启动 AI 服务（确保运行在 http://127.0.0.1:5555）

# 运行交互式构建器
node scripts/build-container.mjs weibo_fresh https://weibo.com
```

### 2. 执行自动化工作流（可重复）
```bash
node modules/workflow-builder/tests/workflow-builder.test.mts
```

## 输出结果

工作流执行完成后，会返回：
```json
{
  "posts": [
    {
      "id": "weibo_main_page.feed_post_1234",
      "links": [
        { "href": "https://weibo.com/1234/ABC", "text": "查看详情" }
      ],
      "author": "用户名",
      "content": "帖子内容...",
      "timestamp": "2小时前"
    }
  ],
  "dedupedLinks": [
    "https://weibo.com/1234/ABC",
    "https://weibo.com/5678/DEF"
  ]
}
```

## 高级功能

### 1. 自定义 AI Provider
```typescript
const builder = new InteractiveDOMBuilder({
  provider: {
    baseUrl: 'http://your-ai-server.com',
    model: 'gpt-4-turbo',
    apiKey: 'your-api-key' // 可选
  },
  profile: 'weibo_fresh',
  url: 'https://weibo.com'
});
```

### 2. 事件驱动的工作流
```typescript
import { WorkflowExecutor } from '@webauto/workflow-builder';

const executor = new WorkflowExecutor();

// 订阅事件
executor.emitter.subscribe((event) => {
  console.log(event);
});

// 执行事件驱动的工作流
const result = await executor.executeEventDrivenWorkflow({
  profile: 'weibo_fresh',
  url: 'https://weibo.com',
  targetCount: 50,
  scrollLimit: 30
});
```

## 故障排查

### 问题 1: AI 服务连接失败
```
错误: AI API error: 500 Internal Server Error
```

**解决方案**:
- 确认 AI 服务运行在 http://127.0.0.1:5555
- 确认服务支持 `/v1/chat/completions` 接口
- 检查服务日志

### 问题 2: 容器匹配失败
```
错误: Container match failed
```

**解决方案**:
- 确认 WebAuto 服务正在运行
- 确认 profile 已创建并登录
- 手动检查页面是否加载完成

### 问题 3: 选择器失效
```
错误: No elements found
```

**解决方案**:
- 页面 DOM 结构可能已变化
- 重新运行交互式构建器更新选择器
- 使用浏览器 DevTools 手动验证选择器

## 总结

Workflow Builder 结合了：
- ✅ AI 辅助的 DOM 分析（半自动）
- ✅ 交互式容器定义构建（人工确认）
- ✅ 自动化的工作流执行（全自动）
- ✅ 实时状态监控和日志
- ✅ 事件驱动的操作触发

**核心价值**：将一次性的人工分析工作，通过 AI 辅助转化为可复用的自动化工作流。
