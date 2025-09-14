# 微博动态捕获系统 MCP 设计文档

## 1. 系统概述

### 1.1 项目目标
设计一个可扩展的微博动态捕获 MCP (Model Context Protocol) 系统，提供完整的微博内容抓取、监控、处理和分析功能。系统采用模块化架构，支持扩展到其他社交媒体平台。

### 1.2 核心特性
- **MCP 服务集成**: 提供标准 MCP 协议接口
- **多账号管理**: 支持多账号并发监控和任务分配
- **智能内容分析**: 集成现有的智能内容分析器
- **任务驱动**: 支持定时、批量、循环任务
- **本地存储**: 智能去重和结构化存储
- **AI 集成**: 支持内容 AI 处理和 Webhook 输出

### 1.3 技术栈
- **浏览器自动化**: Camoufox + Playwright (反指纹检测)
- **MCP 框架**: Model Context Protocol 标准
- **后端服务**: Node.js + TypeScript
- **数据库**: SQLite (本地) + 可扩展到 PostgreSQL
- **配置管理**: JSON/YAML 配置文件
- **任务调度**: 内置任务调度器

## 2. 系统架构

### 2.1 整体架构图
```
┌─────────────────────────────────────────────────────────────────┐
│                    微博 MCP 系统                                │
├─────────────────────────────────────────────────────────────────┤
│  MCP 协议层  │  任务管理层  │  浏览器操作层  │  数据存储层  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │MCP 服务 │  │任务调度 │  │登录管理 │  │存储管理 │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │工具注册 │  │任务队列 │  │内容抓取 │  │去重系统 │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │消息处理 │  │监控管理 │  │搜索功能 │  │文件管理 │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块设计

#### 2.2.1 MCP 服务层 (`mcp/`)
```
mcp/
├── server.ts                 # MCP 服务器主入口
├── tools/                   # MCP 工具定义
│   ├── login-tools.ts       # 登录相关工具
│   ├── crawl-tools.ts       # 抓取相关工具
│   ├── monitor-tools.ts     # 监控相关工具
│   ├── search-tools.ts      # 搜索相关工具
│   └── processing-tools.ts  # 处理相关工具
├── resources/              # MCP 资源定义
│   ├── accounts.ts         # 账号资源
│   ├── tasks.ts            # 任务资源
│   └── storage.ts          # 存储资源
└── prompts/                # MCP 提示词
    ├── analysis-prompts.ts # 分析提示词
    └── processing-prompts.ts # 处理提示词
```

#### 2.2.2 任务管理层 (`tasks/`)
```
tasks/
├── scheduler/              # 任务调度器
│   ├── TaskScheduler.ts    # 主调度器
│   ├── TaskQueue.ts        # 任务队列
│   └── TaskManager.ts     # 任务管理器
├── executors/              # 任务执行器
│   ├── LoginExecutor.ts    # 登录执行器
│   ├── CrawlExecutor.ts    # 抓取执行器
│   ├── SearchExecutor.ts   # 搜索执行器
│   └── MonitorExecutor.ts  # 监控执行器
├── monitors/              # 监控器
│   ├── AccountMonitor.ts   # 账号监控器
│   ├── KeywordMonitor.ts   # 关键词监控器
│   └ TimelineMonitor.ts   # 时间线监控器
└── Task.ts                # 任务基类
```

#### 2.2.3 浏览器操作层 (`browser/`)
```
browser/
├── auth/                   # 认证管理
│   ├── LoginManager.ts     # 登录管理器
│   ├── CookieManager.ts    # Cookie 管理器
│   └── AccountManager.ts   # 账号管理器
├── crawlers/              # 抓取器
│   ├── ProfileCrawler.ts   # 个人主页抓取器
│   ├── SearchCrawler.ts    # 搜索结果抓取器
│   ├── TimelineCrawler.ts  # 时间线抓取器
│   └── ContentCrawler.ts   # 内容详情抓取器
├── analyzers/             # 分析器
│   ├── ContentAnalyzer.ts  # 内容分析器 (现有)
│   ├── SelectorAnalyzer.ts # 选择器分析器
│   └── QualityAnalyzer.ts  # 质量分析器
└── utils/                 # 浏览器工具
    ├── BrowserPool.ts     # 浏览器池
    ├── AntiDetection.ts   # 反检测工具
    └── PageManager.ts     # 页面管理器
