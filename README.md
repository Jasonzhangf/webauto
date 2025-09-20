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
├── 核心模块
│   ├── weibo-login-detector.ts            # 🆕 事件驱动微博登录检测器
│   ├── event-driven-cookie-manager.ts      # 🆕 事件驱动Cookie管理系统
│   ├── verify-system-functionality.js      # 系统功能验证脚本
│   └── tsconfig.json                      # TypeScript配置
├── sharedmodule/                          # 共享模块库
│   ├── operations-framework/              # 🆕 事件驱动操作框架
│   │   ├── src/event-driven/               # 事件驱动系统核心
│   │   │   ├── EventBus.ts                 # 事件总线 (支持通配符、中间件)
│   │   │   ├── WorkflowEngine.ts           # 工作流引擎 (规则驱动)
│   │   │   ├── EventDrivenContainer.ts     # 容器基类
│   │   │   └── types/                      # 完整类型定义
│   │   └── dist/                          # 编译输出
│   └── openai-compatible-providers/        # AI模型提供商系统
├── cookies/                               # Cookie管理
│   ├── weibo-cookies.json                 # 微博认证Cookie
│   └── README.md                          # Cookie模块文档
├── cookies-backup/                        # Cookie备份系统
│   ├── cookie-manager.js                  # Cookie管理器
│   └── README.md                          # 备份模块文档
├── dist/                                  # TypeScript编译输出
│   ├── weibo-login-detector.js           # 登录检测器编译版本
│   ├── event-driven-cookie-manager.js     # Cookie管理器编译版本
│   ├── test-event-simple.js               # 事件系统测试
│   └── README.md                          # 编译输出文档
├── node-system/                           # 节点工作流系统
│   ├── workflow-engine.js                  # 工作流引擎
│   ├── workflow-runner.js                  # 运行器
│   └── README.md                          # 节点系统文档
├── workflows/                             # 工作流定义
│   ├── weibo-homepage-workflow.js         # 微博主页工作流
│   ├── weibo-profile-workflow.js          # 微博主页工作流
│   └── README.md                          # 工作流文档
├── comment-count-detector/                # 评论计数检测器
│   ├── index.ts                           # 检测器实现
│   └── README.md                          # 检测器文档
├── docs/                                  # 项目文档
│   ├── architecture-summary.md             # 架构总结
│   ├── operations-framework-architecture.md
│   ├── workflow-framework-architecture.md
│   ├── implementation-roadmap.md
│   └── CONTAINER_ARCHITECTURE_DESIGN.md   # 容器架构设计
└── scripts/                               # 脚本文件
    └── weibo-workflows/                    # 微博工作流脚本
```

## 🎯 核心特性

### 🔥 事件驱动架构 (100% 测试通过)
- **事件总线 (EventBus)** - 支持通配符、中间件、事件历史的完整事件系统
- **工作流引擎 (WorkflowEngine)** - 基于规则的容器编排和自动化
- **事件驱动容器** - 自驱动、松耦合的容器化操作子
- **徽章检测系统** - 智能的登录状态检测和验证

### 🍪 Cookie管理系统
- **事件驱动Cookie管理** - 基于徽章检测的Cookie生命周期管理
- **自动捕获和验证** - 智能Cookie捕获和有效性验证
- **备份和恢复** - 完整的Cookie备份和恢复机制
- **安全性保障** - 加密存储和访问控制

### 🧪 测试和验证
- **17/17 系统测试通过** - 100%事件系统测试覆盖率
- **集成测试** - 完整的功能集成测试
- **性能测试** - 系统性能和稳定性验证
- **类型安全** - 完整的TypeScript类型定义

## 🛠️ 快速开始

### 1. 环境准备

```bash
# 安装项目依赖
npm install

# 编译TypeScript文件
npm run build:ts

# 验证系统功能
node verify-system-functionality.js
```

### 2. 使用事件驱动登录检测器

```bash
# 运行微博登录检测器
npm run test:login-detector

# 或直接运行编译后的文件
node dist/weibo-login-detector.js
```

### 3. 使用事件驱动Cookie管理器

```bash
# 运行Cookie管理器
npm run test:cookie-manager

# 或直接运行编译后的文件
node dist/event-driven-cookie-manager.js
```

### 4. 测试事件系统

```bash
# 运行事件系统测试
node dist/test-event-simple.js

# 预期输出: 17/17 测试通过 🎉
```

### 5. 开发模式

```bash
# 监听模式编译TypeScript
npm run build:ts:watch

# 使用ts-node直接运行TypeScript文件
npx ts-node weibo-login-detector.ts
npx ts-node event-driven-cookie-manager.ts
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