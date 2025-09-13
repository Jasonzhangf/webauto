# WebAuto Browser Assistant

[![npm version](https://badge.fury.io/js/@webauto%2Fbrowser-assistant.svg)](https://badge.fury.io/js/@webauto%2Fbrowser-assistant)
[![Build Status](https://github.com/webauto/browser-assistant/workflows/Build/badge.svg)](https://github.com/webauto/browser-assistant/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

智能浏览器自动化助手，基于 Camoufox 和 AI 驱动的页面分析。结合了 stagehand 的智能观察理念和 Camoufox 的反指纹识别技术，提供强大的页面理解和内容提取能力。

## ✨ 特性

### 🧠 智能页面分析
- **页面类型识别**: 自动检测单列/网格、无限/分页布局
- **内容结构理解**: 识别帖子列表、评论区、用户信息等
- **AI 驱动**: 支持大语言模型增强的页面理解
- **Accessibility Tree**: 基于无障碍树的准确页面解析

### 🚀 高效自动化
- **Camoufox 集成**: 基于 Firefox 的反检测浏览器
- **智能元素定位**: 多重策略确保元素查找成功率
- **错误恢复机制**: 自动重试和智能降级策略
- **性能优化**: 缓存机制和并发控制

### 📊 内容提取
- **结构化数据**: 自动提取帖子、评论、用户信息
- **多媒体支持**: 图片、视频等内容识别
- **交互数据**: 点赞、评论、分享等社交数据
- **滚动分析**: 检测动态加载和分页机制

### 🔧 开发友好
- **TypeScript 支持**: 完整的类型定义
- **模块化设计**: 易于扩展和定制
- **WebSocket 控制**: 实时远程操作接口
- **RCC 基础**: 基于 WebAuto RCC 统一架构

## 📦 安装

```bash
npm install @webauto/browser-assistant
```

## 🚀 快速开始

### 基础使用

```typescript
import { BrowserAssistant } from '@webauto/browser-assistant';

async function basicExample() {
  const assistant = new BrowserAssistant({
    browser: {
      headless: false,
      viewport: { width: 1280, height: 720 }
    },
    observation: {
      enableAI: true,
      confidenceThreshold: 0.8
    }
  });

  await assistant.initialize();

  try {
    // 页面分析
    const analysis = await assistant.analyzePage('https://example.com');
    console.log(`页面类型: ${analysis.type}`);
    console.log(`元素数量: ${analysis.metadata.elementCount}`);

    // 内容提取
    const content = await assistant.getContentExtractor().extractContent(analysis.structure);
    console.log(`提取到 ${content.posts.length} 个帖子`);

  } finally {
    await assistant.close();
  }
}
```

### 快速函数

```typescript
import { analyzePage, extractContent } from '@webauto/browser-assistant';

// 快速页面分析
const analysis = await analyzePage('https://example.com');

// 快速内容提取
const content = await extractContent('https://example.com');
```

### 页面类型分析

```typescript
import { PageAnalyzer } from '@webauto/browser-assistant';

const assistant = await createBrowserAssistant();
await assistant.initialize();

const pageAnalyzer = assistant.getPageAnalyzer();

// 分析页面布局和分页类型
const structure = await pageAnalyzer.analyzePageStructure();
console.log(`布局类型: ${structure.layoutType}`); // single_column_infinite, grid_paginated, etc.
console.log(`分页类型: ${structure.paginationType}`); // infinite_scroll, load_more, etc.

// 获取关键选择器
console.log(`主内容: ${structure.mainContentSelector}`);
console.log(`帖子列表: ${structure.postListSelector}`);
console.log(`单个帖子: ${structure.postItemSelector}`);
```

### 内容提取

```typescript
import { ContentExtractor } from '@webauto/browser-assistant';

const extractor = assistant.getContentExtractor();

// 提取帖子数据
const content = await extractor.extractContent(structure);

content.posts.forEach(post => {
  console.log(`标题: ${post.title}`);
  console.log(`作者: ${post.author?.name}`);
  console.log(`内容: ${post.content?.substring(0, 100)}...`);
  console.log(`图片: ${post.images?.length || 0} 张`);
  console.log(`评论: ${post.comments?.length || 0} 条`);
});
```

### 列表分析

```typescript
import { ListAnalyzer } from '@webauto/browser-assistant';

const listAnalyzer = assistant.getListAnalyzer();

// 分析列表结构
const listAnalysis = await listAnalyzer.analyzeListStructure();

// 回答用户的核心问题
console.log('重复最多的元素:', listAnalysis.repeatingElements[0]);
console.log('最大面积元素:', listAnalysis.largestVisibleElement);
console.log('变化元素:', listAnalysis.changingElements);

// 滚动分析
const scrollAnalysis = await listAnalyzer.analyzeScrollChanges();
console.log(`动态元素: ${scrollAnalysis.dynamicElements.length}`);
console.log(`无限滚动: ${scrollAnalysis.infiniteScrollDetected}`);
```

## 🔧 配置选项

### 完整配置

```typescript
const config = {
  // 浏览器配置
  browser: {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    locale: ['zh-CN', 'en-US'],
    userAgent: 'custom-user-agent',
    cookies: [
      {
        name: 'session_id',
        value: 'your-session',
        domain: '.example.com'
      }
    ]
  },

  // 观察配置
  observation: {
    enableAI: true,                    // 启用 AI 分析
    confidenceThreshold: 0.7,          // 置信度阈值
    cacheResults: true,                // 缓存结果
    maxCacheSize: 1000,                // 最大缓存数量
    cacheTTL: 3600000                  // 缓存过期时间 (1小时)
  },

  // 操作配置
  operations: {
    enableSmartRecovery: true,         // 启用智能恢复
    maxRetries: 3,                     // 最大重试次数
    timeout: 30000,                    // 操作超时时间
    retryDelay: 1000                   // 重试延迟
  },

  // Cookie 管理
  cookies: {
    autoSave: true,                    // 自动保存
    storagePath: './cookies',          // 存储路径
    encryptionKey: 'your-secret-key',  // 加密密钥
    autoCleanup: true,                 // 自动清理
    cleanupInterval: 86400000          // 清理间隔 (24小时)
  },

  // WebSocket 控制
  websocket: {
    enabled: true,                     // 启用 WebSocket
    port: 8080,                        // 端口号
    cors: true,                        // 启用 CORS
    maxConnections: 100,               // 最大连接数
    heartbeatInterval: 30000           // 心跳间隔
  },

  // 日志配置
  logging: {
    level: 'info',                     // 日志级别
    enableConsole: true,               // 控制台输出
    enableFile: false,                 // 文件输出
    filePath: './logs/browser-assistant.log'
  }
};
```

## 📖 API 文档

### BrowserAssistant

主要的浏览器助手类，提供统一的 API。

#### 方法

- `initialize()` - 初始化助手
- `analyzePage(url)` - 分析页面
- `observePage(url, options)` - 观察页面元素
- `executeOperation(operation, params)` - 执行操作
- `close()` - 关闭助手

### PageAnalyzer

页面分析器，提供页面结构和类型分析。

#### 方法

- `analyzePageStructure()` - 分析页面结构
- `detectLayoutType()` - 检测布局类型
- `detectPaginationType()` - 检测分页类型
- `findMainContentSelector()` - 查找主内容选择器

### ContentExtractor

内容提取器，提取页面中的结构化数据。

#### 方法

- `extractContent(structure)` - 提取内容
- `extractPosts(structure)` - 提取帖子
- `extractComments(postSelector)` - 提取评论

### ListAnalyzer

列表分析器，分析页面中的列表结构。

#### 方法

- `analyzeListStructure()` - 分析列表结构
- `analyzeScrollChanges()` - 分析滚动变化
- `findRepeatingElements()` - 查找重复元素

## 🎯 使用场景

### 1. 社交媒体监控

```typescript
// 监控社交媒体平台
const analysis = await analyzePage('https://social-media.com/profile');

const socialFeatures = analysis.socialFeatures;
console.log(`用户资料: ${socialFeatures.hasUserProfiles}`);
console.log(`媒体内容: ${socialFeatures.hasMediaContent}`);
console.log(`参与度: ${socialFeatures.engagementLevel}`);
```

### 2. 论坛内容提取

```typescript
// 提取论坛帖子
const content = await extractContent('https://forum.com/topic');

content.posts.forEach(post => {
  // 处理帖子和评论
  saveToDatabase(post);
});
```

### 3. 电商价格监控

```typescript
// 监控商品价格
const analysis = await analyzePage('https://shop.com/product');

if (analysis.type === 'product') {
  const price = await assistant.executeOperation('extractText', {
    selector: '.price',
    page: assistant.getBrowserManager().newPage()
  });
  
  checkPriceAlert(price);
}
```

### 4. 新闻网站抓取

```typescript
// 抓取新闻文章
const content = await extractContent('https://news.com');

content.posts.forEach(article => {
  console.log(`标题: ${article.title}`);
  console.log(`作者: ${article.author?.name}`);
  console.log(`发布时间: ${article.date}`);
  console.log(`内容长度: ${article.content?.length}`);
});
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --testNamePattern="PageAnalyzer"

# 监视模式
npm run test:watch
```

## 📦 发布

### 开发版本

```bash
# 构建项目
npm run build

# 运行示例
npm run example
npm run example:advanced
npm run example:analysis
```

### 发布版本

```bash
# 运行发布脚本
node scripts/publish.js

# 或手动发布
npm run clean
npm run build
npm publish
```

## 🤝 贡献

欢迎贡献！请阅读 [贡献指南](CONTRIBUTING.md) 了解详情。

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关链接

- [Camoufox 文档](https://docs.camoufox.com)
- [Playwright 文档](https://playwright.dev)
- [WebAuto RCC](https://github.com/webauto/rcc-core)
- [Stagehand](https://github.com/browserbase/stagehand)

## 📞 支持

如有问题，请：

1. 查看 [文档](docs/)
2. 搜索现有 [Issues](https://github.com/webauto/browser-assistant/issues)
3. 创建新的 [Issue](https://github.com/webauto/browser-assistant/issues/new)

---

**WebAuto Browser Assistant** - 让浏览器自动化更智能！ 🚀