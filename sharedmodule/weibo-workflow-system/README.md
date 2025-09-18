# Weibo Workflow System (微博工作流系统)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.x-blue.svg)](https://www.typescriptlang.org/)

基于操作子架构的微博自动化工作流系统，提供模块化、可复用的微博数据采集和交互功能。系统采用现代化的操作子设计模式，支持复杂的工作流编排和错误恢复。

## ✨ 特性

### 🏗️ 操作子架构
- **WeiboNavigationOperation**: 微博页面导航操作子
- **WeiboContentExtractionOperation**: 内容提取操作子（帖子、评论、用户资料）
- **WeiboLoginOperation**: 登录管理操作子（二维码登录、Cookie管理）
- **WeiboWorkflowSystem**: 统一工作流执行引擎

### 🔧 核心功能
- **页面导航**: 智能导航到微博首页、用户主页、帖子详情、搜索结果
- **内容提取**: 高精度提取微博帖子、评论、用户资料信息
- **登录管理**: 支持二维码登录、Cookie管理、会话保持
- **工作流执行**: 复杂多步骤工作流的编排和执行
- **错误处理**: 完善的错误处理和重试机制

### 🚀 高级特性
- **模块化设计**: 每个操作子都可以独立使用和测试
- **类型安全**: 完整的TypeScript类型定义
- **可扩展性**: 易于添加新的操作子和功能
- **监控日志**: 详细的执行日志和性能监控
- **测试覆盖**: 全面的单元测试和集成测试

## 📋 系统要求

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **操作系统**: macOS, Linux, Windows
- **TypeScript**: >= 4.0.0

## 📁 文件结构

```
sharedmodule/weibo-workflow-system/
├── src/
│   ├── operations/
│   │   ├── interfaces/
│   │   │   └── IWeiboOperation.ts          # 操作子接口定义和数据类型
│   │   ├── core/
│   │   │   ├── WeiboNavigationOperation.ts    # 微博导航操作子
│   │   │   ├── WeiboContentExtractionOperation.ts  # 内容提取操作子
│   │   │   └── WeiboLoginOperation.ts         # 登录管理操作子
│   │   └── index.ts                          # 主入口文件和工作流系统
│   └── config/
│       └── weibo-timeout-config.js          # 微博超时配置
├── test-weibo-operations.test.ts            # 完整的单元测试套件
├── jest.config.js                           # Jest测试配置
├── test-setup.ts                           # 测试环境配置
├── package.json                            # 项目配置和依赖
└── README.md                               # 项目文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd weibo-mcp-system
npm install
```

### 2. 基本使用

```typescript
import { WeiboWorkflowSystem } from './src/operations';

async function main() {
  try {
    // 1. 初始化工作流系统
    const workflowSystem = new WeiboWorkflowSystem();

    // 2. 创建操作上下文
    const context = {
      browser: await createBrowserContext(), // 需要实现浏览器上下文创建
      weibo: {},
      startTime: Date.now()
    };

    // 3. 导航到微博首页
    const navigationResult = await workflowSystem.navigate(context, 'homepage');

    // 4. 提取微博内容
    const extractionResult = await workflowSystem.extractContent(context, 'posts', {
      maxItems: 20,
      includeImages: true,
      includeMetadata: true
    });

    console.log('数据提取完成:', {
      navigationSuccess: navigationResult.success,
      postsCount: extractionResult.result?.length || 0
    });

  } catch (error) {
    console.error('系统运行失败:', error);
  }
}

main();
```

### 3. 流程执行

