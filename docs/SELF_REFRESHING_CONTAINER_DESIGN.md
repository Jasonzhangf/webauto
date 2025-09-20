# 自刷新容器架构设计文档

## 🎯 设计概述

本文档基于我们的讨论，设计了一个自刷新容器架构，专门用于处理现代网页中的动态内容加载和交互场景，特别是微博评论的动态加载问题。

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
5. 初始化触发 (initialization) - 容器初始化时触发
```

### 防抖机制

- 同一容器同一操作在短时间内多次触发会被过滤
- 防抖时间窗口可配置（默认500ms）
- 高优先级触发源可以打断低优先级触发源的执行

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

## 🎯 微博评论容器具体设计

### WeiboCommentContainer

#### 核心功能
1. **动态评论检测** - 使用MutationObserver监听评论区域变化
2. **自动滚动加载** - 自动滚动页面加载更多评论
3. **加载更多操作** - 自动检测并点击"加载更多"按钮
4. **嵌套回复容器** - 为每个有回复的评论创建回复容器
5. **任务完成判断** - 基于评论数量或条件判断任务完成

#### 刷新触发源
- **初始化触发** - 容器创建时开始评论发现
- **内容变化触发** - 新评论加载时重新检测
- **定时触发** - 定期检查评论状态
- **操作触发** - 执行加载操作后重新检测

#### 动态操作注册
- **load_more操作** - 注册所有"加载更多"按钮
- **expand_replies操作** - 注册展开回复按钮
- **scroll_to_load操作** - 注册滚动加载操作

### WeiboReplyContainer

#### 核心功能
1. **回复内容提取** - 提取单个评论下的所有回复
2. **自动展开回复** - 自动点击"展开回复"按钮
3. **嵌套回复处理** - 处理多层嵌套回复结构
4. **回复关系维护** - 维护回复之间的父子关系

#### 动态操作注册
- **expand_replies操作** - 注册展开更多回复按钮
- **scroll_to_replies操作** - 注册滚动到回复区域操作

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

## 📋 实现计划

### 阶段1：核心框架实现
- [ ] 实现BaseSelfRefreshingContainer基类
- [ ] 实现多触发源刷新机制
- [ ] 实现动态操作注册系统
- [ ] 实现共享空间机制

### 阶段2：具体容器实现
- [ ] 实现WeiboCommentContainer
- [ ] 实现WeiboReplyContainer
- [ ] 测试和优化

### 阶段3：工作流集成
- [ ] 重新设计工作流架构
- [ ] 集成容器系统
- [ ] 完善错误处理和监控

## 📝 关键讨论要点总结

### 用户核心需求
1. **动态加载处理** - 评论可能是动态加载的，需要动态提取并继续动态加载
2. **容器化操作** - 页面有容器操作者，不断刷新内部，发现新的容器和操作方法
3. **自动操作注册** - 页面刷新后，发现新内容需要自动执行操作
4. **嵌套操作支持** - 支持评论→回复的嵌套容器结构
5. **触发源优先级** - 手动>操作>内容变化>定时的优先级顺序

### 技术挑战解决方案
1. **动态内容检测** - 使用MutationObserver监听DOM变化
2. **操作自动发现** - 每次刷新时重新扫描可操作元素
3. **任务完成判断** - 基于数量、条件或超时的多种完成标准
4. **资源管理** - 通过共享空间统一管理文件、数据和配置
5. **错误恢复** - 多重重试机制和优雅降级

### 架构创新点
1. **自刷新机制** - 容器主动刷新而非被动响应
2. **多触发源** - 支持多种触发源并按优先级处理
3. **嵌套容器** - 父子容器间的协作和数据传递
4. **动态操作** - 操作可以动态注册、执行和销毁
5. **任务驱动** - 容器生命周期由任务完成度决定

## 🎯 下一步行动

1. **实现BaseSelfRefreshingContainer基类** - 包含多触发源刷新机制、动态操作注册、共享空间管理
2. **实现WeiboCommentContainer** - 专门处理微博评论的动态加载
3. **实现WeiboReplyContainer** - 处理评论下的回复内容
4. **集成到现有工作流** - 将容器系统与现有的节点工作流结合

这个架构设计解决了动态内容加载的核心问题，为处理现代复杂的动态网页提供了一个完整的解决方案。