```

#### 2.2.4 数据存储层 (`storage/`)
```
storage/
├── managers/              # 存储管理器
│   ├── StorageManager.ts  # 存储主管理器
│   ├── Deduplication.ts   # 去重管理器
│   └── FileManager.ts     # 文件管理器
├── database/             # 数据库
│   ├── Database.ts       # 数据库连接
│   ├── migrations/       # 数据库迁移
│   └── models/           # 数据模型
│       ├── Account.ts    # 账号模型
│       ├── Task.ts       # 任务模型
│       ├── Post.ts       # 帖子模型
│       └── Media.ts      # 媒体模型
└── formatters/           # 格式化器
    ├── MarkdownFormatter.ts # Markdown 格式化
    ├── JSONFormatter.ts  # JSON 格式化
    └── AIFormatter.ts    # AI 处理格式化
```

## 3. 核心功能设计

### 3.1 登录管理模块

#### 3.1.1 手动登录功能
```typescript
interface LoginConfig {
  autoSaveCookies: boolean;
  cookieExpiry: number;    // Cookie 过期时间(小时)
  loginTimeout: number;    // 登录超时(秒)
  retryAttempts: number;   // 重试次数
}

interface AccountCredentials {
  username: string;
  password?: string;      // 可选，支持手动登录
  cookies: Cookie[];       // 保存的 Cookie
  lastLogin: Date;
  status: 'active' | 'expired' | 'invalid';
}
```

#### 3.1.2 Cookie 管理策略
- 自动检测 Cookie 有效性
- 定期刷新机制
- 多账号 Cookie 隔离
- Cookie 加密存储

### 3.2 内容抓取模块

#### 3.2.1 个人主页抓取
```typescript
interface ProfileCrawlConfig {
  profileUrl: string;
  postCount: number;
  includeComments: boolean;
  maxComments: number;
  downloadMedia: boolean;
  outputFormat: 'markdown' | 'json';
}

interface ProfileCrawlResult {
  accountName: string;
  posts: Post[];
  mediaFiles: MediaFile[];
  stats: {
    totalPosts: number;
    totalComments: number;
    totalMedia: number;
  };
}
```

#### 3.2.2 搜索功能
```typescript
interface SearchConfig {
  keyword: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  postType?: 'all' | 'original' | 'repost';
  maxResults: number;
  sortType: 'recent' | 'hot' | 'relevant';
}

