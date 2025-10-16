# 微博页面容器设计蓝图

## 📋 项目概述

本文档定义了微博页面自动化分析的完整容器设计方案。

## 🏗️ 整体架构

### 设计原则
- 层次化：清晰的父子关系
- 模块化：每个容器独立封装
- 容错性：部分容器缺失不影响整体
- 高效性：优先加载重要内容
- 安全性：内置防反机器人保护

### 核心流程
微博主页 → 批量链接发现 → 逐个帖子分析 → 深度数据提取

## 🏠 主页容器层次设计

### 根容器：weibo-homepage
- **用途**: 微博主页整体容器
- **检测**: URL匹配 weibo.com 或 body包含微博标识

### 子容器结构
```
weibo-homepage
├── navigation (主导航栏)
│   ├── logo (微博logo)
│   ├── search-bar (搜索框)
│   └── user-menu (用户菜单)
├── sidebar (侧边栏)
│   ├── hot-topics (热门话题)
│   ├── recommendations (推荐用户)
│   └── trending (热搜榜)
└── main-content (主内容区)
    └── feed-container (信息流容器)
        ├── weibo-card-* (微博卡片集合)
        ├── load-more-trigger (加载更多触发器)
        └── infinite-scroll-detector (无限滚动检测)
```

### 关键选择器定义
```typescript
const WEIBO_HOME_SELECTORS = {
  root: 'body',
  navigation: '.gn_header',
  sidebar: '.gn_sidebar',
  mainContent: '.WB_main',
  feed: '[data-e2e="feed"]',
  card: '[data-e2e="feed-item"]',
  loadMore: '.more_loading',
  scroller: '.scroll_container'
}
```

## 📄 帖子详情容器设计

### 根容器：weibo-post
- **用途**: 单条微博帖子详细页面
- **检测**: URL包含 /status/ 或 /p/ 模式

### 完整容器层次
```
weibo-post
├── header (帖子头部)
│   ├── author-info (作者信息区)
│   │   ├── avatar (头像)
│   │   ├── username (用户名)
│   │   └── verified (认证标识)
│   └── post-meta (发布信息)
│       ├── publish-time (发布时间)
│       ├── source (发布来源)
│       └── location (地理位置)
├── content (内容区域)
│   ├── text-content (文本内容)
│   │   └── hashtags (话题标签)
│   ├── media-grid (媒体网格)
│   │   ├── image-* (图片元素)
│   │   ├── video-* (视频元素)
│   │   └── article-* (文章卡片)
│   └── embedded-links (嵌入链接)
│       ├── quoted-post (引用帖子)
│       └── external-link (外部链接)
├── engagement-bar (互动栏)
│   ├── repost (转发按钮)
│   ├── comment (评论按钮)
│   └── like (点赞按钮)
└── comments-section (评论区)
    ├── comments-header (评论头部)
    │   ├── sort-options (排序选项)
    │   └── comment-count (评论数量)
    ├── comment-list (评论列表)
    │   └── comment-* (单条评论)
    │       ├── comment-author (评论作者)
    │       ├── comment-content (评论内容)
    │       ├── comment-time (评论时间)
    │       ├── comment-likes (点赞数)
    │       └── comment-replies (回复区域)
    │           └── reply-* (单条回复)
    └── load-more-comments (加载更多评论)
```

### 帖子选择器配置
```typescript
const WEIBO_POST_SELECTORS = {
  root: '[data-e2e="content"]',
  author: {
    avatar: '[data-e2e="avatar"]',
    name: '[data-e2e="author-name"]',
    verified: '[data-e2e="verified"]'
  },
  content: {
    text: '[data-e2e="text"]',
    images: '[data-e2e="image-grid"] img',
    video: '[data-e2e="video-player"]',
    article: '[data-e2e="article-card"]'
  },
  engagement: {
    repost: '[data-e2e="repost-btn"]',
    comment: '[data-e2e="comment-btn"]',
    like: '[data-e2e="like-btn"]'
  },
  comments: {
    container: '[data-e2e="comment-list"]',
    item: '[data-e2e="comment-item"]',
    content: '[data-e2e="comment-text"]',
    loadMore: '[data-e2e="comment-more"]'
  }
}
```

## 🔄 无限滚动检测策略

