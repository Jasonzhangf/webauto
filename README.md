# WebAuto - 事件驱动的Web自动化框架

## 🚀 项目概述

WebAuto是一个基于事件驱动架构的现代Web自动化框架，专门为复杂的Web数据采集和处理任务设计。项目采用三层解耦架构，结合了容器化操作子、工作流引擎和任务编排系统，提供了强大、灵活且可扩展的自动化解决方案。

## 🏗️ 核心架构

### 三层解耦设计

```
任务编排层 (Task Layer)
    ↓
工作流组合层 (Workflow Layer)
    ↓
操作子执行层 (Operation Layer)
    ↓
基础设施层 (Infrastructure Layer)
```

### 🆕 事件驱动容器系统

项目的核心创新是完全事件驱动的容器系统，实现了：

- **事件总线 (EventBus)** - 支持中间件、事件历史、错误隔离
- **工作流引擎 (WorkflowEngine)** - 基于规则的容器编排系统
- **事件驱动容器** - 滚动、链接提取、分页容器的自驱动架构
- **类型安全事件系统** - 完整的事件类型定义和数据结构

## 📦 核心模块

### 操作子库 (6大类)

#### 浏览器操作子
- 页面导航、内容提取、元素交互
- 智能滚动、自动分页、链接捕获
- Cookie管理、登录状态维护

#### 文件操作子
- 文件读写、格式转换、存储管理
- 批量下载、数据导出、压缩处理

#### AI模型操作子
- 文本推理、图像分析、多模态处理
- 内容分类、智能摘要、自动标注

#### 通信操作子
- HTTP请求、API调用、消息传递
- 代理管理、会话控制、错误重试

#### 数据处理操作子
- 数据验证、转换、聚合
- 内容过滤、去重、质量评估

#### 系统操作子
- 日志记录、监控告警、资源管理
- 性能统计、错误恢复、健康检查

### 工作流框架

#### 🆕 事件驱动工作流引擎
- **规则引擎** - 基于规则的容器行为控制
- **事件总线** - 容器间松耦合通信机制
- **条件执行** - 基于数据的分支逻辑
- **错误处理** - 多层次的错误恢复策略
- **性能优化** - 并行执行和资源管理

### 任务编排系统

#### 智能调度器
- **任务编排器** - 任务组合和依赖管理
- **调度系统** - Cron、间隔、事件调度
- **模板系统** - 可重用的任务模板
- **资源管理** - 智能资源分配和监控

## 🎯 关键特性

### 强大的编排能力
- ✅ **依赖管理** - 自动处理组件间依赖关系
- ✅ **条件执行** - 支持基于条件的分支逻辑
- ✅ **并行处理** - 多任务并发执行
- ✅ **错误恢复** - 完善的重试和回滚机制

### 智能调度系统
- ✅ **定时任务** - Cron 表达式调度
- ✅ **间隔任务** - 固定时间间隔执行
- ✅ **事件驱动** - 基于事件触发的执行
- ✅ **资源管理** - 智能资源分配和监控

### 用户友好
- ✅ **配置驱动** - JSON 配置文件控制行为
- ✅ **模板系统** - 预设的可重用模板
- ✅ **可视化监控** - 实时执行状态和日志
- ✅ **渐进复杂度** - 从简单到复杂的学习路径

## 🚀 实际应用场景

### 微博自动化系统 🆕

项目已经实现了完整的微博自动化解决方案，包括：

#### 事件驱动链接获取系统
- **EventDrivenPageContainer** - 协调多个子容器的工作
- **EventDrivenScrollContainer** - 智能滚动和内容检测
- **EventDrivenLinkContainer** - 自动链接提取和质量评估
- **EventDrivenPaginationContainer** - 多模式分页支持

#### 批量下载工作流
- **主页批量下载** - 从微博主页提取热门帖子
- **搜索结果下载** - 基于关键词搜索结果下载
- **个人主页下载** - 用户个人主页内容下载

