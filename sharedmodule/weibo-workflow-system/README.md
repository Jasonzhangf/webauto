# 微博容器操作系统 (Weibo Container OS)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.x-blue.svg)](https://www.typescriptlang.org/)

微博容器操作系统是一个基于容器架构的微博自动化操作系统，采用现代化的模块化设计，支持点号访问、状态管理、流程执行等高级功能。

## ✨ 特性

### 🏗️ 架构设计
- **容器系统**: 基于RCC BaseModule的容器架构
- **状态中心**: 统一的状态管理和监控
- **操作子系统**: 可复用的操作组件
- **执行流引擎**: 支持JSON配置的流程执行

### 🔧 核心功能
- **点号访问**: 支持 `page.xxx.xxx.xxx` 的链式访问
- **状态管理**: 实时状态同步和变化检测
- **流程执行**: 支持条件判断、循环、并行执行
- **健康监控**: 自动健康检查和故障恢复
- **调试支持**: 完整的日志和调试信息

### 🚀 高级特性
- **模块化组件**: 每个组件都可独立扩展和测试
- **异步操作**: 支持异步操作和并发处理
- **错误恢复**: 智能错误处理和重试机制
- **资源管理**: 自动资源清理和内存管理
- **配置灵活**: 支持JSON和程序化配置

## 📋 系统要求

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **操作系统**: macOS, Linux, Windows
- **TypeScript**: >= 4.0.0

## 🚀 快速开始

### 1. 安装依赖

```bash
cd weibo-mcp-system
npm install
```

### 2. 基本使用

```typescript
import { quickStart, logger } from './src/index';

async function main() {
  try {
    // 1. 启动系统
    const system = await quickStart({
      debug: true,
      enableMetrics: true,
      enableHealthMonitoring: true
    });
    
    logger.info('系统启动成功');
    
    // 2. 获取容器
    const profileContainer = system.getComponent('UserProfileContainer');
    
    // 3. 点号访问子容器
    const userProfile = profileContainer.userProfile;
    const postList = profileContainer.postList;
    const pagination = profileContainer.pagination;
    
    // 4. 执行操作
    const userInfo = await profileContainer.executeOperation('extractUserInfo');
    const posts = await profileContainer.executeOperation('extractPosts', { limit: 20 });
    
    logger.info('数据提取完成', { userInfo, postsCount: posts.length });
    
  } catch (error) {
    logger.error('系统运行失败', error);
  }
}

main();
```

### 3. 流程执行

```typescript
import { FlowExecutor } from './src/index';

// 创建流程配置
const flowConfig = {
  id: 'userProfileFlow',
  name: '用户主页信息提取流程',
  steps: [
    {
      type: 'operation',
      container: 'UserProfileContainer',
      operation: 'extractUserInfo',
      params: {}
    },
    {
      type: 'condition',
      condition: {
        type: 'container_state',
        containerId: 'UserProfileContainer',
        property: 'elementCount',
        operator: 'greater_than',
        value: 0
      },
      trueBranch: {
        steps: [
          {
            type: 'operation',
            container: 'UserProfileContainer',
            operation: 'extractPosts',
            params: { limit: 20 }
          }
        ]
      }
    }
  ]
};

// 执行流程
const flowExecutor = new FlowExecutor();
const result = await flowExecutor.executeFlow(flowConfig);
```

## 🏗️ 架构设计

### 核心组件

#### 1. SystemStateCenter (系统状态中心)
- 系统核心服务，管理所有实体的状态
- 提供状态注册、更新、查询、订阅功能
- 支持健康监控和变化检测

#### 2. BaseContainer (容器基类)
- 继承自RCC BaseModule
- 提供容器的基础功能：子容器管理、操作注册、状态管理
- 支持点号访问和操作调用

#### 3. UserProfileContainer (用户主页容器)
- 用户主页专用容器实现
- 包含用户信息、微博列表、分页等子容器
- 集成常用的微博操作

#### 4. BaseOperation (操作子基类)
- 操作的抽象基类
- 提供执行前后的生命周期管理
- 支持重试、超时、条件等待等功能

#### 5. FlowExecutor (执行流引擎)
- 支持JSON配置的流程执行
- 支持操作、条件、循环、并行等流程步骤
- 提供流程状态管理和监控

#### 6. WeiboSystemBootstrapper (系统启动器)
- 系统启动和关闭管理
- 核心组件注册和初始化
- 健康检查和监控服务

### 数据流

```
用户请求 → WeiboSystemBootstrapper → SystemStateCenter
                                              ↓
                                      FlowExecutor → BaseContainer
                                              ↓
                                      BaseOperation → 页面操作
                                              ↓
                                        状态更新和监控
```

## 📁 项目结构

```
weibo-mcp-system/
├── src/                      
│   ├── core/                  # 核心系统组件
│   │   ├── system-state-center.ts    # 系统状态中心
│   │   ├── weibo-system-bootstrapper.ts # 系统启动器
│   │   ├── interfaces.ts            # 核心接口定义
│   │   └── utils.ts                # 核心工具类
│   ├── containers/            # 容器系统
│   │   ├── base-container.ts        # 容器基类
│   │   └── user-profile-container.ts # 用户主页容器
│   ├── operations/            # 操作子系统
│   │   └── base-operation.ts       # 操作子基类
│   ├── flows/                 # 执行流系统
│   │   └── flow-executor.ts        # 流程执行器
│   ├── examples/              # 使用示例
│   │   ├── usage-examples.ts       # 完整使用示例
│   │   └── simple-example.ts       # 简单使用示例
│   ├── tests/                 # 测试套件
│   │   └── system-tests.ts         # 系统测试
│   ├── config/                # 配置管理
│   ├── types/                 # 类型定义
│   ├── utils/                 # 工具函数
│   ├── mcp/                   # MCP服务层
│   └── index.ts               # 主入口文件
├── config/                   # 配置文件
├── tests/                    # 测试文件
├── data/                     # 数据目录
├── temp/                     # 临时文件
├── dist/                     # 编译输出
├── package.json              # 项目配置
├── tsconfig.json            # TypeScript 配置
└── README.md               # 项目说明
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