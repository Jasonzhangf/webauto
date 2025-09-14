# 微博容器化操作系统详细设计文档

## 1. 系统概述

### 1.1 设计目标
基于RCC基础模块构建一个精确的、容器化的微博操作系统，实现以下目标：
- **精确控制**：每个操作都有明确的目标和范围，避免野蛮的大规模选择
- **容器化架构**：将网页分解为具有明确边界的容器，每个容器包含特定内容和操作
- **模块化设计**：容器和操作都是独立的模块，可以组合和重用
- **智能适配**：系统能够识别不同页面类型并自动适配操作策略

### 1.2 核心理念
- **单一职责**：每个容器只负责一种类型的内容
- **组合优于继承**：通过容器组合构建复杂功能
- **接口导向**：定义清晰的接口，支持多种实现
- **可扩展性**：新功能通过添加新容器和操作实现，不修改现有代码

## 2. 系统架构设计

### 2.1 整体架构图
```
微博容器化操作系统
├── 核心层 (Core Layer)
│   ├── WeiboContainerOperator (主控制器)
│   ├── RCC BaseModule (基础模块继承)
│   └── ErrorHandlingCenter (错误处理)
├── 容器层 (Container Layer)
│   ├── 页面容器 (Page Container)
│   ├── 用户主页容器 (User Profile Container)
│   ├── 搜索结果容器 (Search Result Container)
│   ├── 信息流容器 (Feed Container)
│   └── 通用容器 (Generic Container)
├── 操作层 (Operation Layer)
│   ├── 导航操作 (Navigation Operations)
│   ├── 信息提取操作 (Extraction Operations)
│   ├── 交互操作 (Interaction Operations)
│   └── 验证操作 (Validation Operations)
└── 数据层 (Data Layer)
    ├── 容器注册表 (Container Registry)
    ├── 操作历史 (Operation History)
    ├── 性能指标 (Performance Metrics)
    └── 缓存系统 (Cache System)
```

### 2.2 类继承结构

#### 2.2.1 主类继承关系
```javascript
WeiboContainerOperator extends BaseModule (来自 rcc-basemodule)
├── 继承 BaseModule 的所有功能
│   ├── 日志记录 (logInfo, logWarn, logError)
│   ├── 错误处理 (error handling)
│   ├── 生命周期管理 (lifecycle management)
│   ├── 指标收集 (metrics collection)
│   └── 配置管理 (configuration management)
├── 扩展功能
│   ├── 容器管理 (container management)
│   ├── 页面类型识别 (page type recognition)
│   ├── 操作执行 (operation execution)
│   └── 状态监控 (status monitoring)
```

### 2.3 核心组件详解

#### 2.3.1 WeiboContainerOperator 类
这是系统的核心控制器，负责协调整个容器化操作系统的运行。

**主要职责：**
- 页面类型自动识别
- 容器生命周期管理
- 操作调度和执行
- 错误处理和恢复
- 性能监控和指标收集

**核心方法：**
```javascript
class WeiboContainerOperator extends BaseModule {
    constructor(config)                    // 初始化系统配置
    async initializePage(page)           // 初始化页面和容器
    async recognizePageType(page)        // 识别页面类型
    async createPageContainers(page)     // 创建页面容器
    async executeContainerOperation(...) // 执行容器操作
    async extractPageContent()           // 提取页面内容
    getSystemStatus()                   // 获取系统状态
    async healthCheck()                  // 健康检查
}
```

#### 2.3.2 容器系统设计

**容器结构：**
```javascript
{
    id: 'container-id',                    // 容器唯一标识
    name: 'Container Name',                // 容器名称
    type: 'container-type',                // 容器类型
    selectors: ['css-selector'],          // CSS选择器数组
    operations: new Map([                  // 操作映射
        ['operationName', operationFunction]
    ]),
    executeOperation: async function(...)  // 操作执行方法
}
```

**支持的容器类型：**
1. **Page Container** - 页面级容器
2. **User Profile Container** - 用户主页容器
3. **Search Result Container** - 搜索结果容器
4. **Feed Container** - 信息流容器
5. **Generic Container** - 通用容器

#### 2.3.3 操作系统设计

**操作分类：**
1. **导航操作** - 页面跳转、滚动等
2. **信息提取操作** - 提取文本、图片、视频等
3. **交互操作** - 点击、输入、提交等
4. **验证操作** - 检查元素存在性、可见性等

