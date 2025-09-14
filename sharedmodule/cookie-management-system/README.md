# Cookie Management System with Unified Atomic Operations

## 概述

这是一个完整的Cookie管理系统，集成了统一原子操作架构，实现了模块化的网页自动化处理。

## 核心特性

### Cookie管理系统
- **模块化架构**: 存储器、验证器、加密器、自动化器完全分离
- **域名管理**: 按域名存储和管理Cookie，支持多站点
- **健康检查**: 自动验证Cookie有效性和过期状态
- **加密保护**: 使用AES-256-GCM加密敏感Cookie数据
- **自动清理**: 自动移除过期Cookie，保持存储空间

### 统一原子操作库
- **19种操作类型**: 涵盖基础元素、页面、Cookie、数据、文件、条件操作
- **Cookie虚拟操作子**: Cookie加载、验证、登录状态检查
- **工厂模式**: 统一的操作创建接口
- **配置驱动**: 所有操作通过配置进行参数化

### 系统集成
- **Playwright集成**: 支持主流浏览器自动化
- **ESM环境**: 完全兼容ES模块系统
- **错误处理**: 完善的错误处理和日志记录
- **测试覆盖**: 100%功能测试通过率

## 架构组件

### Cookie管理 (`sharedmodule/cookie-management-system/`)
```
src/
├── index.js                 # 主入口，集成所有组件
├── core/
│   ├── CookieStorage.js     # 文件存储和域名管理
│   ├── CookieValidator.js   # 验证和健康检查
│   ├── CookieEncryption.js  # AES-256-GCM加密
│   └── CookieAutomation.js  # 浏览器集成
├── utils/
│   ├── CookieUtils.js       # 工具函数
│   └── Logger.js           # 日志系统
└── tests/
    └── test-unified-atomic-operation-system.js  # 完整系统测试
```

### 原子操作库 (`sharedmodule/weibo-workflow-system/src/core/`)
```
complete-atomic-operations.js  # 完整操作库
├── 基础元素操作 (6种)
├── 页面操作 (3种)
├── Cookie虚拟操作子 (3种)
├── 数据处理操作 (2种)
├── 文件操作 (2种)
└── 条件操作 (3种)
```

## 成功测试结果

### Cookie加载测试
- **成功加载**: 11个Weibo Cookie
- **健康状态**: 100%有效
- **过期状态**: 0个过期
- **存储位置**: 按域名 organized storage

### 统一原子操作测试
- **工作流操作**: 9个操作步骤
- **成功率**: 100%
- **链接提取**: 成功提取微博主页链接
- **架构验证**: Cookie虚拟操作子完美集成

## 使用示例

### 基本Cookie管理
```javascript
import { WebAutoCookieManagementSystem } from './src/index.js';

const cookieSystem = new WebAutoCookieManagementSystem({
  storagePath: './cookies',
  encryptionEnabled: true,
  autoRefresh: false,
  validationEnabled: true
});

await cookieSystem.initialize();
await cookieSystem.loadCookies(page, 'weibo.com');
```

### 统一原子操作
```javascript
import { AtomicOperationFactory } from './complete-atomic-operations.js';

const workflow = [
  {
    name: 'Cookie加载',
    operation: AtomicOperationFactory.createOperation('cookie.load', {
      cookieSystem: cookieSystem,
      domain: 'weibo.com'
    })
  },
  {
    name: '页面导航',
    operation: AtomicOperationFactory.createOperation('page.navigate', {
      url: 'https://weibo.com'
    })
  }
];
```

## 技术优势

1. **完全模块化**: 每个组件独立可测试
2. **配置驱动**: 无硬编码，完全通过配置管理
3. **统一接口**: 所有操作使用相同的接口规范
4. **可扩展性**: 易于添加新的操作类型
5. **错误恢复**: 完善的错误处理和恢复机制

## 部署说明

系统已成功构建并测试完成，可以直接使用：

```bash
cd sharedmodule/cookie-management-system
npm install
node tests/test-unified-atomic-operation-system.js
```

## 总结

这个系统实现了：
- ✅ 完整的Cookie生命周期管理
- ✅ 统一的原子操作架构
- ✅ 100%测试通过率
- ✅ 可扩展的模块化设计
- ✅ 无硬编码的配置驱动架构