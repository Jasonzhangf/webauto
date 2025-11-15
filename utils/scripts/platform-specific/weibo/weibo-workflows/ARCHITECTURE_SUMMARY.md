# 微博工作流系统架构总结

## 项目概述

本项目是一个基于原子操作子模式的微博工作流系统，提供了结构化的自动化数据处理框架。系统支持三种主要的微博页面类型（主页、个人主页、搜索结果），并提供了灵活的工作流编排和组合能力。

## 核心特性

### 1. 基于原子操作子模式
- 所有工作流都基于原子操作构建
- 支持操作组合和重用
- 统一的错误处理和日志记录
- 模块化设计，易于扩展

### 2. 工作流编排系统
- 统一的工作流管理接口
- 支持工作流注册和发现
- 批量执行和并发控制
- 复合工作流支持

### 3. 智能导航策略
- 微博专用页面等待策略
- 智能滚动和内容加载检测
- 自动重试和错误恢复机制
- 性能优化策略

### 4. 数据处理管道
- 结构化数据提取和验证
- 自动去重和过滤
- 灵活的数据转换和输出格式
- 结果聚合和分析

## 系统架构

### 目录结构
```
scripts/weibo-workflows/
├── core/                          # 核心框架
│   ├── base-workflow.js           # 基础工作流抽象类
│   ├── workflow-orchestrator.js   # 工作流编排器
│   ├── workflow-registry.js       # 工作流注册表
│   └── atomic-operations/         # 原子操作库
│       ├── base-atomic-operation.js    # 基础原子操作
│       └── navigation-operations.js    # 导航相关操作
├── workflows/                     # 具体工作流实现
│   ├── weibo-homepage-workflow.js    # 微博主页工作流
│   ├── weibo-profile-workflow.js     # 个人主页工作流
│   ├── weibo-search-workflow.js      # 搜索结果工作流
│   └── composite-workflows.js         # 复合工作流
├── examples/                      # 使用示例
│   ├── simple-execution.js           # 简单执行示例
│   ├── batch-execution.js            # 批量执行示例
│   └── composite-execution.js        # 复合执行示例
├── config/                        # 配置文件
│   ├── workflow-configs.json         # 工作流配置
│   └── batch-execution-example.json  # 批量执行配置
├── weibo-workflow-runner.js       # 主运行器
├── README.md                      # 说明文档
├── USAGE.md                       # 使用说明
└── ARCHITECTURE_SUMMARY.md       # 架构总结
```

### 核心组件

#### 1. BaseWorkflow（基础工作流类）
- 所有具体工作流的基类
- 提供统一的工作流接口
- 集成原子操作管理
- 提供生命周期管理
- 内置统计和报告功能

#### 2. WorkflowOrchestrator（工作流编排器）
- 工作流的统一管理和执行
- 支持单个和批量执行
- 并发控制和资源管理
- 自动发现和注册工作流
- 统计监控和报告生成

#### 3. WorkflowRegistry（工作流注册表）
- 工作流的注册和发现
- 分类管理和依赖检查
- 配置验证和导入导出
- 搜索和过滤功能

#### 4. Atomic Operations（原子操作库）
- 基础原子操作抽象类
- 导航相关操作
- 数据提取操作
- 页面交互操作
- 验证和错误处理操作

## 工作流类型

### 1. WeiboHomepageWorkflow（微博主页工作流）
- **目标**: `https://weibo.com`
- **功能**: 提取微博主页的热门帖子和推荐内容
- **特点**: 智能滚动加载、自动分页、内容验证
- **输出**: 帖子列表、作者信息、发布时间、内容摘要

### 2. WeiboProfileWorkflow（个人主页工作流）
- **目标**: `https://weibo.com/u/{userId}` 或 `https://weibo.com/{username}`
- **功能**: 提取用户个人主页的帖子和用户信息
- **特点**: 用户信息提取、时间线分析、统计数据收集
- **输出**: 用户信息、帖子列表、统计数据、时间线数据

### 3. WeiboSearchWorkflow（搜索结果工作流）
- **目标**: `https://weibo.com/search?q={keyword}`
- **功能**: 提取搜索结果的帖子和相关推荐
- **特点**: 关键词过滤、相关性分析、多维度排序
- **输出**: 搜索结果、相关搜索、搜索建议、相关性评分

### 4. 复合工作流
- **WeiboCompleteScanWorkflow**: 完整扫描复合工作流
- **WeiboKeywordMonitoringWorkflow**: 关键词监控工作流
- **WeiboUserTrackingWorkflow**: 用户追踪工作流
- **特点**: 工作流组合、数据聚合、趋势分析、智能告警

## 使用方式