**操作接口：**
```javascript
interface Operation {
    name: string;                          // 操作名称
    description: string;                   // 操作描述
    execute: async (context, params) => any; // 执行函数
}
```

## 3. 技术实现细节

### 3.1 依赖关系
```json
{
  "dependencies": {
    "rcc-basemodule": "^0.1.4",        // 基础模块
    "rcc-errorhandling": "^1.0.5"     // 错误处理
  }
}
```

### 3.2 关键代码实现

#### 3.2.1 主控制器实现
```javascript
class WeiboContainerOperator extends BaseModule {
    constructor(config = {}) {
        super({
            id: 'WeiboContainerOperator',
            name: 'WeiboContainerOperator',
            version: '2.0.0',
            description: '微博容器化操作系统',
            type: 'weibo-operator',
            ...config
        });
        
        this.containerRegistry = new Map();
        this.errorHandlingCenter = new ErrorHandlingCenter();
        this.currentPage = null;
        this.pageType = 'unknown';
    }
}
```

#### 3.2.2 页面类型识别
```javascript
async recognizePageType(page) {
    const url = page.url();
    
    if (url.includes('weibo.com/u/')) {
        return 'user_profile';
    } else if (url.includes('weibo.com/search/')) {
        return 'search';
    } else if (url.includes('weibo.com/')) {
        return 'feed';
    } else {
        return 'unknown';
    }
}
```

#### 3.2.3 容器创建
```javascript
async createPageContainers(page) {
    // 基础页面容器
    const pageContainer = {
        id: 'weibo-page',
        name: 'Weibo Page Container',
        type: 'page-container',
        selectors: ['body', '.woo-layout-main'],
        operations: new Map([
            ['getPageInfo', this.createGetPageInfoOperation()],
            ['navigateTo', this.createNavigateToOperation()],
            ['checkLoginState', this.createCheckLoginStateOperation()]
        ]),
        executeOperation: async (operation, context, params) => {
            const op = this.operations.get(operation);
            if (!op) throw new Error(`Operation ${operation} not found`);
            return await op(context, params);
        }.bind(this)
    };
    
    this.containerRegistry.set('weibo-page', pageContainer);
}
```

#### 3.2.4 操作执行
```javascript
async executeContainerOperation(containerId, operationName, params = {}) {
    const container = this.containerRegistry.get(containerId);
    if (!container) {
        throw new Error(`Container ${containerId} not found`);
    }

    try {
        this.logInfo(`Executing operation: ${operationName}`, {
            container: containerId,
            operation: operationName,
            params
        });

        const result = await container.executeOperation(operationName, this.currentContext, params);
        
        this.logInfo(`Operation completed: ${operationName}`, {
            container: containerId,
            operation: operationName,
            success: true
        });

        return result;
        
    } catch (error) {
        this.logError(`Operation failed: ${operationName}`, error);
        
        const handledError = this.errorHandlingCenter.handleError(error, {
            containerId,
            operationName,
            params
        });
        
        throw handledError;
    }
}
```

### 3.3 操作实现示例

#### 3.3.1 获取页面信息
```javascript
createGetPageInfoOperation() {
    return async (context, params) => {
        return await context.page.evaluate(() => ({
            title: document.title,
            url: window.location.href,
            pageType: this.getPageType(window.location.href)
        }));
    };
}
```

#### 3.3.2 提取用户信息
```javascript
createExtractUserInfoOperation() {
    return async (context, params) => {
        const userInfo = await context.page.evaluate(() => {
            const profileElement = document.querySelector('div[class*="Profile_"]');
            if (!profileElement) return null;
            
            return {
                name: profileElement.querySelector('h1[class*="name_"]')?.textContent?.trim(),
                bio: profileElement.querySelector('div[class*="bio_"]')?.textContent?.trim(),
                followers: profileElement.querySelector('[class*="followers_"]')?.textContent?.trim(),
                following: profileElement.querySelector('[class*="following_"]')?.textContent?.trim()
            };
        });
        
        return userInfo;
    };
}
```

