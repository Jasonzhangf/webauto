# 微博工作流系统

本目录包含基于原子操作子模式的微博工作流系统，支持三种主要微博页面的自动化处理：

## 工作流类型

### 1. 微博主页工作流 (`weibo-homepage-workflow.js`)
- **目标**: `https://weibo.com`
- **功能**: 提取微博主页的热门帖子、推荐内容
- **特点**: 智能滚动加载、自动分页

### 2. 个人主页工作流 (`weibo-profile-workflow.js`)
- **目标**: `https://weibo.com/u/{userId}` 或 `https://weibo.com/{username}`
- **功能**: 提取用户个人主页的帖子、用户信息
- **特点**: 用户信息提取、时间线分析

### 3. 搜索结果工作流 (`weibo-search-workflow.js`)
- **目标**: `https://weibo.com/search?q={keyword}`
- **功能**: 提取搜索结果的帖子、相关推荐
- **特点**: 关键词过滤、相关性分析

## 架构设计

```
weibo-workflows/
├── core/
│   ├── base-workflow.js              # 基础工作流抽象类
│   ├── workflow-orchestrator.js      # 工作流编排器
│   ├── workflow-registry.js          # 工作流注册表
│   └── atomic-operations/           # 原子操作库
├── workflows/
│   ├── weibo-homepage-workflow.js    # 微博主页工作流
│   ├── weibo-profile-workflow.js     # 个人主页工作流
│   ├── weibo-search-workflow.js      # 搜索结果工作流
│   └── composite-workflows.js        # 复合工作流
├── utils/
│   ├── workflow-utils.js             # 工作流工具函数
│   ├── data-processors.js           # 数据处理器
│   └── error-handlers.js            # 错误处理器
├── config/
│   ├── workflow-configs.js           # 工作流配置
│   └── atomic-configs.js             # 原子操作配置
└── examples/
    ├── simple-execution.js           # 简单执行示例
    ├── batch-execution.js            # 批量执行示例
    └── composite-execution.js        # 复合执行示例
```

## 核心特性

### 1. 基于原子操作子模式
- 所有工作流都基于原子操作子构建
- 支持操作组合和重用
- 统一的错误处理和日志记录

### 2. 工作流编排系统
- 支持工作流组合和串行/并行执行
- 动态工作流注册和发现
- 任务依赖管理和执行顺序控制

### 3. 智能导航策略
- 微博专用页面等待策略
- 智能滚动和内容加载检测
- 自动重试和错误恢复机制

### 4. 数据处理管道
- 结构化数据提取和验证
- 自动去重和过滤
- 灵活的数据转换和输出格式

## 使用方法

### 基础使用
```javascript
const { WorkflowOrchestrator } = require('./core/workflow-orchestrator');

// 创建工作流编排器
const orchestrator = new WorkflowOrchestrator();

// 执行单个工作流
const result = await orchestrator.executeWorkflow('weibo-homepage', {
  maxPosts: 50,
  saveResults: true
});

// 执行批量工作流
const results = await orchestrator.executeBatch([
  { name: 'weibo-homepage', options: { maxPosts: 30 } },
  { name: 'weibo-profile', options: { profileUrl: 'https://weibo.com/u/123456' } }
]);
```

### 复合工作流
```javascript
// 创建复合工作流
const compositeWorkflow = await orchestrator.createCompositeWorkflow('weibo-complete-scan', [
  'weibo-homepage',
  { name: 'weibo-search', options: { keyword: '技术' } },
  { name: 'weibo-profile', options: { profileUrl: 'https://weibo.com/u/123456' } }
]);

// 执行复合工作流
const results = await compositeWorkflow.execute();
```

## 配置说明

### 工作流配置
每个工作流都包含以下配置部分：
- `workflow`: 基础信息（名称、版本、描述）
- `selectors`: 页面选择器配置
- `atomicOperations`: 原子操作配置
- `workflowSteps`: 工作流步骤配置
- `dataProcessing`: 数据处理配置
- `errorHandling`: 错误处理配置
- `performance`: 性能配置

### 原子操作配置
支持多种原子操作类型：
- `navigate`: 页面导航
- `click`: 元素点击
- `input`: 文本输入
- `extract`: 数据提取
- `wait`: 等待操作
- `validate`: 验证操作

## 扩展开发

### 添加新的工作流
1. 在 `workflows/` 目录创建新的工作流文件
2. 继承 `BaseWorkflow` 类
3. 实现必需的方法（`initialize`, `execute`, `cleanup`）
4. 在工作流注册表中注册

### 添加新的原子操作
1. 在 `core/atomic-operations/` 目录创建新的原子操作
2. 实现标准的原子操作接口
3. 在原子操作工厂中注册

## 性能优化

### 1. 资源管理
- 自动浏览器实例管理
- 内存使用监控和清理
- 并发操作限制

### 2. 执行效率
- 智能等待策略
- 并行操作支持
- 缓存机制

### 3. 错误恢复
- 自动重试机制
- 失败点恢复
- 降级处理策略

## 监控和日志

### 执行监控
- 实时执行状态跟踪
- 性能指标收集
- 错误率统计

### 日志系统
- 结构化日志记录
- 多级别日志输出
- 日志文件自动管理

## 最佳实践

1. **原子操作设计**: 保持操作的单一性和可重用性
2. **错误处理**: 为每个操作添加适当的错误处理
3. **性能考虑**: 合理设置超时和重试参数
4. **数据验证**: 在工作流中添加数据验证步骤
5. **资源清理**: 确保在完成时正确清理资源

## 故障排除

### 常见问题
1. **页面加载超时**: 检查网络连接和等待策略配置
2. **元素找不到**: 检查选择器配置和页面结构变化
3. **数据提取失败**: 验证数据处理器配置和输出格式
4. **内存不足**: 调整并发操作限制和资源清理策略

### 调试工具
- 启用详细日志记录
- 使用截图功能保存中间状态
- 检查原子操作执行结果