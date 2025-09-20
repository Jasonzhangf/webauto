# 微博批量下载工作流系统

## 🎯 设计理念

**基于JSON配置的标准工作流引擎**，专门用于微博三种主要页面的批量内容下载：
- **主页批量下载**：从微博主页提取热门帖子并批量下载内容
- **搜索结果批量下载**：从搜索结果页面提取相关帖子并批量下载
- **个人主页批量下载**：从用户个人主页提取帖子并批量下载

## 📁 批量下载工作流架构

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
│   └── EndNode.js                    # 结束节点
├── weibo-homepage-workflow.json      # 主页批量下载工作流配置
├── weibo-search-workflow.json        # 搜索结果批量下载工作流配置
├── weibo-profile-workflow.json       # 个人主页批量下载工作流配置
├── weibo-homepage-workflow.js        # 主页批量下载工作流实现
├── weibo-search-workflow.js          # 搜索结果批量下载工作流实现
├── weibo-profile-workflow.js         # 个人主页批量下载工作流实现
├── WorkflowRunner.js                 # 工作流执行器
├── workflow-manager.js              # 工作流管理器
└── README.md                         # 本文档
```

## 📁 架构设计

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
│   └── EndNode.js                    # 结束节点
├── weibo-homepage-workflow.json      # 主页工作流配置
├── weibo-search-workflow.json        # 搜索页工作流配置
├── weibo-profile-workflow.json       # 个人主页工作流配置
├── WorkflowRunner.js                 # 工作流执行器
└── README.md                         # 本文档
```

## 📁 文件用途说明

### 工作流配置文件
- **weibo-homepage-workflow.json** - 主页批量下载工作流的JSON配置，定义节点连接和参数
- **weibo-search-workflow.json** - 搜索结果批量下载工作流的JSON配置，支持关键词搜索
- **weibo-profile-workflow.json** - 个人主页批量下载工作流的JSON配置，支持用户ID访问

### 工作流实现文件
- **weibo-homepage-workflow.js** - 主页批量下载工作流的具体实现，处理微博主页链接提取和内容下载
- **weibo-search-workflow.js** - 搜索结果批量下载工作流的具体实现，处理搜索页面链接提取和内容下载
- **weibo-profile-workflow.js** - 个人主页批量下载工作流的具体实现，处理用户主页链接提取和内容下载

### 管理和执行文件
- **WorkflowRunner.js** - 工作流执行器，提供统一的命令行接口来运行各种工作流
- **workflow-manager.js** - 工作流管理器，负责工作流的注册、状态管理和错误处理

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
- **engine/nodes/ResultSaverNode.js** - 结果保存节点，保存下载结果
- **engine/nodes/EndNode.js** - 结束节点，清理资源并生成报告

## 🚀 使用方法

### 1. 通过工作流执行器运行
```bash
# 主页批量下载工作流
node workflows/WorkflowRunner.js homepage

# 搜索结果批量下载工作流
node workflows/WorkflowRunner.js search 查理柯克

# 个人主页批量下载工作流
node workflows/WorkflowRunner.js profile 2192828333
```

### 2. 编程方式使用
```javascript
import WorkflowRunner from './workflows/WorkflowRunner.js';

const runner = new WorkflowRunner();

// 运行主页工作流
const result = await runner.runHomepageWorkflow();

// 运行搜索工作流
const searchResult = await runner.runSearchWorkflow('查理柯克');

// 运行个人主页工作流
const profileResult = await runner.runProfileWorkflow('2192828333');
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
- **ResultSaverNode** - 保存结果到文件

## 📊 JSON配置示例

```json
{
  "name": "Weibo Homepage Link Capture Workflow",
  "description": "微博主页链接捕获工作流",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "start",
      "type": "StartNode",
      "name": "开始节点",
      "next": ["browser_init"]
    },
    {
      "id": "browser_init",
      "type": "BrowserInitNode",
      "name": "浏览器初始化",
      "config": {
        "headless": false,
        "viewport": { "width": 1920, "height": 1080 }
      },
      "next": ["load_cookies"]
    }
    // ... 更多节点
  ],
  "globalConfig": {
    "logLevel": "info",
    "timeout": 300000
  },
  "variables": {
    "capturedLinks": [],
    "startTime": null,
    "endTime": null
  }
}
```

## 🎨 架构优势

### ✅ JSON配置驱动
1. **可视化友好** - 支持拖拽式工作流设计器
2. **版本控制** - 配置文件可以版本化管理
3. **参数化** - 支持动态参数和模板替换
4. **标准化** - 统一的工作流定义格式

### ✅ 模块化设计
1. **标准节点系统** - 预定义的节点类型，开箱即用
2. **可扩展性** - 支持自定义节点类型
3. **错误处理** - 完善的错误处理和重试机制
4. **日志系统** - 详细的执行日志和调试信息

### ✅ 引擎核心
1. **统一执行引擎** - 一个引擎处理所有工作流
2. **变量管理** - 动态变量传递和状态管理
3. **节点注册器** - 灵活的节点类型注册机制
4. **性能监控** - 执行时间统计和性能分析

## 📊 执行结果示例

```json
{
  "success": true,
  "results": {
    "links": [...],
    "target": 50,
    "actual": 51
  },
  "variables": {
    "capturedLinks": [...],
    "scrollCount": 15,
    "startTime": "2025-09-19T07:29:08.120Z",
    "endTime": "2025-09-19T07:35:23.456Z"
  },
  "executionTime": 375336
}
```

## 🔄 工作流执行流程

```
StartNode → BrowserInitNode → CookieLoaderNode → NavigationNode →
LoginVerificationNode → [ScrollCaptureNode|PaginationCaptureNode] →
ResultSaverNode → EndNode
```

这个设计实现了真正的**配置驱动工作流引擎**，支持：
- 可视化工作流设计
- 动态参数配置
- 错误处理和重试
- 详细的执行日志
- 性能监控和统计