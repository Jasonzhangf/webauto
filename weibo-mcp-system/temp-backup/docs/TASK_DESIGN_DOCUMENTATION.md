# Weibo MCP 系统任务设计文档

## 📋 概述

本文档详细描述了Weibo MCP系统中每个任务类型的完整设计，包括任务配置、执行流程、结果存储和MCP交互方式。

## 🎯 核心设计原则

1. **任务驱动**: 所有操作都通过任务队列异步执行
2. **状态透明**: 实时反馈任务状态和进度
3. **结果持久化**: 处理结果存储在本地文件系统
4. **错误恢复**: 自动重试和完善的错误处理
5. **资源控制**: 限制并发和资源使用

## 🗂️ 任务目录结构

```
data/
├── tasks/                    # 任务执行目录
│   ├── login/               # 登录任务
│   │   ├── cookies/         # Cookie存储
│   │   └── sessions/        # 会话存储
│   ├── profiles/            # 个人主页抓取
│   │   ├── [username]/      # 用户名目录
│   │   │   ├── posts/       # 帖子内容
│   │   │   ├── images/      # 图片文件
│   │   │   ├── videos/      # 视频文件
│   │   │   └── metadata.json # 元数据
│   ├── search/              # 搜索任务
│   │   ├── [keyword]/       # 关键词目录
│   │   │   ├── results/     # 搜索结果
│   │   │   └── summary.md   # 搜索总结
│   ├── batch/               # 批量处理
│   │   ├── [batch_id]/      # 批次ID
│   │   │   ├── processed/   # 已处理链接
│   │   │   └── results/     # 处理结果
│   ├── timeline/            # 时间线抓取
│   │   ├── [date]/          # 日期目录
│   │   │   └── posts/       # 时间线帖子
│   └── monitoring/          # 监控任务
│       ├── [account]/       # 账号目录
│       │   ├── new_posts/   # 新发现帖子
│       │   └── reports/     # 监控报告
├── cache/                   # 缓存目录
├── logs/                    # 日志目录
└── temp/                    # 临时文件目录
```

---

## 🔐 1. 登录任务 (Login Task)

### 任务配置
```typescript
interface LoginTaskConfig {
  username: string;                    // 用户名
  password?: string;                   // 密码（可选）
  manualLogin: boolean;                // 是否手动登录
  autoSaveCookies: boolean;            // 自动保存Cookie
  profileUrl?: string;                 // 个人主页URL（可选）
  timeout: number;                     // 超时时间（秒）
  qrCodeLogin?: boolean;               // 是否使用二维码登录（可选）
  qrCodeDisplay?: boolean;             // 是否显示二维码截图（可选，默认true）
  qrCodeTimeout?: number;              // 二维码等待超时（秒，可选，默认300秒）
}
```

### 执行流程
1. **初始化阶段**
   - 创建用户专属目录
   - 启动浏览器实例（二维码登录时使用非headless模式）
   - 配置反检测设置

2. **登录阶段**
   - **二维码登录**（qrCodeLogin=true）：
     - 打开微博登录页面
     - 截取二维码区域
     - 显示二维码截图供用户扫描
     - 等待手机微博App扫描确认
     - 监控登录状态变化
   - **手动登录**（manualLogin=true）：
     - 打开登录页面等待用户操作
   - **自动登录**（password提供）：
     - 填写表单并提交
   - 验证登录成功状态

3. **保存阶段**
   - 保存Cookie到本地
   - 保存会话信息（包含二维码截图路径）
   - 验证个人主页访问

### MCP交互示例

#### 普通手动登录
```json
// 提交登录任务
{
  "tool": "weibo_submit_task",
  "arguments": {
    "taskType": "login",
    "taskConfig": {
      "username": "example_user",
      "manualLogin": true,
      "autoSaveCookies": true,
      "profileUrl": "https://weibo.com/example_user",
      "timeout": 300
    },
    "priority": 5
  }
}
```

#### 二维码登录
```json
// 提交二维码登录任务
{
  "tool": "weibo_submit_task",
  "arguments": {
    "taskType": "login",
    "taskConfig": {
      "username": "qrcode_user",
      "manualLogin": false,
      "autoSaveCookies": true,
      "qrCodeLogin": true,           // 启用二维码登录
      "qrCodeDisplay": true,         // 显示二维码截图
      "qrCodeTimeout": 180,         // 3分钟超时
      "profileUrl": "https://weibo.com/qrcode_user",
      "timeout": 300
    },
    "priority": 8  // 高优先级
  }
}

// 返回任务ID
{
  "success": true,
  "taskId": "uuid-string",
  "message": "Task submitted successfully",
  "taskType": "login",
  "estimatedDuration": 120
}
```

### 结果存储
```
data/tasks/login/
├── example_user/
│   ├── cookies.json          # Cookie文件
│   ├── session.json         # 会话信息（包含二维码信息）
│   ├── profile_info.json    # 个人资料
│   ├── qrcode_info.json     # 二维码登录信息（二维码登录时）
│   ├── qrcode_screenshot.png # 二维码截图（二维码登录时）
│   └── login_log.json       # 登录日志
```

