# WebAuto Browser Assistant

[![npm version](https://badge.fury.io/js/@webauto%2Fbrowser-assistant.svg)](https://badge.fury.io/js/@webauto%2Fbrowser-assistant)
[![Build Status](https://github.com/webauto/browser-assistant/workflows/Build/badge.svg)](https://github.com/webauto/browser-assistant/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

智能浏览器自动化助手，基于 Camoufox 和 AI 驱动的页面分析。结合了 stagehand 的智能观察理念和 Camoufox 的反指纹识别技术，提供强大的页面理解和内容提取能力。

## 🏗️ 架构概览

### 核心设计理念
Browser Assistant 采用**模块化架构**，将复杂的浏览器自动化任务分解为多个专业化模块。每个模块负责特定功能，通过统一的接口进行协作，支持灵活的配置和扩展。

### 核心组件

#### 1. 核心架构模块 (`src/core/`)
- **`BrowserAssistant.ts`** - 主要的浏览器助手类
  - 提供统一的 API 接口
  - 协调各个子模块的工作
  - 管理生命周期和资源

- **`BaseModule.ts`** - 基础模块类
  - 提供模块通用功能
  - 实现模块间的通信机制
  - 支持模块的初始化和清理

- **`SimpleBaseModule.ts`** - 简化版基础模块类
  - 轻量级模块基类
  - 适合简单的功能模块
  - 减少依赖和复杂度

- **`ErrorHandler.ts`** - 错误处理模块
  - 统一的错误处理机制
  - 支持错误分类和恢复策略
  - 提供详细的错误信息

- **`PageAnalyzer.ts`** - 页面分析器
  - 分析页面结构和布局
  - 识别页面类型和特征
  - 提取关键元素选择器

- **`ContentExtractor.ts`** - 内容提取器
  - 从页面提取结构化数据
  - 支持多种内容类型（帖子、评论、用户信息）
  - 智能过滤和清理数据

- **`ListAnalyzer.ts`** - 列表分析器
  - 分析页面中的列表结构
  - 检测滚动和分页机制
  - 识别重复元素模式

#### 2. 浏览器管理模块 (`src/browser/`)
- **`CamoufoxManager.ts`** - Camoufox 浏览器管理器
  - 基于 Firefox 的反检测浏览器管理
  - 支持多种启动配置
  - 处理浏览器生命周期
  - 关键功能：`launch()`, `newPage()`, `close()`, `configure()`

- **`CookieManager.ts`** - Cookie 管理器
  - 管理浏览器 Cookie
  - 支持持久化和自动注入
  - 处理跨域 Cookie

- **`SimpleCookieManager.ts`** - 简化版 Cookie 管理器
  - 轻量级 Cookie 管理功能
  - 适合简单场景使用

#### 3. 操作模块 (`src/operations/`)
- **`PageOperationCenter.ts`** - 页面操作中心
  - 提供统一的页面操作接口
  - 支持点击、滚动、输入等操作
  - 智能元素定位和交互
  - 关键操作：`click()`, `scroll()`, `type()`, `extractContent()`, `copyPaste()`

- **`SmartElementSelector.ts`** - 智能元素选择器
  - 多策略元素定位
  - 支持 AI 辅助选择
  - 处理动态元素和复杂选择器

- **`SimplePageOperationCenter.ts`** - 简化版页面操作中心
  - 基础页面操作功能
  - 减少复杂度和依赖

- **`SimpleSmartElementSelector.ts`** - 简化版智能元素选择器
  - 基础元素选择功能
  - 适合简单场景

#### 4. 接口定义 (`src/interfaces/`)
- **`core.ts`** - 核心接口定义
  - 定义模块基础接口
  - 规范模块间通信协议

- **`analysis.ts`** - 分析相关接口
  - 页面分析结果接口
  - 内容提取接口定义

- **`operations.ts`** - 操作相关接口
  - 操作参数和返回值接口
  - 操作配置接口

- **`index.ts`** - 接口统一导出
  - 汇总所有接口定义
  - 便于外部引用

#### 5. 类型定义 (`src/types/`)
- **`page-analysis.ts`** - 页面分析类型
  - 页面结构类型定义
  - 分析结果数据结构

- **`index.ts`** - 类型统一导出
  - 汇总所有类型定义
  - 提供完整的类型支持

#### 6. 错误处理 (`src/errors/`)
- **`index.ts`** - 错误类型定义
  - 自定义错误类型
  - 错误分类和处理

#### 7. 入口文件
- **`src/index.ts`** - 主入口文件
  - 导出所有公共 API
  - 提供快速创建函数
  - 版本信息和配置

- **`src/index-simple.ts`** - 简化版入口文件
  - 导出简化版 API
  - 适合轻量级使用

#### 8. 构建和发布
- **`scripts/post-build.js`** - 构建后处理脚本
- **`scripts/publish.js`** - 发布脚本
- **`tsconfig.json`** - TypeScript 配置
- **`tsconfig-simple.json`** - 简化版 TypeScript 配置
- **`package.json`** - 包配置和依赖管理

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