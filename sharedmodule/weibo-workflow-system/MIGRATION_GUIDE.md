# 嵌套操作框架迁移指南

## 概述

本指南详细说明了如何从原有的嵌套操作框架迁移到新的配置驱动架构。新架构实现了框架与具体实现的完全分离，支持配置驱动的操作管理。

## 主要改进

### 1. 架构分离
- **框架层**: 提供纯抽象接口和基础功能
- **实现层**: 具体业务逻辑实现
- **配置层**: 驱动系统行为的配置

### 2. 接口驱动
- 所有组件都基于明确的接口定义
- 支持运行时类型检查和验证
- 便于扩展和测试

### 3. 配置驱动
- 通过配置模板定义系统行为
- 支持配置合并和覆盖
- 便于不同场景的定制

## 文件结构变化

### 新结构
```
src/core/
├── nested-operations-framework.js    # 核心框架（纯抽象）
├── weibo-nested-operations.js         # Weibo具体实现
└── config/                            # 配置文件目录
    ├── weibo-config.json              # Weibo配置模板
    └── general-config.json            # 通用配置模板
```

### 旧结构（已废弃）
```
src/core/
├── nested-operations-framework.js    # 混合了框架和实现
└── weibo-nested-operations.js         # 具有框架依赖的实现
```

## 迁移步骤

### 步骤1: 理解新框架概念

#### 核心接口
- `IContainer`: 容器接口
- `IOperation`: 操作接口  
- `ITrigger`: 触发器接口
- `ICondition`: 条件接口

#### 抽象基类
- `AbstractContainer`: 容器基类
- `AbstractOperation`: 操作基类
- `AbstractTrigger`: 触发器基类

#### 管理器
- `ConfigurationManager`: 配置管理
- `OperationFactory`: 工厂类
- `NestedOperationManager`: 操作管理器

### 步骤2: 重构现有代码

#### 容器重构示例

**旧方式**：
```javascript
class MyContainer extends Container {
  constructor(config) {
    super(config);
    // 直接在构造函数中包含业务逻辑
  }
}
```

**新方式**：
```javascript
class MyContainer extends AbstractContainer {
  constructor(config) {
    super(config);
    // 只处理配置，业务逻辑在方法中实现
  }

  async initialize(context) {
    // 实现初始化逻辑
  }

  async checkState(context) {
    // 实现状态检查逻辑
  }

  async executeOperations(context, options) {
    // 实现操作执行逻辑
  }
}
```

#### 操作重构示例

**旧方式**：
```javascript
class MyOperation extends NestedOperation {
  async doExecute(context, options) {
    // 混合了配置和逻辑
  }
}
```

**新方式**：
```javascript
class MyOperation extends AbstractOperation {
  constructor(config) {
    super(config);
    // 配置驱动
    this.selectors = config.selectors || {};
    this.maxDepth = config.maxDepth || 3;
  }

  async canExecute(context) {
    // 实现执行条件检查
  }

  async doExecute(context, options) {
    // 实现具体操作逻辑
  }
}
```

### 步骤3: 使用配置驱动

#### 配置模板示例
```javascript
const MyConfigTemplates = {
  myContainer: {
    type: 'my-container',
    selector: '.my-container',
    behaviors: ['scroll', 'mutation'],
    triggers: ['scroll', 'count-change']
  },

  myOperation: {
    type: 'my-operation',
    name: 'my-operation',
    selectors: {
      item: '.my-item',
      action: '.my-action'
    },
    maxDepth: 3,
    retryPolicy: {
      maxRetries: 3,
      delay: 1000
    }
  }
};
```

#### 工厂类使用
```javascript
class MyOperationFactory {
  createCompleteSystem(config = {}) {
    const system = {
      container: null,
      operations: {},
      triggers: {}
    };

    // 使用配置模板创建实例
    const containerConfig = this.mergeConfig(
      MyConfigTemplates.myContainer,
      config.container || {}
    );
    system.container = new MyContainer(containerConfig);

    return system;
  }
}
```

### 步骤4: 迁移测试代码

#### 测试重构示例

**旧测试**：
```javascript
test('old operation test', async () => {
  const operation = new OldOperation(config);
  const result = await operation.execute(context);
  expect(result.success).toBe(true);
});
```

**新测试**：
```javascript
test('new operation test', async () => {
  const factory = new MyOperationFactory();
  const system = factory.createCompleteSystem(config);
  
  const manager = new NestedOperationManager();
  manager.registerContainer(system.container);
  manager.registerOperation(system.operations.main);
  
  await manager.start();
  const result = await manager.executeOperation('main');
  
  expect(result.success).toBe(true);
});
```

