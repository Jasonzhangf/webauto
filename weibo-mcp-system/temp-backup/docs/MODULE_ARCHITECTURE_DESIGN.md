# Weibo MCP 系统模块架构设计

## 🏗️ 整体架构策略

### 核心设计原则
1. **模块化设计**: 每个子模块独立职责，可单独测试和维护
2. **智能分析驱动**: 使用智能分析系统自动识别页面元素和交互逻辑
3. **分层架构**: 基础功能 → 组合功能 → 任务层 → MCP接口层
4. **浏览器句柄管理**: 统一的浏览器会话管理和资源池
5. **消息传递**: 模块间通过标准化接口和事件系统通信

## 📋 模块层次结构

```
┌─────────────────────────────────────┐
│          MCP 接口层                  │
│  (Task Manager, MCP Server)         │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│           任务组合层                  │
│  (Profile Crawl, Search, Batch...)   │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│           功能模块层                  │
│ (智能分析, 链接提取, 内容捕获, 存储) │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│           基础设施层                  │
│   (Browser Pool, Session Manager)   │
└─────────────────────────────────────┘
```

## 🔧 核心子模块设计

### 1. 智能分析模块 (SmartAnalyzer)
**职责**: 自动识别页面元素、选择器提取、交互模式分析

```typescript
interface SmartAnalyzer {
  // 页面分析
  analyzePage(url: string, html: string): PageAnalysis;
  
  // 选择器推荐
  recommendSelectors(elementType: ElementType): SelectorRecommendation[];
  
  // 交互模式识别
  detectInteractionPatterns(): InteractionPattern[];
}

interface PageAnalysis {
  pageType: 'profile' | 'search' | 'post' | 'timeline';
  mainContent: ElementInfo;
  navigation: ElementInfo[];
  interactiveElements: ElementInfo[];
  loadMoreTriggers: ElementInfo[];
}
```

### 2. 浏览器会话管理模块 (BrowserSessionManager)
**职责**: 统一管理浏览器实例、会话保持、资源池化

```typescript
interface BrowserSessionManager {
  // 获取浏览器实例
  getBrowser(options?: BrowserOptions): Promise<BrowserContext>;
  
  // 释放浏览器实例
  releaseBrowser(contextId: string): Promise<void>;
  
  // 会话状态管理
  maintainSession(contextId: string): Promise<SessionStatus>;
  
  // 并发控制
  setConcurrencyLimit(limit: number): void;
}

interface BrowserOptions {
  headless?: boolean;
  userAgent?: string;
  viewport?: Viewport;
  cookies?: Cookie[];
}
```

### 3. 链接提取模块 (LinkExtractor)
**职责**: 从各种页面提取微博链接，支持智能去重

```typescript
interface LinkExtractor {
  // 从页面提取链接
  extractFromPage(page: Page, config: ExtractConfig): Promise<ExtractedLink[]>;
  
  // 从搜索结果提取
  extractFromSearchResults(searchPage: Page): Promise<ExtractedLink[]>;
  
  // 从时间线提取
  extractFromTimeline(timelinePage: Page): Promise<ExtractedLink[]>;
  
  // 智能去重
  deduplicateLinks(links: ExtractedLink[]): Promise<ExtractedLink[]>;
}

interface ExtractedLink {
  url: string;
  type: 'post' | 'profile' | 'image' | 'video';
  title?: string;
  author?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}
```

### 4. 内容捕获模块 (ContentCapturer)
**职责**: 抓取单个微博页面的完整内容，包括文本、媒体、评论

```typescript
interface ContentCapturer {
  // 捕获帖子内容
  capturePost(postUrl: string, config: CaptureConfig): Promise<CapturedContent>;
  
  // 展开评论
  expandComments(page: Page, maxComments?: number): Promise<Comment[]>;
  
  // 下载媒体文件
  downloadMedia(mediaUrls: string[], config: DownloadConfig): Promise<MediaFile[]>;
  
  // OCR处理
  performOCR(imagePath: string): Promise<OCRResult>;
}

interface CapturedContent {
  postInfo: PostInfo;
  textContent: string;
  media: MediaFile[];
  comments: Comment[];
  metadata: Record<string, any>;
}
```

### 5. 文件存储管理模块 (StorageManager)
**职责**: 智能文件存储、目录结构管理、去重逻辑

```typescript
interface StorageManager {
  // 创建存储结构
  createStorageStructure(basePath: string, entityType: string, entityId: string): Promise<StoragePath>;
  
  // 保存内容
  saveContent(content: CapturedContent, path: StoragePath): Promise<SavedResult>;
  
  // 检查重复
  checkDuplicate(contentHash: string): Promise<boolean>;
  
  // 清理和优化
  optimizeStorage(): Promise<CleanupResult>;
}

interface StoragePath {
  basePath: string;
  contentPath: string;
  mediaPath: string;
  metadataPath: string;
}
```

### 6. AI处理模块 (AIProcessor)
**职责**: 内容分析、智能摘要、本地AI管道集成