### 状态更新
- `pending`: 等待执行
- `running`: 正在打开登录页面
- `qrcode_generating`: 正在生成二维码（二维码登录）
- `qrcode_waiting`: 等待二维码扫描（二维码登录）
- `qrcode_scanned`: 二维码已扫描，等待确认（二维码登录）
- `manual_input_required`: 等待用户手动输入（手动登录）
- `verifying_login`: 验证登录状态
- `completed`: 登录成功
- `failed`: 登录失败

---

## 📱 2. 个人主页抓取任务 (Profile Crawl Task)

### 任务配置
```typescript
interface ProfileCrawlTaskConfig {
  profileUrl: string;                  // 个人主页URL
  postCount: number;                   // 抓取帖子数量
  includeComments: boolean;            // 是否包含评论
  maxComments: number;                 // 最大评论数
  downloadMedia: boolean;              // 是否下载媒体文件
  outputFormat: 'markdown' | 'json' | 'both';  // 输出格式
  deduplication: boolean;              // 启用去重
  maxRetries: number;                  // 最大重试次数
}
```

### 执行流程
1. **准备阶段**
   - 解析个人主页URL，提取用户名
   - 创建用户专属目录结构
   - 检查已有Cookie，必要时登录

2. **抓取阶段**
   - 加载个人主页
   - 滚动加载更多帖子
   - 提取帖子信息（文本、图片、视频）
   - 按需展开和抓取评论

3. **处理阶段**
   - 媒体文件下载
   - 内容格式转换
   - 去重处理
   - 生成元数据

### MCP交互示例
```json
// 提交抓取任务
{
  "tool": "weibo_submit_task",
  "arguments": {
    "taskType": "crawl_profile",
    "taskConfig": {
      "profileUrl": "https://weibo.com/u/1234567890",
      "postCount": 100,
      "includeComments": true,
      "maxComments": 500,
      "downloadMedia": true,
      "outputFormat": "both"
    },
    "priority": 3
  }
}
```

### 结果存储
```
data/tasks/profiles/1234567890/
├── posts/                           # 帖子内容
│   ├── post_001.md                 # Markdown格式
│   ├── post_001.json               # JSON格式
│   ├── post_002.md
│   └── ...
├── images/                          # 图片文件
│   ├── post_001_img_001.jpg
│   └── ...
├── videos/                          # 视频文件
│   └── post_001_vid_001.mp4
├── comments/                        # 评论数据
│   ├── post_001_comments.json
│   └── ...
├── metadata.json                    # 元数据汇总
└── summary.md                       # 抓取总结
```

### 进度跟踪
```typescript
interface TaskProgress {
  current: number;        // 当前处理数量
  total: number;          // 总数量
  message: string;       // 当前状态消息
  percentage: number;    // 完成百分比
  details: {
    postsLoaded: number;    // 已加载帖子数
    commentsLoaded: number; // 已加载评论数
    mediaDownloaded: number; // 已下载媒体数
    errors: string[];       // 错误列表
  }
}
```

---

## 🔍 3. 搜索任务 (Search Task)

### 任务配置
```typescript
interface SearchTaskConfig {
  keyword: string;                     // 搜索关键词
  timeRange?: {                       // 时间范围
    start: string;                    // 开始时间 ISO格式
    end: string;                      // 结束时间 ISO格式
  };
  postType: 'all' | 'original' | 'repost';  // 帖子类型
  maxResults: number;                  // 最大结果数
  sortType: 'recent' | 'hot' | 'relevant';  // 排序方式
  includeComments: boolean;            // 包含评论
  downloadMedia: boolean;              // 下载媒体
  outputFormat: 'markdown' | 'json' | 'both';
}
```

### 执行流程
1. **搜索构建**
   - 构建搜索URL
   - 设置搜索参数
   - 处理分页逻辑

2. **结果抓取**
   - 抓取搜索结果页面
   - 提取帖子链接和信息
   - 按需加载更多结果

3. **深度处理**
   - 访问每个帖子链接
   - 抓取完整内容
   - 下载媒体文件
   - 提取评论

### MCP交互示例
```json
// 提交搜索任务
{
  "tool": "weibo_submit_task",
  "arguments": {
    "taskType": "search",
    "taskConfig": {
      "keyword": "AI技术",
      "timeRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      },
      "postType": "original",
      "maxResults": 50,
      "sortType": "recent",
      "includeComments": true
    },
    "priority": 2
  }
}
```

### 结果存储
```
data/tasks/search/AI技术_20240101_20241231/
├── search_results.json              # 搜索结果列表
├── posts/                          # 帖子详细内容
│   ├── result_001/
│   │   ├── content.md
│   │   ├── media/
│   │   └── comments.json
│   └── result_002/
├── summary.md                       # 搜索总结
└── statistics.json                  # 统计信息
```

---

## 📦 4. 批量处理任务 (Batch Process Task)