### 1. 命令行使用
```bash
# 执行主页工作流
node weibo-workflow-runner.js -w homepage --max-posts 30

# 执行搜索工作流
node weibo-workflow-runner.js -w search --keyword "技术" --max-posts 20

# 执行个人主页工作流
node weibo-workflow-runner.js -w profile --profile-url "https://weibo.com/u/1234567890"

# 批量执行
node weibo-workflow-runner.js batch config/batch-execution-example.json

# 关键词监控
node weibo-workflow-runner.js monitor 人工智能 区块链 机器学习

# 用户追踪
node weibo-workflow-runner.js track 用户A 用户B 用户C
```

### 2. 编程方式使用
```javascript
const { chromium } = require('playwright');
const WorkflowOrchestrator = require('./core/workflow-orchestrator');

async function runWorkflow() {
  // 启动浏览器
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 创建编排器
  const orchestrator = new WorkflowOrchestrator();

  // 执行工作流
  const result = await orchestrator.executeWorkflow('weibo-homepage', {
    context: { page, browser, context },
    maxPosts: 20
  });

  console.log('结果:', result);

  // 清理
  await browser.close();
  await orchestrator.destroy();
}
```

### 3. 批量执行
```javascript
const workflowConfigs = [
  {
    name: 'weibo-homepage',
    options: { maxPosts: 15 }
  },
  {
    name: 'weibo-search',
    options: { keyword: '技术', maxResults: 10 }
  }
];

const results = await orchestrator.executeBatch(workflowConfigs, {
  continueOnError: true,
  delayBetweenWorkflows: 2000
});
```

## 数据流和执行模式

### 1. 执行流程
```
1. 初始化 → 2. 验证配置 → 3. 创建实例 → 4. 执行原子操作 → 5. 数据处理 → 6. 结果输出 → 7. 清理资源
```

### 2. 原子操作执行
```
参数验证 → 上下文检查 → 前置处理 → 执行操作 → 后置处理 → 结果返回 → 统计更新
```

### 3. 错误处理
```
错误捕获 → 日志记录 → 重试判断 → 降级处理 → 结果标记 → 继续执行
```

### 4. 数据处理
```
原始数据 → 数据验证 → 数据转换 → 去重过滤 → 格式化 → 结果聚合
```

## 配置管理

### 1. 工作流配置
- 浏览器配置
- 上下文配置
- 编排器配置
- 工作流特定配置

### 2. 原子操作配置
- 超时设置
- 重试策略
- 参数验证
- 错误处理

### 3. 输出配置
- 格式选择
- 路径设置
- 压缩选项
- 元数据包含

## 性能优化

### 1. 资源管理
- 自动浏览器实例管理
- 内存使用监控和清理
- 并发操作限制
- 智能重试机制

### 2. 执行效率
- 智能等待策略
- 并行操作支持
- 结果缓存机制
- 增量数据处理

### 3. 网络优化
- 请求节流
- 重试机制
- 超时控制
- 连接复用

## 扩展性设计

### 1. 新工作流添加
- 继承 BaseWorkflow 类
- 实现必需方法
- 注册原子操作
- 配置工作流参数

### 2. 新原子操作添加
- 继承 BaseAtomicOperation 类
- 实现执行逻辑
- 添加参数验证
- 集成到工作流

### 3. 自定义数据处理
- 实现 dataProcessing 配置
- 添加验证规则
- 自定义转换函数
- 配置输出格式

## 监控和日志

### 1. 执行监控
- 实时状态跟踪
- 性能指标收集
- 错误率统计
- 资源使用监控

### 2. 日志系统
- 多级别日志记录
- 文件自动轮转
- 结构化日志格式
- 错误追踪

### 3. 报告生成
- 执行统计报告
- 错误分析报告
- 性能分析报告
- 数据质量报告

## 安全和稳定性

### 1. 错误恢复
- 自动重试机制
- 失败点恢复
- 降级处理策略
- 资源清理保证

### 2. 安全措施
- 用户代理管理
- Cookie 处理
- 验证码处理
- 访问频率控制

### 3. 稳定性保证
- 超时控制
- 内存限制
- 并发控制
- 异常处理

## 总结

本系统通过原子操作子模式和统一的工作流编排，提供了强大而灵活的微博数据处理能力。系统具有以下优势：

1. **模块化设计**: 清晰的分层架构，易于维护和扩展
2. **原子化操作**: 可重用的原子操作库，提高代码复用性
3. **统一接口**: 标准化的工作流接口，降低使用复杂度
4. **智能编排**: 支持复杂的工作流组合和依赖管理
5. **性能优化**: 多层次的性能优化策略
6. **监控完备**: 全面的执行监控和日志系统

该系统不仅满足了当前的微博数据处理需求，还提供了良好的扩展性，可以轻松适应未来的功能扩展和需求变化。