## 向后兼容方案

### 兼容层
为了保持向后兼容，提供了兼容层：

```javascript
// 兼容层 - 旧API到新API的映射
const CompatibilityLayer = {
  // 旧容器类名映射
  Container: AbstractContainer,
  Operation: AbstractOperation,
  Trigger: AbstractTrigger,
  
  // 旧工厂方法
  createSystem: function(config) {
    const factory = new WeiboOperationFactory();
    return factory.createCompleteSystem(config);
  }
};
```

### 渐进式迁移
1. **阶段1**: 引入新框架，保持旧API
2. **阶段2**: 新功能使用新框架，旧功能逐步迁移
3. **阶段3**: 完全迁移到新框架
4. **阶段4**: 移除旧API和兼容层

## 配置最佳实践

### 1. 配置结构
```javascript
{
  type: 'component-type',
  name: 'component-name',
  selectors: {
    main: '.main-selector',
    items: '.item-selector'
  },
  behaviors: ['scroll', 'click', 'mutation'],
  triggers: ['scroll', 'timeout', 'element-exists'],
  retryPolicy: {
    maxRetries: 3,
    delay: 1000
  }
}
```

### 2. 配置继承
```javascript
const baseConfig = {
  retryPolicy: {
    maxRetries: 3,
    delay: 1000
  }
};

const specificConfig = {
  ...baseConfig,
  selectors: {
    main: '.specific-selector'
  }
};
```

### 3. 环境配置
```javascript
const configs = {
  development: {
    debug: true,
    timeout: 5000
  },
  production: {
    debug: false,
    timeout: 30000
  }
};
```

## 常见问题

### Q: 如何处理现有代码中的硬编码选择器？
A: 将选择器移到配置中，通过配置模板管理：
```javascript
const selectors = {
  comment: '[data-commentid]',
  reply: '.reply-selector',
  loadMore: '.load-more-selector'
};
```

### Q: 如何处理复杂的业务逻辑？
A: 在具体实现类中实现，保持框架的纯粹性：
```javascript
class MyOperation extends AbstractOperation {
  async doExecute(context, options) {
    // 复杂业务逻辑在这里实现
  }
}
```

### Q: 如何添加新的触发条件？
A: 实现`ITrigger`接口：
```javascript
class MyTrigger extends AbstractTrigger {
  async evaluate(context) {
    // 实现触发条件评估
  }
}
```

## 性能优化建议

### 1. 延迟初始化
```javascript
class LazyContainer extends AbstractContainer {
  async initialize(context) {
    if (this.state.initialized) return;
    // 延迟初始化逻辑
  }
}
```

### 2. 资源复用
```javascript
class ResourceManager {
  constructor() {
    this.cache = new Map();
  }
  
  getResource(key) {
    if (!this.cache.has(key)) {
      this.cache.set(key, this.createResource(key));
    }
    return this.cache.get(key);
  }
}
```

### 3. 批量操作
```javascript
async executeBatch(operations) {
  const results = await Promise.allSettled(
    operations.map(op => op.execute(context))
  );
  return results;
}
```

## 测试策略

### 1. 单元测试
```javascript
describe('MyContainer', () => {
  it('should initialize correctly', async () => {
    const container = new MyContainer(config);
    await container.initialize(mockContext);
    expect(container.state.initialized).toBe(true);
  });
});
```

### 2. 集成测试
```javascript
describe('System Integration', () => {
  it('should handle complete workflow', async () => {
    const system = factory.createCompleteSystem();
    const manager = new NestedOperationManager();
    
    manager.registerContainer(system.container);
    await manager.start();
    
    const results = await manager.executeContainer('main');
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### 3. 配置测试
```javascript
describe('Configuration', () => {
  it('should merge configurations correctly', () => {
    const factory = new MyOperationFactory();
    const config = factory.createCompleteSystem(overrideConfig);
    
    expect(config.container.selectors.main).toBe('expected-selector');
  });
});
```

## 总结

新架构的核心优势：

1. **分离关注点**: 框架、实现、配置完全分离
2. **类型安全**: 基于接口的类型检查
3. **可扩展性**: 易于添加新的组件类型
4. **可测试性**: 纯接口便于mock和测试
5. **可配置性**: 配置驱动支持多场景

通过遵循本指南，您可以平滑地将现有代码迁移到新的架构，同时保持代码的可维护性和扩展性。