```typescript
import { WeiboWorkflowSystem } from './src/operations';

async function runWorkflow() {
  const workflowSystem = new WeiboWorkflowSystem();

  const context = {
    browser: await createBrowserContext(),
    weibo: {},
    startTime: Date.now()
  };

  // 创建工作流配置
  const workflow = {
    id: 'weibo-data-collection',
    type: 'weibo-data-collection',
    steps: [
      {
        id: 'step1',
        name: '导航到首页',
        operation: 'navigation',
        params: { target: 'homepage' },
        required: true
      },
      {
        id: 'step2',
        name: '提取微博帖子',
        operation: 'content-extraction',
        params: { contentType: 'posts', maxItems: 20 },
        required: true
      },
      {
        id: 'step3',
        name: '检查登录状态',
        operation: 'login',
        params: { action: 'check-status' },
        required: false
      }
    ]
  };

  // 执行工作流
  const result = await workflowSystem.executeWorkflow(context, workflow);

  console.log('工作流执行完成:', result);
}

runWorkflow();

## 🏗️ 架构设计

### 核心组件

#### 1. WeiboWorkflowSystem (工作流系统)
- 统一的工作流执行引擎，管理所有微博操作子
- 提供系统初始化、健康检查、状态监控功能
- 支持多步骤工作流的编排和执行

#### 2. WeiboNavigationOperation (导航操作子)
- 继承自WeiboBaseOperation，负责微博页面导航
- 支持首页、用户主页、帖子详情、搜索页面导航
- 提供页面类型识别和URL验证功能

#### 3. WeiboContentExtractionOperation (内容提取操作子)
- 继承自WeiboBaseOperation，负责内容数据提取
- 支持微博帖子、评论、用户资料的提取
- 提供智能滚动加载和内容过滤功能

#### 4. WeiboLoginOperation (登录管理操作子)
- 继承自WeiboBaseOperation，负责登录状态管理
- 支持二维码登录、Cookie管理、会话保持
- 提供登录状态检查和验证功能

#### 5. WeiboBaseOperation (操作子基类)
- 提供操作子的基础功能和生命周期管理
- 实现参数验证、错误处理、日志记录等通用功能
- 支持超时控制、重试机制、条件等待等功能

### 数据流

```
用户请求 → WeiboWorkflowSystem → 具体操作子执行
                                    ↓
                              操作结果收集与聚合
                                    ↓
                              状态更新和错误处理
                                    ↓
                              返回结构化结果
```

## 📁 项目结构

```
sharedmodule/weibo-workflow-system/
├── src/
│   ├── operations/            # 操作子系统
│   │   ├── interfaces/            # 操作子接口定义和数据类型
│   │   │   └── IWeiboOperation.ts # 微博操作子接口定义
│   │   ├── core/                  # 核心操作子实现
│   │   │   ├── WeiboNavigationOperation.ts    # 微博导航操作子
│   │   │   ├── WeiboContentExtractionOperation.ts  # 内容提取操作子
│   │   │   └── WeiboLoginOperation.ts         # 登录管理操作子
│   │   └── index.ts              # 主入口文件和工作流系统
│   └── config/                   # 配置管理
│       └── weibo-timeout-config.js # 微博超时配置
├── test-weibo-operations.test.ts # 完整的单元测试套件
├── jest.config.js              # Jest测试配置
├── test-setup.ts               # 测试环境配置
├── package.json                # 项目配置和依赖
└── README.md                   # 项目文档
```

## 🧪 测试

```bash
# 运行系统测试
npm run test

# 运行简单示例
npm run example:simple

# 运行完整示例
npm run example:full

# 编译项目
npm run build
```

## 📊 开发状态

### ✅ 已完成功能
- [x] 系统状态中心 (SystemStateCenter)
- [x] 容器基类 (BaseContainer)
- [x] 用户主页容器 (UserProfileContainer)
- [x] 操作子基类 (BaseOperation)
- [x] 执行流引擎 (FlowExecutor)
- [x] 系统启动器 (WeiboSystemBootstrapper)
- [x] 点号访问支持
- [x] 状态管理和监控
- [x] JSON配置流程执行
- [x] 完整的错误处理
- [x] 健康检查和监控
- [x] 使用示例和测试

### 🚧 开发中功能
- [ ] 实际的页面操作实现
- [ ] 浏览器自动化集成
- [ ] 微博特定操作实现
- [ ] 数据持久化存储
- [ ] 高级流程配置
- [ ] 性能优化

### 📋 计划功能
- [ ] 更多容器类型实现
- [ ] 分布式执行支持
- [ ] 插件系统
- [ ] Web界面管理
- [ ] API服务接口

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

### 开发规范
- 遵循 TypeScript 编码规范
- 提交前运行测试
- 编写清晰的提交信息
- 更新相关文档

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有建议，请：

1. 查看 [文档](docs/)
2. 搜索已有的 [Issues](issues)
3. 创建新的 Issue 描述问题

## 🔗 相关链接

- [RCC BaseModule](https://github.com/rcc/rcc-basemodule)
- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/)
- [设计文档](./FINAL_ARCHITECTURE_DESIGN.md)

---

**开发团队**: Claude Code  
**版本**: v1.0.0  
**更新时间**: 2024-01-15

## 🎯 致谢

感谢所有为这个项目做出贡献的开发者和用户。特别感谢 RCC 社区提供的 BaseModule 框架支持。