#### 实际功能
- 📝 **内容提取** - 文字内容、图片文件、评论数据、视频链接
- 🔗 **链接处理** - 智能链接识别、去重、质量评估
- 🍪 **状态管理** - Cookie管理、登录状态维护
- 📊 **结果管理** - 批量下载、格式转换、数据导出

### 电商产品监控
- 价格监控、库存跟踪、竞品分析
- 自动化数据采集和报告生成

### 内容聚合平台
- 多源数据采集、内容清洗、智能分类
- 自动化内容发布和分发

## 📁 项目结构

```
webauto/
├── sharedmodule/                        # 共享模块
│   ├── operations-framework/            # 🆕 事件驱动操作子框架
│   │   ├── src/event-driven/           # 事件驱动系统核心
│   │   │   ├── EventBus.ts            # 事件总线
│   │   │   ├── WorkflowEngine.ts      # 工作流引擎
│   │   │   ├── EventDrivenContainer.ts # 容器基类
│   │   │   ├── EventDrivenScrollContainer.ts
│   │   │   ├── EventDrivenLinkContainer.ts
│   │   │   ├── EventDrivenPaginationContainer.ts
│   │   │   └── EventDrivenPageContainer.ts
│   │   ├── src/types/                  # 类型定义
│   │   └── docs/                       # 📖 文档
│   │       ├── EVENT_DRIVEN_SYSTEM_DOCUMENTATION.md
│   │       └── EVENT_DRIVEN_USAGE_GUIDE.md
│   ├── weibo-workflow-system/          # 微博工作流系统
│   │   ├── src/                        # 核心实现
│   │   ├── tests/                      # 测试文件
│   │   └── examples/                   # 使用示例
│   ├── browser-assistant/              # 浏览器助手
│   ├── openai-compatible-providers/    # AI模型提供商
│   └── webauto-ai-processor/           # AI处理模块
├── node-system/                        # 节点系统
│   ├── base-node.js                    # 基础节点定义
│   ├── workflow-engine.js              # 工作流引擎
│   └── nodes/                          # 节点实现
├── workflows/                          # 工作流系统
│   ├── engine/                         # 工作流引擎
│   ├── engine/nodes/                   # 节点实现
│   └── *.json                          # 工作流配置
├── docs/                               # 📖 项目文档
│   ├── architecture-summary.md         # 架构设计总结
│   ├── operations-framework-architecture.md
│   ├── workflow-framework-architecture.md
│   ├── task-orchestration-architecture.md
│   └── implementation-roadmap.md
├── batch-download-workflow/            # 批量下载工作流
├── examples/                           # 使用示例
└── tests/                              # 测试文件
```

## 🛠️ 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone https://github.com/yourusername/webauto.git
cd webauto

# 安装依赖
npm install
```

### 2. 使用事件驱动容器系统

```typescript
import {
  EventBus,
  WorkflowEngine,
  EventDrivenPageContainer
} from './sharedmodule/operations-framework/src/event-driven';

// 创建事件总线
const eventBus = new EventBus({
  enableHistory: true,
  maxHistorySize: 1000
});

// 创建工作流引擎
const workflowEngine = new WorkflowEngine(eventBus);

// 创建微博链接获取容器
const weiboContainer = new EventDrivenPageContainer({
  id: 'weibo_page',
  name: 'Weibo Link Extraction System',
  selector: '.feed-container',
  containerConfigs: {
    linkContainer: {
      id: 'weibo_links',
      name: 'Weibo Link Container',
      maxLinks: 200,
      linkPatterns: ['.*weibo\\.com.*'],
      enableAutoScroll: true
    },
    scrollContainer: {
      id: 'weibo_scroll',
      name: 'Weibo Scroll Container',
      scrollStrategy: 'smart',
      maxScrollAttempts: 50
    }
  }
});

// 配置工作流规则
workflowEngine.addRule({
  id: 'auto_start_scroll',
  name: '自动开始滚动',
  trigger: {
    event: 'container:initialized',
    conditions: [{
      type: 'container_id',
      operator: 'equals',
      value: 'weibo_page'
    }]
  },
  actions: [{
    type: 'start',
    target: 'weibo_scroll',
    delay: 2000
  }]
});
```

### 3. 使用微博批量下载

```bash
# 主页批量下载
node workflows/WorkflowRunner.js homepage

