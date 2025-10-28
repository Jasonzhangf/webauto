# 自刷新容器架构设计文档

## 🎯 架构概述

本文档描述了一个基于自刷新容器的动态操作架构，专门用于处理现代网页中的动态内容加载和交互场景。该架构通过多触发源刷新机制、动态操作注册、任务驱动的生命周期管理等特性，实现对复杂动态页面的自动化操作。

## 🏗️ 核心设计理念

### 1. **自刷新机制**
容器具备自我刷新能力，能够响应多种触发源自动更新内部状态和操作。

### 2. **动态操作注册**
容器能够自动发现并注册内部可操作元素，支持按类型和按实例两种注册方式。

### 3. **任务驱动生命周期**
容器的存在和销毁由任务完成度决定，而不是固定的时间或次数。

### 4. **嵌套容器支持**
支持父容器管理多个子容器，实现复杂的操作编排。

## 🔄 多触发源刷新机制

### 触发源类型及优先级

```
优先级从高到低：
1. 手动触发 (manual) - 最高优先级
2. 操作触发 (operation) - 操作完成后触发
3. 内容变化触发 (mutation) - DOM内容变化时触发
4. 定时触发 (timer) - 最低优先级
```

### 防抖机制

- 同一容器同一操作在短时间内多次触发会被过滤
- 防抖时间窗口可配置（默认500ms）
- 高优先级触发源可以打断低优先级触发源的执行

### 触发源实现

```typescript
interface RefreshTrigger {
  type: 'manual' | 'operation' | 'mutation' | 'timer' | 'initialization';
  timestamp: number;
  source?: string;
  data?: any;
  priority: number; // 1-4, 1为最高优先级
}
```

## 🎮 动态操作注册系统

### 操作注册粒度

#### 1. **按类型注册（默认）**
```typescript
{
  id: 'load_more_button',
  type: 'element-type',
  selector: '.load-more, .more-button',
  action: 'click',
  autoExecute: true,
  maxAttempts: 3
}
```

#### 2. **按实例注册**
```typescript
{
  id: 'specific_load_more',
  type: 'specific-element',
  selector: '#content > .load-more:first-child',
  action: 'click',
  autoExecute: false,
  maxAttempts: 1
}
```

### 操作生命周期

#### 单次操作
- 元素出现时执行一次
- 执行完成后立即销毁
- 适用于：点击按钮、展开回复等

#### 多次操作
- 可配置执行次数
- 达到次数限制后销毁
- 适用于：多次点击加载更多、分页操作等

#### 动态操作
- 每次刷新重新注册
- 执行后不销毁，等待下次刷新
- 适用于：持续监控和操作的场景

### 自动操作策略

```typescript
interface AutoOperationConfig {
  triggerCondition: 'element_appears' | 'content_changes' | 'timer';
  maxAttempts: number;
  timeout: number;
  retryInterval: number;
  successCondition: (result: OperationResult) => boolean;
  failureCondition: (result: OperationResult) => boolean;
}
```

## 🏛️ 容器编排系统

### 父子容器关系

```typescript
interface ContainerHierarchy {
  parent: BaseSelfRefreshingContainer;
  children: Map<string, BaseSelfRefreshingContainer>;
  sharedSpace: ContainerSharedSpace;
}
```

### 执行模式

#### 1. **同步阻塞执行**
```typescript
// 父容器等待子容器完成
const result = await childContainer.execute();
if (result.success) {
  // 继续下一个子容器
} else {
  // 处理失败
}
```

#### 2. **异步并发执行**
```typescript
// 多个子容器并行执行
const promises = children.map(child => child.execute());
const results = await Promise.allSettled(promises);
```

#### 3. **超时控制**
```typescript
// 设置执行超时
const timeout = 30000; // 30秒
const result = await Promise.race([
  childContainer.execute(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Operation timeout')), timeout)
  )
]);
```

## 🗃️ 共享空间机制

### 共享空间结构

```typescript
interface ContainerSharedSpace {
  // 文件操作
  fileHandler: {
    saveFile: (data: any, path: string) => Promise<void>;
    readFile: (path: string) => Promise<any>;
    deleteFile: (path: string) => Promise<void>;
  };

  // 数据存储
  dataStore: {
    setData: (key: string, value: any) => void;
    getData: (key: string) => any;
    hasData: (key: string) => boolean;
  };

  // 页面操作
  pageOperator: {
    click: (selector: string) => Promise<void>;
    type: (selector: string, text: string) => Promise<void>;
    scroll: (options: ScrollOptions) => Promise<void>;
    waitFor: (selector: string, timeout?: number) => Promise<void>;
  };

  // 配置参数
  config: {
    timeout: number;
    retryCount: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    outputDir: string;
  };
}
```

### 共享空间传递

```typescript
// 父容器初始化时创建共享空间
const sharedSpace = this.createSharedSpace();

// 初始化子容器时传递共享空间
const childContainer = new ChildContainer(config);
await childContainer.initialize(page, sharedSpace);
```

## 🔄 任务驱动的生命周期管理

### 任务状态管理