```typescript
interface AIProcessor {
  // 内容分析
  analyzeContent(content: CapturedContent): Promise<ContentAnalysis>;
  
  // 智能摘要
  generateSummary(content: CapturedContent): Promise<string>;
  
  // 情感分析
  analyzeSentiment(text: string): Promise<SentimentResult>;
  
  // 关键词提取
  extractKeywords(text: string): Promise<string[]>;
}
```

### 7. 通知模块 (NotificationManager)
**职责**: 多渠道通知、Webhook集成、事件推送

```typescript
interface NotificationManager {
  // 发送通知
  sendNotification(notification: Notification): Promise<NotificationResult>;
  
  // Webhook调用
  callWebhook(webhookUrl: string, data: any): Promise<WebhookResult>;
  
  // 事件订阅
  subscribeEvent(eventType: string, handler: EventHandler): void;
}
```

## 🔄 模块间交互方式

### 1. 浏览器句柄管理策略

**统一浏览器池**:
- 所有模块共享浏览器实例池
- 支持多会话隔离（不同用户、不同任务）
- 自动清理和资源回收
- 并发控制和队列管理

```typescript
// 浏览器会话管理示例
class BrowserSessionManagerImpl {
  private browserPool: Map<string, BrowserContext> = new Map();
  private activeSessions: Map<string, SessionInfo> = new Map();
  
  async getBrowserForUser(username: string): Promise<BrowserContext> {
    // 检查是否已有该用户的会话
    const existingSession = this.activeSessions.get(username);
    if (existingSession && this.isSessionValid(existingSession)) {
      return this.browserPool.get(existingSession.contextId);
    }
    
    // 创建新会话
    const context = await this.createBrowserContext({
      cookies: await this.loadUserCookies(username),
      userAgent: this.getUserAgent(username)
    });
    
    const contextId = this.generateContextId();
    this.browserPool.set(contextId, context);
    this.activeSessions.set(username, {
      contextId,
      username,
      createdAt: new Date(),
      lastUsed: new Date()
    });
    
    return context;
  }
}
```

### 2. 消息传递机制

**标准化接口设计**:
- 所有模块实现统一的接口规范
- 使用TypeScript类型确保类型安全
- 事件驱动架构支持异步通信

```typescript
// 统一的模块接口
interface BaseModule {
  initialize(): Promise<void>;
  execute<T>(command: ModuleCommand<T>): Promise<ModuleResult<T>>;
  cleanup(): Promise<void>;
}

// 模块间通信
interface ModuleCommand<T> {
  type: string;
  payload: T;
  metadata?: Record<string, any>;
  timeout?: number;
}

interface ModuleResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime: number;
}
```

### 3. 数据流设计

**内容抓取数据流**:
```
LinkExtractor → BrowserSessionManager → SmartAnalyzer 
    ↓
ContentCapturer → StorageManager → AIProcessor
    ↓
NotificationManager → Task Completion
```

**错误处理流**:
```
Module Error → Error Handler → Retry Logic
    ↓
Fallback Strategy → Error Reporting → Logging
```

## 🏛️ 具体实现顺序

### 阶段1: 基础设施模块
1. **BrowserSessionManager** - 浏览器会话管理
2. **SmartAnalyzer** - 智能页面分析（复用现有智能分析系统）
3. **StorageManager** - 文件存储管理

### 阶段2: 核心功能模块
4. **LinkExtractor** - 链接提取（基于智能分析结果）
5. **ContentCapturer** - 内容捕获（文本、媒体、评论）

### 阶段3: 高级功能模块
6. **AIProcessor** - AI内容处理
7. **NotificationManager** - 通知系统

### 阶段4: 任务组合
8. **ProfileCrawlTask** - 个人主页抓取
9. **SearchTask** - 搜索功能
10. **BatchProcessTask** - 批量处理

## 🔗 模块依赖关系

```
BrowserSessionManager ← All modules
    ↓
SmartAnalyzer ← LinkExtractor, ContentCapturer
    ↓
LinkExtractor ← Profile/Search Tasks
    ↓
ContentCapturer ← All content tasks
    ↓
StorageManager ← ContentCapturer, AIProcessor
    ↓
AIProcessor ← Advanced tasks
    ↓
NotificationManager ← Task completion
```

## 📊 性能和资源管理

### 浏览器资源管理
- 最大并发浏览器实例: 3-5个
- 单个会话超时: 30分钟
- 内存使用监控和自动清理
- Cookie和会话状态持久化

### 存储管理
- 文件去重基于内容哈希
- 自动清理临时文件
- 目录结构按用户/时间组织
- 支持增量更新和差异存储

### 错误恢复
- 自动重试机制（可配置次数）
- 浏览器崩溃自动重启
- 网络超时处理
- 部分失败状态保存

这个架构设计确保了模块的独立性、可测试性和可扩展性，同时为后续的功能实现提供了坚实的基础。