interface SearchResult {
  keyword: string;
  posts: Post[];
  totalResults: number;
  searchTime: Date;
}
```

### 3.3 多账号监控模块

#### 3.3.1 监控配置
```typescript
interface MonitorConfig {
  accounts: string[];        // 监控的账号列表
  interval: number;          // 监控间隔(分钟)
  checkNewPosts: boolean;    // 检查新帖子
  checkComments: boolean;    // 检查评论
  notifications: {
    webhook?: string;        // Webhook 通知
    email?: string;          // 邮件通知
    aiAnalysis?: boolean;    // AI 分析通知
  };
}
```

#### 3.3.2 监控执行器
```typescript
class AccountMonitor {
  async startMonitoring(config: MonitorConfig): Promise<void>;
  async stopMonitoring(): Promise<void>;
  async getStatus(): Promise<MonitorStatus>;
  async getRecentChanges(): Promise<MonitorChange[]>;
}
```

### 3.4 内容处理模块

#### 3.4.1 批量链接处理
```typescript
interface BatchProcessConfig {
  links: string[];
  downloadMedia: boolean;
  maxComments: number;
  expandComments: boolean;
  ocrImages: boolean;
  outputFormat: 'markdown' | 'json' | 'both';
  deduplication: boolean;
}
```

#### 3.4.2 内容存储策略
```
存储结构：
/data/
├── accounts/               # 按账号分类
│   ├── {account_name}/
│   │   ├── posts/          # 帖子内容
│   │   ├── media/          # 媒体文件
│   │   ├── comments/       # 评论内容
│   │   └── metadata.json   # 元数据
├── searches/              # 搜索结果
│   ├── {keyword}/
│   │   ├── {date}/
│   │   └── results/
├── timeline/              # 时间线内容
└── cache/                 # 缓存文件
```

#### 3.4.3 去重逻辑
```typescript
interface DeduplicationConfig {
  checkByUrl: boolean;      // URL 去重
  checkByContent: boolean;  // 内容去重
  checkByHash: boolean;     // 哈希去重
  fuzzyMatch: boolean;      // 模糊匹配
  similarityThreshold: number; // 相似度阈值
}
```

## 4. MCP 服务设计

### 4.1 MCP 工具定义

#### 4.1.1 登录工具
```typescript
{
  name: "weibo_login",
  description: "手动登录微博并保存 Cookie",
  inputSchema: {
    type: "object",
    properties: {
      username: { type: "string", description: "用户名" },
      autoSave: { type: "boolean", default: true, description: "自动保存 Cookie" }
    }
  }
}
```

#### 4.1.2 抓取工具
```typescript
{
  name: "weibo_crawl_profile",
  description: "抓取个人主页帖子",
  inputSchema: {
    type: "object",
    properties: {
      profileUrl: { type: "string", description: "个人主页链接" },
      postCount: { type: "number", default: 50, description: "抓取帖子数量" },
      includeComments: { type: "boolean", default: true, description: "包含评论" }
    }
  }
}
```

#### 4.1.3 搜索工具
```typescript
{
  name: "weibo_search",
  description: "搜索微博内容",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string", description: "搜索关键词" },
      timeRange: {
        type: "object",
        properties: {
          start: { type: "string", format: "date-time" },
          end: { type: "string", format: "date-time" }
        }
      },
      maxResults: { type: "number", default: 100 }
    }
  }
}
```

### 4.2 MCP 资源定义

#### 4.2.1 账号资源
```typescript
{
  uri: "weibo://accounts",
  name: "微博账号",
  description: "管理的微博账号列表"
}
```

#### 4.2.2 任务资源
```typescript
{
  uri: "weibo://tasks",
  name: "抓取任务",
  description: "当前运行和历史的抓取任务"
}
```

## 5. 任务管理系统

### 5.1 任务类型
```typescript
enum TaskType {
  LOGIN = 'login',
  PROFILE_CRAWL = 'profile_crawl',
  SEARCH_CRAWL = 'search_crawl',
  TIMELINE_CRAWL = 'timeline_crawl',
  BATCH_PROCESS = 'batch_process',
  MONITOR = 'monitor'
}

enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}
```

### 5.2 任务调度器
```typescript
interface TaskSchedule {
  type: 'once' | 'cron' | 'interval';
  time: Date;              // 执行时间
  interval?: number;       // 间隔时间(分钟)
  cronExpression?: string;  // Cron 表达式
  retryCount: number;       // 重试次数
  timeout: number;         // 超时时间(秒)
}
```

### 5.3 任务执行流程
```
1. 任务创建 → 2. 任务队列 → 3. 资源分配 → 4. 任务执行 → 5. 结果处理
       ↓                                    ↓
任务配置验证                        执行状态监控
       ↓                                    ↓
权限检查                             错误处理和重试
       ↓                                    ↓
依赖检查                             结果存储和通知
```

## 6. 配置系统设计

### 6.1 主配置文件 (`config.yaml`)
```yaml
system:
  name: "weibo-mcp-system"
  version: "1.0.0"
  logLevel: "info"
  dataDir: "./data"
  tempDir: "./temp"

mcp:
  server:
    port: 3000
    host: "localhost"
  auth:
    enabled: false
    apiKey: ""

browser:
  pool:
    minInstances: 1
    maxInstances: 5
    timeout: 30000
  camoufox:
    headless: false
    antiDetection: true
    userAgent: "random"

storage:
  database:
    type: "sqlite"
    path: "./data/weibo.db"
  pipeline:
    framework: "local"
    models:
      text: "local-text-model"
      vision: "local-vision-model"
      maxConcurrency: 3
  deduplication:
    enabled: true
    checkByUrl: true
    checkByContent: false
    similarityThreshold: 0.9
  media:
    download: true
    maxFileSize: "50MB"
    allowedTypes: ["jpg", "png", "gif", "mp4", "mov"]

tasks:
  scheduler:
    maxConcurrent: 3
    retryAttempts: 3
    cleanupInterval: 3600
  defaults:
    timeout: 1800
    maxComments: 1000
    expandComments: true

monitoring:
  enabled: true
  interval: 30
  notifications:
    webhook: ""
    aiAnalysis: false