### 任务配置
```typescript
interface BatchProcessTaskConfig {
  links: string[];                     // 微博链接列表
  downloadMedia: boolean;              // 下载媒体文件
  maxComments: number;                 // 最大评论数
  expandComments: boolean;             // 展开评论
  ocrImages: boolean;                  // OCR图片处理
  outputFormat: 'markdown' | 'json' | 'both';
  deduplication: boolean;              // 启用去重
  maxConcurrent: number;               // 最大并发数
  batchSize: number;                   // 批次大小
}
```

### 执行流程
1. **预处理阶段**
   - 验证链接格式
   - 去重处理
   - 创建批次分组

2. **并发处理**
   - 多线程/并发处理链接
   - 进度跟踪和错误处理
   - 资源使用监控

3. **结果整合**
   - 合并所有批次结果
   - 生成汇总报告
   - 清理临时文件

### MCP交互示例
```json
// 提交批量处理任务
{
  "tool": "weibo_submit_task",
  "arguments": {
    "taskType": "batch_process",
    "taskConfig": {
      "links": [
        "https://weibo.com/1234567890/AbCdEfGhIj",
        "https://weibo.com/1234567890/KlMnOpQrSt"
      ],
      "downloadMedia": true,
      "maxComments": 1000,
      "expandComments": true,
      "ocrImages": false,
      "outputFormat": "both",
      "maxConcurrent": 3
    },
    "priority": 1
  }
}
```

---

## 👀 5. 监控任务 (Monitor Task)

### 任务配置
```typescript
interface MonitorTaskConfig {
  accounts: string[];                  // 监控账号列表
  interval: number;                     // 监控间隔（分钟）
  checkNewPosts: boolean;              // 检查新帖子
  checkComments: boolean;               // 检查评论
  notifications: {                     // 通知设置
    webhook?: string;                  // Webhook地址
    email?: string;                    // 邮箱地址
    aiAnalysis?: boolean;              // AI分析通知
  };
  duration: number;                     // 监控持续时间（小时）
}
```

### 执行流程
1. **初始化监控**
   - 设置定时器
   - 建立基线数据
   - 配置通知渠道

2. **定期检查**
   - 按间隔检查账号
   - 对比历史数据
   - 识别新内容

3. **通知处理**
   - 生成变化报告
   - 发送通知
   - 更新监控状态

### MCP交互示例
```json
// 提交监控任务
{
  "tool": "weibo_submit_task",
  "arguments": {
    "taskType": "monitor",
    "taskConfig": {
      "accounts": ["1234567890", "9876543210"],
      "interval": 30,
      "checkNewPosts": true,
      "checkComments": false,
      "notifications": {
        "webhook": "https://hooks.slack.com/...",
        "aiAnalysis": true
      },
      "duration": 24
    },
    "priority": 4
  }
}
```

---

## 📅 6. 时间线抓取任务 (Timeline Crawl Task)

### 任务配置
```typescript
interface TimelineCrawlTaskConfig {
  postCount: number;                   // 抓取帖子数量
  includeComments: boolean;            // 包含评论
  downloadMedia: boolean;              // 下载媒体文件
  outputFormat: 'markdown' | 'json';
  maxScrollDepth: number;              // 最大滚动深度
  filterKeywords?: string[];           // 过滤关键词
}
```

### 执行流程
1. **登录验证**
   - 确保已登录状态
   - 访问时间线页面

2. **滚动抓取**
   - 模拟滚动加载
   - 提取帖子信息
   - 处理动态内容

3. **内容处理**
   - 去重和过滤
   - 媒体下载
   - 格式输出

---

## 🔄 通用结果格式

### 任务状态响应
```typescript
interface TaskStatusResponse {
  success: boolean;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  submittedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: {
    current: number;
    total: number;
    percentage: number;
    message: string;
  };
  estimatedDuration?: number;
  executionTime?: number;
}
```

### 任务结果响应
```typescript
interface TaskResultResponse {
  success: boolean;
  taskId: string;
  result: {
    summary: {
      totalItems: number;
      processedItems: number;
      errorCount: number;
      executionTime: number;
      directories: string[];
      files: string[];
    };
    files?: string[];
    directories?: string[];
    metadata?: Record<string, any>;
  };
  format: 'summary' | 'files' | 'full';
}
```

### 系统状态响应
```typescript
interface SystemStatusResponse {
  success: true;
  timestamp: string;
  version: string;
  queueStats: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  resourceStats: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  };
}
```

---

## 🧪 测试计划

### 单元测试
1. **任务配置验证测试**
2. **目录结构创建测试**
3. **进度跟踪测试**
4. **错误处理测试**

### 集成测试
1. **端到端任务流程测试**
2. **并发处理测试**
3. **资源限制测试**
4. **结果格式验证测试**

### 压力测试
1. **大量任务提交测试**
2. **长时间运行测试**
3. **内存泄漏测试**
4. **网络异常恢复测试**

---

## 📝 实现优先级

1. **高优先级**: Login Task → Profile Crawl Task
2. **中优先级**: Search Task → Batch Process Task
3. **低优先级**: Monitor Task → Timeline Crawl Task

每个任务完成后都将进行完整的MCP交互测试，确保功能正常。