```typescript
enum ContainerState {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DESTROYED = 'destroyed'
}
```

### 任务完成条件

```typescript
interface TaskCompletionCriteria {
  type: 'count' | 'condition' | 'timeout';

  // 按数量完成
  targetCount?: number;
  currentCount?: number;

  // 按条件完成
  condition?: (result: any) => boolean;

  // 按超时完成
  timeout?: number;
  startTime?: number;
}
```

### 生命周期流程

```typescript
async function containerLifecycle() {
  // 1. 初始化阶段
  await this.initialize();

  // 2. 执行阶段
  while (!this.isTaskCompleted()) {
    // 执行操作
    const result = await this.executeOperations();

    // 检查任务完成条件
    if (this.checkTaskCompletion(result)) {
      break;
    }

    // 等待下一次刷新
    await this.waitForNextRefresh();
  }

  // 3. 清理阶段
  await this.cleanup();
}
```

## 🎯 具体实现示例

### 微博评论容器示例

```typescript
class WeiboCommentContainer extends BaseSelfRefreshingContainer {
  constructor(config: WeiboCommentConfig) {
    super({
      ...config,
      refreshInterval: 2000,
      enableAutoRefresh: true,
      enableMutationObserver: true,
      childContainerTypes: ['reply']
    });
  }

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    // 1. 检测容器状态
    const stateUpdate = await this.detectContainerState(this.page);

    // 2. 提取评论数据
    const commentsResult = await this.extractComments(this.page);

    // 3. 发现并注册子容器
    await this.discoverAndRegisterChildContainers(this.page);

    // 4. 注册动态操作
    await this.registerDynamicOperations(this.page);

    // 5. 检查任务完成条件
    if (this.extractedComments.size >= this.config.maxComments) {
      this.markTaskCompleted();
    }

    return OperationResult.success({
      commentCount: this.extractedComments.size,
      taskCompleted: this.isTaskCompleted()
    });
  }
}
```

## 🏆 架构优势

### 1. **高适应性**
- 动态响应页面变化
- 自动适应不同的页面结构
- 支持多种加载模式

### 2. **高可靠性**
- 多重错误处理机制
- 自动重试和恢复
- 资源自动清理

### 3. **高性能**
- 智能防抖机制
- 优先级调度
- 并发执行支持

### 4. **高可维护性**
- 模块化设计
- 清晰的接口定义
- 完善的日志记录

## 🚀 应用场景

### 1. **动态评论抓取**
- 自动加载更多评论
- 处理嵌套回复
- 按数量或条件终止

### 2. **无限滚动页面**
- 自动滚动加载
- 内容提取和处理
- 动态操作注册

### 3. **实时数据监控**
- 定时刷新数据
- 变化检测和响应
- 自动化操作

### 4. **复杂表单填写**
- 多步骤表单处理
- 动态字段处理
- 条件分支操作

## 📋 实现计划

### 阶段1：核心框架实现
- [ ] 实现BaseSelfRefreshingContainer基类
- [ ] 实现多触发源刷新机制
- [ ] 实现动态操作注册系统
- [ ] 实现共享空间机制

### 阶段2：具体容器实现
- [ ] 实现WeiboCommentContainer
- [ ] 实现其他类型的容器
- [ ] 测试和优化

### 阶段3：工作流集成
- [ ] 重新设计工作流架构
- [ ] 集成容器系统
- [ ] 完善错误处理和监控

## 📦 容器库分层与生命周期管理（新增）

为保证容器定义的质量与可演进性，引入双库管理策略：

- `containers/test`：测试库，承载新建与变更中的容器；自动生成和快速验证。
- `containers/validated`：验证库，承载通过审批与完整验证的容器；供生产工作流优先使用。

### 目录结构与索引
- 两个库分别维护各自的 `<site>/index.json`，并沿用 `interactive-elements/`、`containers/`、`indicators/` 的子目录结构。
- `index.json` 规则与现有平台索引一致，新增可选 `relationships` 图以表达父子关系。

### 新增与发布流程
1) 新建/更新 → 测试库：拾取器创建“可执行容器定义”，写入 `containers/test/<site>/…` 并更新测试索引。
2) 验证与审批：基于 Playwright 与运行时校验策略进行验证。
3) 发布 → 验证库：拷贝到 `containers/validated/<site>/…`，更新验证索引；必要时标记旧定义 `deprecated` 或 `replacedBy`。

### 兼容与迁移
- 兼容 legacy 路径 `container-system/platforms/<site>/`：Loader 优先按 `validated → test → legacy` 解析。
- 迁移既有库：将 `container-system/platforms/<site>/` 复制到 `containers/test/<site>/`，修复/生成测试索引，验证后逐步提升至验证库。

## 📝 总结

本架构设计提供了一个完整的解决方案，用于处理现代网页中的动态内容加载和交互。通过自刷新容器、动态操作注册、任务驱动生命周期等核心特性，能够有效应对各种复杂的自动化操作场景。

架构的关键优势在于其高度的适应性、可靠性和可维护性，能够满足从简单的数据提取到复杂的业务流程自动化等各种需求。