ai:
  enabled: true
  provider: "local"
  pipeline:
    textProcessor: "local-text-processor"
    visionProcessor: "local-vision-processor"
    maxConcurrency: 2
    timeout: 30000
  models:
    default: "local-llm"
    vision: "local-vision-model"
    maxTokens: 4000
    temperature: 0.7

webhook:
  enabled: false
  url: ""
  headers: {}
  timeout: 10000

underConstruction:
  enabled: true
  module: "rcc-underconstruction"
  placeholderMessage: "功能正在开发中"
```

### 6.2 账号配置文件 (`accounts.json`)
```json
{
  "accounts": [
    {
      "id": "account_001",
      "username": "user1",
      "status": "active",
      "cookies": [...],
      "lastLogin": "2024-01-15T10:30:00Z",
      "config": {
        "monitorEnabled": true,
        "crawlInterval": 60
      }
    }
  ]
}
```

## 7. 扩展性设计

### 7.1 平台扩展接口
```typescript
interface SocialMediaPlatform {
  name: string;
  domain: string;
  auth: AuthenticationModule;
  crawler: CrawlerModule;
  analyzer: AnalyzerModule;
  storage: StorageModule;
}

abstract class BasePlatform {
  abstract authenticate(credentials: Credentials): Promise<boolean>;
  abstract crawlProfile(config: CrawlConfig): Promise<CrawlResult>;
  abstract search(config: SearchConfig): Promise<SearchResult>;
  abstract monitor(config: MonitorConfig): Promise<MonitorResult>;
}
```

### 7.2 插件系统
```typescript
interface Plugin {
  name: string;
  version: string;
  hooks: {
    beforeCrawl?: (config: CrawlConfig) => Promise<CrawlConfig>;
    afterCrawl?: (result: CrawlResult) => Promise<CrawlResult>;
    onStorage?: (data: any) => Promise<void>;
  };
}
```

## 8. 实现计划

### 阶段 1: 基础架构 (2-3 周)
- [ ] 搭建项目结构和基础配置
- [ ] 实现 MCP 服务框架
- [ ] 集成现有浏览器助手模块
- [ ] 实现基础的登录和 Cookie 管理

### 阶段 2: 核心功能 (3-4 周)
- [ ] 实现个人主页抓取功能
- [ ] 实现搜索功能
- [ ] 实现批量内容处理
- [ ] 实现本地存储和去重

### 阶段 3: 高级功能 (2-3 周)
- [ ] 实现多账号监控系统
- [ ] 实现任务调度和管理
- [ ] 集成 AI 处理功能
- [ ] 实现 Webhook 通知

### 阶段 4: 扩展和优化 (2-3 周)
- [ ] 实现平台扩展框架
- [ ] 性能优化和错误处理
- [ ] 完善文档和测试
- [ ] 部署和运维支持

## 9. 风险评估

### 9.1 技术风险
- **反爬虫检测**: 需要持续更新反检测策略
- **网站结构变化**: 需要灵活的选择器系统
- **性能瓶颈**: 大量数据处理的性能优化

### 9.2 运营风险
- **账号封禁**: 需要合理的请求频率控制
- **数据合规**: 需要考虑数据使用合规性
- **系统稳定性**: 需要完善的错误处理和监控

## 10. 技术选型确认

### 10.1 已确认技术栈
- **浏览器自动化**: Camoufox + Playwright ✅
- **内容分析**: 现有智能分析器 ✅
- **配置管理**: YAML + JSON ✅
- **MCP 协议**: 标准 MCP 实现 ✅

### 10.2 已确认的技术选型
- **数据库**: ✅ SQLite (简单部署，本地存储)
- **任务队列**: ✅ 内置队列 (轻量级，无外部依赖)
- **AI 集成**: ✅ 本地流水线框架 (本地模型处理)
- **部署方式**: ✅ 直接部署 (简化部署流程)
- **MCP 集成**: ✅ 集成到本地 MCP 模块
- **发布支持**: ✅ 支持 MCP 发布和部署

---

**设计完成时间**: 2025-01-15
**设计版本**: v1.0
**已确认技术选型**:
- ✅ SQLite 数据库
- ✅ 内置任务队列
- ✅ 本地流水线框架
- ✅ 直接部署方式
- ✅ 集成到本地 MCP 模块
- ✅ 支持 MCP 发布和部署

**下一步**: 开始第一阶段实现 - 基础架构搭建