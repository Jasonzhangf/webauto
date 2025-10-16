# 微博批量处理工作流系统

## 🎯 设计理念

**基于JSON配置的标准工作流引擎**，专门用于微博三种主要页面的批量链接获取和内容下载：
- **主页批量处理**：从微博主页提取热门帖子链接并批量下载内容
- **搜索结果批量处理**：从搜索结果页面提取相关帖子链接并批量下载
- **个人主页批量处理**：从用户个人主页提取帖子链接并批量下载

## 📁 工作流架构

```
workflows/
├── engine/                           # 工作流引擎核心
│   ├── WorkflowEngine.js             # 主引擎
│   ├── NodeRegistry.js               # 节点注册器
│   ├── VariableManager.js            # 变量管理器
│   └── Logger.js                     # 日志管理器
├── engine/nodes/                     # 标准节点实现
│   ├── BaseNode.js                   # 基础节点类
│   ├── StartNode.js                  # 开始节点
│   ├── BrowserInitNode.js            # 浏览器初始化
│   ├── CookieLoaderNode.js          # Cookie加载
│   ├── NavigationNode.js             # 页面导航
│   ├── LoginVerificationNode.js      # 登录验证
│   ├── ScrollCaptureNode.js          # 滚动捕获
│   ├── PaginationCaptureNode.js      # 分页捕获
│   ├── URLBuilderNode.js             # URL构建
│   ├── ResultSaverNode.js            # 结果保存
│   ├── FileReaderNode.js             # 文件读取
│   ├── ContentDownloadNode.js        # 内容下载
│   ├── DownloadResultSaverNode.js    # 下载结果保存
│   └── EndNode.js                    # 结束节点
├── weibo-homepage-workflow.json      # 主页链接捕获工作流配置
├── weibo-search-workflow.json        # 搜索结果链接捕获工作流配置
├── weibo-profile-workflow.json       # 个人主页链接捕获工作流配置
├── weibo-download-workflow.json      # 内容下载工作流配置
├── WorkflowRunner.js                 # 工作流执行器
├── weibo-download-runner.js          # 下载工作流执行器
└── README.md                         # 本文档
```

## 📁 文件用途说明

### 工作流配置文件
- **weibo-homepage-workflow.json** - 主页链接捕获工作流的JSON配置，定义节点连接和参数
- **weibo-search-workflow.json** - 搜索结果链接捕获工作流的JSON配置，支持关键词搜索
- **weibo-profile-workflow.json** - 个人主页链接捕获工作流的JSON配置，支持用户ID访问
- **weibo-download-workflow.json** - 内容下载工作流的JSON配置，用于批量下载微博内容

### 执行文件
- **WorkflowRunner.js** - 工作流执行器，提供统一的命令行接口来运行链接捕获工作流
- **weibo-download-runner.js** - 下载工作流执行器，专门用于执行内容下载工作流

### 引擎核心文件
- **engine/WorkflowEngine.js** - 工作流引擎核心，负责工作流的加载、验证和执行
- **engine/NodeRegistry.js** - 节点注册器，管理所有可用节点类型
- **engine/VariableManager.js** - 变量管理器，处理工作流变量和状态传递
- **engine/Logger.js** - 日志管理器，提供统一的日志记录功能

### 节点实现文件
- **engine/nodes/BaseNode.js** - 所有节点的基类，定义节点接口和通用功能
- **engine/nodes/StartNode.js** - 开始节点，初始化工作流执行环境
- **engine/nodes/BrowserInitNode.js** - 浏览器初始化节点，启动浏览器实例
- **engine/nodes/CookieLoaderNode.js** - Cookie加载节点，处理登录状态
- **engine/nodes/NavigationNode.js** - 页面导航节点，处理页面跳转
- **engine/nodes/LoginVerificationNode.js** - 登录验证节点，检查登录状态
- **engine/nodes/ScrollCaptureNode.js** - 滚动捕获节点，处理无限滚动页面
- **engine/nodes/PaginationCaptureNode.js** - 分页捕获节点，处理分页页面
- **engine/nodes/URLBuilderNode.js** - URL构建节点，动态构建目标URL
- **engine/nodes/ResultSaverNode.js** - 结果保存节点，保存链接捕获结果
- **engine/nodes/FileReaderNode.js** - 文件读取节点，读取链接文件
- **engine/nodes/ContentDownloadNode.js** - 内容下载节点，批量下载微博内容
- **engine/nodes/DownloadResultSaverNode.js** - 下载结果保存节点，保存下载结果
- **engine/nodes/EndNode.js** - 结束节点，清理资源并生成报告

## 🚀 使用方法

### 1. 链接捕获工作流
```bash
# 主页链接捕获工作流
node workflows/WorkflowRunner.js homepage

# 搜索结果链接捕获工作流
node workflows/WorkflowRunner.js search 查理柯克

# 个人主页链接捕获工作流
node workflows/WorkflowRunner.js profile 2192828333
```

### 2. 内容下载工作流
```bash
# 使用下载工作流执行器
node workflows/weibo-download-runner.js <链接文件路径> [下载目录]

# 示例：下载主页链接捕获结果的内容
node workflows/weibo-download-runner.js ~/.webauto/weibo/weibo-links-homepage-2025-09-30-12-00-00.json
```

### 3. 编程方式使用
```javascript
import WorkflowRunner from './workflows/WorkflowRunner.js';
import runDownloadWorkflow from './workflows/weibo-download-runner.js';

const runner = new WorkflowRunner();

// 运行主页链接捕获工作流
const captureResult = await runner.runHomepageWorkflow();

// 运行内容下载工作流
const downloadResult = await runDownloadWorkflow();
```

## 🎨 节点类型详解

### 核心节点
- **StartNode** - 工作流开始，初始化变量
- **EndNode** - 工作流结束，清理资源，保存日志

### 浏览器操作节点
- **BrowserInitNode** - 初始化浏览器实例
- **CookieLoaderNode** - 加载Cookie文件
- **NavigationNode** - 页面导航
- **LoginVerificationNode** - 验证登录状态

### 数据捕获节点
- **ScrollCaptureNode** - 滚动捕获（无限滚动页面）
- **PaginationCaptureNode** - 分页捕获（分页页面）

### 工具节点
- **URLBuilderNode** - 构建目标URL
- **ResultSaverNode** - 保存链接捕获结果到文件
- **FileReaderNode** - 读取链接文件
- **ContentDownloadNode** - 批量下载微博内容
- **DownloadResultSaverNode** - 保存下载结果到文件

## 📊 工作流执行流程

```
链接捕获流程：
StartNode → BrowserInitNode → CookieLoaderNode → NavigationNode →
LoginVerificationNode → [ScrollCaptureNode|PaginationCaptureNode] →
ResultSaverNode → EndNode

内容下载流程：
StartNode → BrowserInitNode → CookieLoaderNode → FileReaderNode →
ContentDownloadNode → DownloadResultSaverNode → EndNode
```

这个设计实现了真正的**配置驱动工作流引擎**，支持：
- 可视化工作流设计
- 动态参数配置
- 错误处理和重试
- 详细的执行日志
- 性能监控和统计