#### 3.3.3 提取信息流帖子
```javascript
createExtractFeedPostsOperation() {
    return async (context, params) => {
        const { limit = 10 } = params;
        const posts = await context.page.evaluate((limit) => {
            const postElements = document.querySelectorAll('article[class*="Feed_wrap_3v9LH"]');
            return Array.from(postElements).slice(0, limit).map(post => ({
                id: post.getAttribute('data-feedid'),
                content: post.querySelector('div[class*="Feed_body_"]')?.textContent?.trim(),
                author: post.querySelector('.head_main_3DRDm')?.textContent?.trim(),
                timestamp: post.querySelector('.head-info_time_6sFQg')?.textContent?.trim(),
                stats: {
                    likes: post.querySelector('[class*="like_"]')?.textContent?.trim(),
                    comments: post.querySelector('[class*="comment_"]')?.textContent?.trim(),
                    reposts: post.querySelector('[class*="repost_"]')?.textContent?.trim()
                }
            }));
        }, limit);
        
        return { posts, count: posts.length };
    };
}
```

## 4. 系统特性

### 4.1 精确元素操作
- **CSS选择器定位**：使用精确的CSS选择器，避免模糊匹配
- **容器边界明确**：每个容器都有明确的作用域和边界
- **操作目标明确**：每个操作都有明确的目标和参数

### 4.2 智能页面适配
- **URL模式识别**：通过URL识别页面类型
- **DOM结构分析**：分析DOM结构确定页面特征
- **容器自动创建**：根据页面类型自动创建相应容器

### 4.3 错误处理机制
- **RCC错误处理集成**：继承RCC的错误处理能力
- **错误分类处理**：根据错误类型进行不同的处理策略
- **自动重试机制**：对可重试错误进行自动重试

### 4.4 性能监控
- **操作耗时统计**：记录每个操作的执行时间
- **成功率统计**：统计操作的成功率
- **系统健康检查**：定期进行系统健康检查

## 5. 使用示例

### 5.1 基本使用
```javascript
const { WeiboContainerOperator } = require('./src/containers/weibo-container-operator');

// 创建操作器实例
const operator = new WeiboContainerOperator({
    logLevel: 'info',
    enableMetrics: true
});

// 初始化页面
const pageType = await operator.initializePage(page);

// 执行操作
const result = await operator.executeContainerOperation(
    'weibo-page',
    'getPageInfo'
);

console.log('Page info:', result);
```

### 5.2 复杂操作
```javascript
// 提取用户信息
const userInfo = await operator.executeContainerOperation(
    'user-profile',
    'extractUserInfo'
);

// 获取用户帖子
const userPosts = await operator.executeContainerOperation(
    'user-profile',
    'getUserPosts',
    { limit: 20 }
);

console.log('User posts:', userPosts);
```

### 5.3 系统监控
```javascript
// 获取系统状态
const status = operator.getSystemStatus();
console.log('System status:', status);

// 健康检查
const health = await operator.healthCheck();
console.log('Health check:', health);
```

## 6. 扩展指南

### 6.1 添加新的容器类型
1. 创建新的容器创建方法
2. 定义容器的CSS选择器
3. 实现容器的操作集合
4. 在页面类型识别中添加新类型

### 6.2 添加新的操作
1. 创建操作函数
2. 定义操作参数
3. 实现操作逻辑
4. 将操作添加到相应容器

### 6.3 添加新的页面类型
1. 在 recognizePageType 中添加识别逻辑
2. 创建对应的容器创建方法
3. 定义页面的特征选择器
4. 测试页面识别准确性

## 7. 技术优势

### 7.1 精确性
- 避免野蛮的大规模选择
- 每个操作都有明确的目标
- 容器边界清晰，避免干扰

### 7.2 可维护性
- 模块化设计，易于维护
- 清晰的接口定义
- 完善的错误处理机制

### 7.3 可扩展性
- 新功能通过添加新模块实现
- 不修改现有代码
- 支持多种页面类型

### 7.4 性能优化
- 容器复用，减少重复创建
- 缓存机制，提高响应速度
- 性能监控，及时发现问题

## 8. 总结

这个微博容器化操作系统基于RCC基础模块构建，实现了：

1. **精确的元素操作**：通过容器化架构避免野蛮的选择方式
2. **智能的页面适配**：自动识别页面类型并创建相应容器
3. **完善的错误处理**：继承RCC的错误处理能力
4. **强大的扩展能力**：支持添加新的容器类型和操作
5. **全面的性能监控**：实时监控系统状态和性能指标

这个设计既保持了代码的简洁性，又提供了强大的功能扩展能力，是一个现代化的微博操作系统架构。

---

**文档状态**: 设计完成，等待审阅
**创建时间**: 2025-01-14
**版本**: 2.0.0