### 检测机制
#### 1. 主页信息流滚动
- **触发条件**: 滚动到页面底部80%位置
- **DOM监听**: 监听feed容器内新增的weibo-card元素
- **时间检测**: 间隔2-5秒检查新内容加载
- **失效处理**: 连续3次无新内容则停止滚动

#### 2. 评论区域滚动
- **加载更多**: 点击"查看更多评论"按钮
- **自动展开**: 逐层展开回复内容
- **深度限制**: 最多展开5层回复链
- **频率控制**: 每次展开间隔1-3秒

### 滚动实现策略
```typescript
interface ScrollStrategy {
  // 主页滚动
  homepage: {
    scrollInterval: [2000, 5000], // 2-5秒随机间隔
    scrollThreshold: 0.8,        // 滚动到80%位置
    maxAttempts: 10,             // 最大尝试次数
    waitTimeout: 30000,          // 30秒超时
  },
  // 评论滚动
  comments: {
    expandDelay: [1000, 3000],   // 1-3秒随机延迟
    maxDepth: 5,                // 最大回复深度
    batchSize: 5,               // 每批加载评论数
    retryCount: 3               // 重试次数
  }
}
```

### 关键检测点
- **高度变化**: `document.documentElement.scrollHeight` 增加
- **元素新增**: MutationObserver监听DOM变化
- **加载指示器**: 检测loading动画或文字
- **按钮出现**: "加载更多"按钮的显示/隐藏
- **内容重复**: 避免重复加载相同内容

### 错误处理
- **网络超时**: 自动重试机制
- **页面跳转**: 检测URL变化重新初始化
- **反爬触发**: 暂停并增加延迟时间
- **内容异常**: 记录错误并跳过当前项目
```

## 🛡️ 防反机器人保护机制

### 核心保护策略
#### 1. 时间间隔控制
- **滚动操作**: 2-5秒随机间隔，模拟人类阅读速度
- **点击操作**: 1-3秒随机延迟，避免机器化操作
- **页面切换**: 3-8秒间隔，模拟页面浏览习惯
- **数据提取**: 500ms-2秒处理间隔，模拟思考时间

#### 2. 行为模拟
```typescript
interface HumanBehavior {
  // 鼠标移动
  mouseMovement: {
    randomMoves: true,          // 随机移动鼠标
    scrollVariation: [0.7, 1.3], // 滚动速度变化
    pauseProbability: 0.15      // 15%概率暂停
  },
  // 视窗操作
  viewport: {
    resizeRandom: true,         // 随机调整窗口大小
    focusChange: true,          // 切换窗口焦点
    scrollBack: true            // 偶尔回滚查看
  },
  // 键盘活动
  keyboard: {
    randomKeys: true,           // 随机按键
    searchSimulate: true        // 模拟搜索行为
  }
}
```

#### 3. 请求频率限制
- **并发限制**: 最多同时处理2-3个帖子
- **请求间隔**: 同一IP间隔至少30秒
- **失败退避**: 指数退避策略，最长延迟5分钟
- **时段控制**: 避开高峰时段(19:00-23:00)

#### 4. 浏览器指纹管理
```typescript
interface BrowserFingerprint {
  // User-Agent轮换
  userAgent: {
    rotation: true,
    commonBrowsers: ['Chrome', 'Firefox', 'Safari'],
    versionRange: ['90-100', '85-95', '14-16']
  },
  // 视窗大小
  viewport: {
    common: ['1920x1080', '1366x768', '1440x900'],
    randomOffset: [-100, 100]
  },
  // 时区和语言
  locale: {
    timezone: ['Asia/Shanghai', 'Asia/Beijing'],
    language: ['zh-CN', 'zh']
  }
}
```

### 检测与应对
#### 反爬检测信号
- **验证码出现**: 自动暂停等待用户处理
- **IP封禁**: 切换代理或延长等待时间
- **账号异常**: 暂停操作并发送通知
- **页面异常**: 记录错误并调整策略

#### 自适应调整
```typescript
interface AdaptiveControl {
  // 动态延迟
  delayAdjustment: {
    baseDelay: 3000,
    maxDelay: 300000,  // 5分钟
    increaseRate: 1.5,
    decreaseRate: 0.8
  },
  // 成功率监控
  successRate: {
    threshold: 0.8,     // 80%成功率
    windowSize: 20,     // 20次操作窗口
    adjustmentStep: 1000 // 调整步长
  }
}
```

### 安全最佳实践
- **Cookie管理**: 安全存储和轮换
- **代理池**: 多地区IP轮换
- **日志记录**: 详细的操作日志用于分析
- **异常监控**: 实时监控系统状态
- **数据加密**: 敏感数据加密存储
```