# 搜索结果批量下载
node workflows/WorkflowRunner.js search "关键词"

# 个人主页批量下载
node workflows/WorkflowRunner.js profile "用户ID"
```

### 4. 使用节点系统

```bash
# 运行测试工作流
node node-system/workflow-runner.js --workflow test-workflow.json

# 验证工作流配置
node node-system/workflow-runner.js --workflow weibo-workflow.json --validate
```

## 📊 性能特性

### 系统性能
- **高可用性** - 99.5%+ 可用性目标
- **高性能** - 优化的并发和缓存策略
- **可扩展性** - 支持水平和垂直扩展
- **可观测性** - 完整的监控和日志系统

### 事件驱动优势
- **松耦合** - 容器间通过事件通信，不直接依赖
- **可观测** - 完整的事件历史记录和调试支持
- **可扩展** - 易于添加新的容器类型和事件处理器
- **容错性** - 错误隔离，单个容器错误不影响整体

## 📚 文档资源

### 📖 核心文档
- **[架构设计总结](docs/architecture-summary.md)** - 整体架构设计文档
- **[事件驱动系统文档](sharedmodule/operations-framework/docs/EVENT_DRIVEN_SYSTEM_DOCUMENTATION.md)** - 完整系统架构文档
- **[事件驱动使用指南](sharedmodule/operations-framework/docs/EVENT_DRIVEN_USAGE_GUIDE.md)** - 实用使用指南

### 📁 模块文档
- **[节点系统](node-system/README.md)** - 基于节点的可视化工作流引擎
- **[工作流系统](workflows/README.md)** - 微博批量下载工作流系统

### 🚀 实现路线图
- **[实现路线图](docs/implementation-roadmap.md)** - 16周详细开发计划
- **[架构设计文档](docs/)** - 完整的模块架构设计

## 🎯 开发指南

### 代码规范
- **TypeScript优先** - 强类型支持，提高代码质量
- **事件驱动** - 优先使用事件机制而非直接方法调用
- **容器化** - 使用容器模式封装功能模块
- **配置驱动** - 通过JSON配置文件控制行为

### 测试要求
- **单元测试** - 每个模块必须有对应的单元测试
- **集成测试** - 测试模块间的协作和数据流
- **端到端测试** - 完整工作流程的测试验证

### 贡献指南
1. Fork 项目并创建功能分支
2. 遵循项目代码规范和架构原则
3. 编写测试用例确保功能正确
4. 提交 Pull Request 进行代码审查

## 🔄 版本历史

### v2.0.0 - 事件驱动架构重构 🆕
- ✅ 完全重新设计为事件驱动架构
- ✅ 实现事件总线和工作流引擎
- ✅ 重构所有容器为事件驱动模式
- ✅ 添加完整的事件类型系统
- ✅ 提供综合的文档和示例

### v1.0.0 - 初始版本
- ✅ 基础操作子框架
- ✅ 微博工作流系统
- ✅ 节点系统架构
- ✅ 批量下载功能

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 联系方式

- **项目维护者**: WebAuto Team
- **问题反馈**: [GitHub Issues](https://github.com/yourusername/webauto/issues)
- **功能请求**: [GitHub Discussions](https://github.com/yourusername/webauto/discussions)

---

## 🎉 总结

WebAuto 平台的事件驱动架构重构已经完成，提供了：

✅ **完整的事件驱动系统** - 事件总线、工作流引擎、容器系统
✅ **强大的微博自动化能力** - 链接获取、批量下载、数据处理
✅ **灵活的架构设计** - 三层解耦、模块化、可扩展
✅ **生产级特性** - 高可用、高性能、可观测
✅ **完善的文档体系** - 架构文档、使用指南、示例代码

这个项目为构建复杂Web自动化任务提供了一个强大、灵活且可维护的解决方案框架。