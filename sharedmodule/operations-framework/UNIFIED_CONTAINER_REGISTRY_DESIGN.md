# 统一容器注册系统设计文档

## 1. 现有系统分析

### 1.1 容器类型注册系统 (src/containers/index.ts)
- **功能**: 注册和管理容器类型（类）
- **特点**: 
  - 注册容器类构造函数
  - 提供容器实例创建功能
  - 管理内置微博容器类型
  - 提供容器信息查询

### 1.2 文件库容器注册系统 (src/containers/ContainerRegistry.ts)
- **功能**: 基于文件库的容器信息管理
- **特点**:
  - 管理容器元数据信息
  - 支持文件系统持久化
  - 提供容器发现和缓存机制
  - 支持网站级别的容器组织

### 1.3 事件驱动容器基类 (src/event-driven/EventDrivenContainer.ts)
- **功能**: 提供事件驱动的容器基类实现
- **特点**:
  - 基于事件的容器生命周期管理
  - 支持子容器嵌套管理
  - 提供状态管理和错误处理

## 2. 统一系统设计

### 2.1 设计目标
1. 统一容器类型注册和容器实例管理
2. 整合文件库功能和动态注册功能
3. 支持事件驱动的容器生命周期
4. 提供完整的容器发现和管理功能
5. 保持向后兼容性

### 2.2 核心架构

```
UnifiedContainerRegistry (统一容器注册中心)
├── ContainerTypeManager (容器类型管理器)
│   ├── 注册容器类构造函数
│   ├── 创建容器实例
│   └── 管理内置容器类型
├── ContainerInstanceManager (容器实例管理器)
│   ├── 管理容器实例生命周期
│   ├── 容器状态跟踪
│   └── 容器关系管理
├── ContainerLibraryManager (容器库管理器)
│   ├── 文件库加载和保存
│   ├── 容器元数据管理
│   ├── 缓存机制
│   └── 容器发现功能
├── EventDrivenContainerSupport (事件驱动支持)
│   ├── 事件总线集成
│   ├── 生命周期事件发布
│   └── 容器间通信支持
└── ContainerDiscoveryEngine (容器发现引擎)
    ├── 自动容器发现
    ├── 容器关系分析
    └── 性能统计
```

### 2.3 接口设计

#### 2.3.1 容器类型管理接口
```typescript
interface ContainerTypeManager {
  registerContainerType(type: string, containerClass: any): void;
  getContainerType(type: string): any;
  hasContainerType(type: string): boolean;
  getAllContainerTypes(): string[];
  createContainer(type: string, config: any): any;
}
```

#### 2.3.2 容器实例管理接口
```typescript
interface ContainerInstanceManager {
  registerContainerInstance(id: string, container: any): void;
  getContainerInstance(id: string): any;
  hasContainerInstance(id: string): boolean;
  getAllContainerInstances(): Map<string, any>;
  removeContainerInstance(id: string): void;
  getContainerInstancesByType(type: string): any[];
}
```

#### 2.3.3 容器库管理接口
```typescript
interface ContainerLibraryManager {
  loadContainerLibrary(path: string): Promise<void>;
  saveContainer(containerInfo: ContainerInfo): Promise<void>;
  findContainer(website: string, containerId: string): Promise<ContainerInfo | null>;
  findBySelector(website: string, selector: string): Promise<ContainerInfo | null>;
  getWebsiteContainers(website: string): Promise<Map<string, ContainerInfo>>;
  updateContainerUsage(website: string, containerId: string, usageStats: Partial<ContainerUsageStats>): Promise<void>;
}
```

#### 2.3.4 事件驱动支持接口
```typescript
interface EventDrivenContainerSupport {
  emit(event: string, data: any): Promise<void>;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  setupEventHandlers(): void;
}
```

### 2.4 统一容器注册中心类

```typescript
class UnifiedContainerRegistry implements 
  ContainerTypeManager, 
  ContainerInstanceManager, 
  ContainerLibraryManager, 
  EventDrivenContainerSupport {
  
  // 私有管理器
  private typeManager: ContainerTypeManagerImpl;
  private instanceManager: ContainerInstanceManagerImpl;
  private libraryManager: ContainerLibraryManagerImpl;
  private eventBus: EventBus;
  
  // 构造函数
  constructor(options?: UnifiedContainerRegistryOptions);
  
  // 容器类型管理方法
  registerContainerType(type: string, containerClass: any): void;
  getContainerType(type: string): any;
  hasContainerType(type: string): boolean;
  getAllContainerTypes(): string[];
  createContainer(type: string, config: any): any;
  
  // 容器实例管理方法
  registerContainerInstance(id: string, container: any): void;
  getContainerInstance(id: string): any;
  hasContainerInstance(id: string): boolean;
  getAllContainerInstances(): Map<string, any>;
  removeContainerInstance(id: string): void;
  getContainerInstancesByType(type: string): any[];
  
  // 容器库管理方法
  async loadContainerLibrary(path: string): Promise<void>;
  async saveContainer(containerInfo: ContainerInfo): Promise<void>;
  async findContainer(website: string, containerId: string): Promise<ContainerInfo | null>;
  async findBySelector(website: string, selector: string): Promise<ContainerInfo | null>;
  async getWebsiteContainers(website: string): Promise<Map<string, ContainerInfo>>;
  async updateContainerUsage(website: string, containerId: string, usageStats: Partial<ContainerUsageStats>): Promise<void>;
  
  // 事件驱动支持方法
  async emit(event: string, data: any): Promise<void>;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  setupEventHandlers(): void;
}
```

### 2.5 向后兼容性

为保持向后兼容性，系统将提供以下兼容层：

1. **容器类型注册器兼容层**: 保持现有的 `containerRegistry` 接口
2. **文件库注册器兼容层**: 保持现有的文件库管理接口
3. **事件驱动容器兼容层**: 保持现有的事件驱动容器基类

## 3. 实现计划

### 3.1 第一阶段：核心架构实现
- 实现 UnifiedContainerRegistry 核心类
- 实现容器类型管理功能
- 实现容器实例管理功能

### 3.2 第二阶段：文件库集成
- 集成现有的文件库管理功能
- 实现容器元数据持久化
- 实现缓存机制

### 3.3 第三阶段：事件驱动支持
- 集成事件总线系统
- 实现生命周期事件管理
- 实现容器间通信支持

### 3.4 第四阶段：容器发现引擎
- 实现自动容器发现功能
- 实现容器关系分析
- 实现性能统计功能

### 3.5 第五阶段：兼容层实现
- 实现向后兼容接口
- 迁移现有代码到新系统
- 测试兼容性

## 4. 测试计划

### 4.1 单元测试
- 容器类型注册和创建测试
- 容器实例管理测试
- 文件库管理测试
- 事件驱动功能测试

### 4.2 集成测试
- 容器生命周期集成测试
- 文件库集成测试
- 事件驱动集成测试

### 4.3 性能测试
- 容器创建和销毁性能测试
- 文件库加载和保存性能测试
- 事件处理性能测试