## 📊 数据提取策略

### 提取优先级
#### 1. 核心数据 (最高优先级)
- **帖子ID**: 唯一标识符
- **作者信息**: 用户名、ID、认证状态
- **发布时间**: 精确时间戳
- **文本内容**: 完整帖子内容
- **互动数据**: 转发、评论、点赞数量

#### 2. 媒体内容 (高优先级)
- **图片**: 高清原图链接和缩略图
- **视频**: 视频地址、时长、封面图
- **文章**: 文章标题、链接、摘要
- **链接**: 内嵌链接和引用内容

#### 3. 评论数据 (中等优先级)
- **主评论**: 评论内容、作者、时间
- **回复链**: 多层回复的完整结构
- **互动数据**: 评论的点赞、回复数
- **时间排序**: 评论的时间分布

#### 4. 扩展数据 (低优先级)
- **话题标签**: 相关话题和标签
- **地理位置**: 发布地点信息
- **设备信息**: 发布客户端类型
- **转发链**: 转发路径和引用

### 数据结构定义
```typescript
interface WeiboPost {
  // 基础信息
  id: string;
  url: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    verified: boolean;
    verificationType: string;
  };
  
  // 内容信息
  content: {
    text: string;
    hashtags: string[];
    mentions: string[];
    links: string[];
  };
  
  // 媒体信息
  media: {
    images: Array<{
      url: string;
      thumbnail: string;
      width: number;
      height: number;
      size: number;
    }>;
    videos: Array<{
      url: string;
      thumbnail: string;
      duration: number;
      size: number;
    }>;
    articles: Array<{
      title: string;
      url: string;
      summary: string;
    }>;
  };
  
  // 互动数据
  engagement: {
    reposts: number;
    comments: number;
    likes: number;
    views?: number;
  };
  
  // 元数据
  metadata: {
    publishTime: Date;
    source: string;
    location?: string;
    client: string;
    isAd: boolean;
    isSensitive: boolean;
  };
  
  // 评论数据
  comments: WeiboComment[];
}

interface WeiboComment {
  id: string;
  author: {
    id: string;
    name: string;
    avatar: string;
  };
  content: string;
  publishTime: Date;
  likes: number;
  replies: WeiboComment[];
  depth: number;
}
```

### 提取算法策略
#### 1. 渐进式提取
```typescript
const EXTRACTION_PHASES = {
  phase1: {
    priority: ['id', 'author', 'content.text', 'publishTime'],
    timeout: 5000,
    retryCount: 2
  },
  phase2: {
    priority: ['media.images', 'media.videos', 'engagement'],
    timeout: 10000,
    retryCount: 3
  },
  phase3: {
    priority: ['comments', 'hashtags', 'links'],
    timeout: 30000,
    retryCount: 5
  }
}
```

#### 2. 内容验证
- **数据完整性**: 检查必需字段是否存在
- **格式验证**: 验证URL、时间戳格式
- **重复检测**: 避免重复提取相同内容
- **质量过滤**: 过滤低质量和垃圾内容

#### 3. 存储优化
- **增量存储**: 只存储新增和变化的数据
- **压缩算法**: 大文本内容压缩存储
- **索引策略**: 建立高效的数据索引
- **备份机制**: 定期备份重要数据

### 特殊情况处理
#### 登录状态检测
- **内容完整性**: 对比登录前后可见内容
- **功能可用性**: 检测高级功能是否可用
- **权限提示**: 处理权限不足的情况
- **Cookie验证**: 验证登录凭证有效性

#### 反爬绕过
- **内容解码**: 处理加密或混淆内容
- **动态加载**: 处理JavaScript动态生成内容
- **验证码处理**: 人工介入或自动识别
- **IP轮换**: 代理池自动切换
```

## 🚀 实现指南

### 文件结构
```
src/page-analyzer/
├── strategies/
│   ├── WeiboHomepageStrategy.ts      # 主页发现策略
│   ├── WeiboInfiniteScrollDetector.ts # 无限滚动检测
│   ├── WeiboLinkExtractor.ts         # 链接批量提取
│   ├── WeiboAntiBotProtection.ts     # 防反机器人保护
│   ├── WeiboPostAnalyzer.ts          # 帖子详细分析
│   ├── WeiboBatchAnalyzer.ts         # 批量分析协调器
│   └── weibo-batch-test.ts           # 完整测试用例
├── types/
│   └── index.ts                      # 类型定义
├── core/
│   ├── ContainerDiscoveryManager.ts  # 容器发现管理器
│   ├── HierarchyBuilder.ts           # 层次结构构建器
│   └── CapabilityEvaluator.ts        # 能力评估器
└── index.ts                          # 主入口
```

### 开发步骤
#### 第一阶段：核心框架 (优先级：高)
1. **WeiboHomepageStrategy.ts**
   - 实现主页容器发现逻辑
   - 集成现有的ContainerDiscoveryManager
   - 添加微博特定的选择器配置

2. **WeiboLinkExtractor.ts**
   - 实现链接批量提取功能
   - 支持/status/、/u/、/hashtag/模式
   - 添加去重和验证逻辑

#### 第二阶段：高级功能 (优先级：中)
3. **WeiboInfiniteScrollDetector.ts**
   - 实现无限滚动检测
   - 添加DOM变化监听
   - 集成加载更多按钮处理

4. **WeiboAntiBotProtection.ts**
   - 实现时间间隔控制
   - 添加行为模拟逻辑
   - 集成自适应调整机制

#### 第三阶段：完整分析 (优先级：中)
5. **WeiboPostAnalyzer.ts**
   - 实现帖子详细分析
   - 添加媒体内容提取
   - 集成评论区处理

6. **WeiboBatchAnalyzer.ts**
   - 实现批量分析协调
   - 添加并发控制
   - 集成进度监控

### 测试策略
#### 单元测试
- 每个组件独立测试
- 模拟DOM环境
- 验证选择器准确性

#### 集成测试
- 端到端流程测试
- 真实微博页面测试
- 性能和稳定性测试

#### 测试用例
```typescript
// 测试目标：https://weibo.com/1195242865/5216889711886736
const TEST_CASES = {
  homepage: {
    url: 'https://weibo.com',
    expectedContainers: ['feed-container', 'weibo-card'],
    minPosts: 20
  },
  postDetail: {
    url: 'https://weibo.com/1195242865/5216889711886736',
    expectedContainers: ['content', 'comments'],
    minComments: 10
  }
}
```

### 配置管理
#### 环境配置
```typescript
interface WeiboConfig {
  // 基础配置
  baseURL: string;
  timeout: number;
  retries: number;
  
  // 选择器配置
  selectors: typeof WEIBO_SELECTORS;
  
  // 防反爬配置
  antiBot: {
    delays: DelayConfig;
    behavior: BehaviorConfig;
    fingerprint: FingerprintConfig;
  };
  
  // 存储配置
  storage: {
    outputDir: string;
    maxFileSize: number;
    compression: boolean;
  };
}
```

### 部署和使用
#### 本地开发
```bash
# 安装依赖
npm run install:all

# 构建项目
npm run build:all

# 运行测试
npx ts-node src/page-analyzer/strategies/weibo-batch-test.ts
```

#### 生产部署
- **Docker容器化**: 打包为Docker镜像
- **云服务部署**: 支持AWS、阿里云等
- **监控告警**: 集成监控和日志系统
- **数据备份**: 自动数据备份策略

### 维护和更新
#### 定期维护
- **选择器更新**: 适应微博页面结构变化
- **性能优化**: 持续优化提取效率
- **安全加固**: 更新防反爬策略
- **功能扩展**: 添加新的数据类型

#### 版本管理
- **语义化版本**: 遵循SemVer规范
- **变更日志**: 详细的变更记录
- **向后兼容**: 保持API稳定性
- **迁移指南**: 版本升级指导

---

## 📝 总结

本设计蓝图提供了完整的微博页面容器分析解决方案，从主页链接发现到深度内容提取，涵盖了容器架构、防反爬机制、数据提取策略和实现指南。

**核心特性：**
- ✅ 层次化容器架构设计
- ✅ 智能无限滚动检测
- ✅ 全面防反机器人保护
- ✅ 渐进式数据提取策略
- ✅ 完整的实现和测试指南

**预期效果：**
- 高效批量提取微博内容
- 稳定可靠的自动化运行
- 完整的数据收集和分析
- 可扩展的架构设计

通过遵循这个设计蓝图，可以构建一个功能强大、稳定可靠的微博内容分析系统。
```