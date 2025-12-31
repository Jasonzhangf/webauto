# Operation 系统架构评审报告

## 一、当前实现概览

### 1.1 核心组件

当前系统包含以下几个关键部分:

#### 1. **容器引擎 (Container Engine v2)**
- **位置**: `libs/containers/src/engine/`
- **核心类**:
  - `OperationQueue`: 操作队列与调度器
  - `RuntimeController`: 运行时编排器
  - `TreeDiscoveryEngine`: 树形发现引擎
  - `types.ts`: 核心类型定义

#### 2. **Operations 模块**
- **位置**: `modules/operations/`
- **核心文件**:
  - `registry.ts`: 操作注册表
  - `operations/scroll.ts`: 滚动操作示例
  - `operations/highlight.ts`: 高亮操作

#### 3. **事件驱动框架 (Operations Framework)**
- **位置**: `libs/operations-framework/src/event-driven/`
- **核心类**:
  - `EventBus`: 事件总线
  - `WorkflowEngine`: 工作流引擎
  - `EventDrivenContainer`: 事件驱动容器基类
  - `EventDrivenContainerDiscovery`: 容器发现系统
  - `EventDrivenPaginationContainer`: 分页容器

#### 4. **状态总线**
- **位置**: `modules/core/src/state-bus.mjs`
- **功能**: 统一状态订阅与广播

---

## 二、当前架构分析

### 2.1 Operation 定义与绑定

#### ✅ **优势**

1. **多层次的操作定义**:
   ```typescript
   // Container Engine v2 - 简化的操作定义
   export interface OperationDef {
     type: 'find-child' | 'click' | 'scroll' | 'type' | 'waitFor' | 'custom';
     config?: Record<string, any>;
   }
   
   // Operations Module - 完整的操作定义
   export interface OperationDefinition<TConfig = any> {
     id: string;
     description?: string;
     requiredCapabilities?: string[];
     run: (ctx: OperationContext, config: TConfig) => Promise<any>;
   }
   ```

2. **容器级别的操作队列**:
   ```typescript
   export interface ContainerNodeRuntime {
     defId: string;
     opQueue: OperationInstance[];  // 每个容器有自己的操作队列
     runMode: RunMode;              // 支持顺序/并行执行
   }
   ```

3. **灵活的工作流覆盖**:
   ```typescript
   export interface BehaviorOverride {
     containerId: string;
     runMode?: RunMode;
     operations?: OperationDef[];  // 可以覆盖默认操作
     priority?: number;
   }
   ```

#### ❌ **存在的问题**

1. **操作定义割裂**:
   - Container Engine 使用简化的 `OperationDef`
   - Operations Module 使用完整的 `OperationDefinition`
   - 两者缺乏桥接和统一

2. **容器类型与操作绑定不清晰**:
   - 虽然 `ContainerDefV2` 有 `capabilities` 和 `operations` 字段
   - 但没有明确的"不同容器类型绑定不同操作集"的机制

3. **缺少操作能力校验**:
   ```typescript
   // 当前没有检查容器是否具备执行某操作的能力
   // Operations Module 有 requiredCapabilities，但未与容器 capabilities 对接
   ```

---

### 2.2 事件驱动与顺序执行

#### ✅ **优势**

1. **完善的事件系统**:
   ```typescript
   // EventBus 支持通配符、中间件、历史记录
   class EventBus {
     on(event: string, handler: EventHandler): void;
     once(event: string, handler: EventHandler): void;
     emit(event: string, data: EventData, source?: string): Promise<void>;
   }
   ```

2. **工作流规则引擎**:
   ```typescript
   export interface WorkflowRule {
     id: string;
     when: EventType | EventType[];           // 触发条件
     condition?: (data: any) => boolean;       // 额外条件
     then?: (data: any) => Promise<void>;      // 执行动作
     actions?: WorkflowAction[];               // 动作列表
   }
   ```

3. **容器级事件路由**:
   ```typescript
   // EventDrivenContainer 支持业务事件分发
   registerContainerHandler(eventKey: string, handler: ContainerEventHandler): void;
   dispatchContainerEvent(eventKey: string, payload: any): Promise<boolean>;
   ```

4. **顺序执行支持**:
   ```typescript
   // OperationQueue 支持按顺序标记和执行
   static nextRunnable(node: ContainerNodeRuntime): OperationInstance | undefined;
   static markRunning(op: OperationInstance);
   static markDone(op: OperationInstance, result?: any);
   ```

#### ❌ **存在的问题**

1. **事件触发与操作执行脱节**:
   - WorkflowEngine 可以通过事件触发任务
   - 但任务 (WorkflowTask) 和 OperationQueue 之间没有直接联系
   - 缺少"收到事件 → 触发容器操作队列执行"的完整链路

2. **容器级事件 vs 系统级事件混淆**:
   ```typescript
   // EventDrivenContainer 同时监听：
   // - 系统级事件 (container:created, container:state:changed)
   // - 业务级事件 (event.{containerId}.appear, operation.{containerId}.{opName})
   // 两者缺少明确的命名空间隔离
   ```

3. **订阅机制不统一**:
   - EventBus 有订阅
   - StateBus 有订阅
   - EventDrivenContainer 也有 on/once/off
   - 缺少统一的订阅管理

---

### 2.3 容器状态订阅

#### ✅ **优势**

1. **StateBus 提供全局状态管理**:
   ```typescript
   class StateBus {
     subscribe(module, event, callback);  // 订阅事件
     publish(event, data);                // 发布事件
     setState(module, state);             // 设置状态
     getState(module);                    // 获取状态
   }
   ```

2. **EventDrivenContainer 自动发布状态变化**:
   ```typescript
   private updateState(status: ContainerState['status']): void {
     this.emit('container:state:changed', {
       containerId: this.config.id,
       fromState: previousState,
       toState: status
     });
   }
   ```

3. **WorkflowEngine 支持规则订阅**:
   ```typescript
   addRule({
     when: 'container:state:changed',
     condition: (data) => data.toState === 'ready',
     then: async (data) => { /* 执行操作 */ }
   });
   ```

#### ❌ **存在的问题**

1. **状态发布到哪里不明确**:
   - EventDrivenContainer 的状态变化发布到内部 EventBus
   - 但没有自动桥接到全局 StateBus
   - 导致外部订阅者无法监听容器状态

2. **状态粒度不一致**:
   - Container 有详细的状态 (created/initializing/ready/running...)
   - 但 StateBus 的状态是自由格式的 key-value
   - 缺少统一的状态模型

---

## 三、改进建议

### 3.1 统一操作系统

#### 建议 1: 桥接 OperationDef 和 OperationDefinition

```typescript
// libs/containers/src/engine/OperationBridge.ts
import { getOperation } from '@webauto/operations/registry';
import { OperationDef, OperationInstance } from './types.js';

export class OperationBridge {
  /**
   * 将 OperationDef 转换为可执行的操作实例
   */
  static async execute(
    opInstance: OperationInstance,
    ctx: OperationContext
  ): Promise<any> {
    const { def } = opInstance;
    
    // 从注册表获取操作定义
    const opDefinition = getOperation(def.type);
    if (!opDefinition) {
      throw new Error(`Operation not found: ${def.type}`);
    }
    
    // 执行操作
    return await opDefinition.run(ctx, def.config || {});
  }
}
```

#### 建议 2: 容器类型与操作集绑定

```typescript
// libs/containers/src/engine/OperationRegistry.ts
export interface ContainerTypeOperations {
  containerType: string;
  allowedOperations: string[];  // 允许的操作 ID 列表
  defaultOperations: OperationDef[];  // 默认操作队列
}

export class ContainerOperationRegistry {
  private typeOperations = new Map<string, ContainerTypeOperations>();
  
  /**
   * 注册容器类型的操作集
   */
  registerTypeOperations(config: ContainerTypeOperations): void {
    this.typeOperations.set(config.containerType, config);
  }
  
  /**
   * 验证容器是否可以执行某操作
   */
  canExecute(containerType: string, operationId: string): boolean {
    const ops = this.typeOperations.get(containerType);
    return ops?.allowedOperations.includes(operationId) ?? false;
  }
  
  /**
   * 获取容器的默认操作队列
   */
  getDefaultQueue(containerType: string): OperationDef[] {
    return this.typeOperations.get(containerType)?.defaultOperations ?? [];
  }
}

// 使用示例
const registry = new ContainerOperationRegistry();

registry.registerTypeOperations({
  containerType: 'pagination',
  allowedOperations: ['scroll', 'click', 'waitFor'],
  defaultOperations: [
    { type: 'find-child' },
    { type: 'scroll', config: { direction: 'down' } }
  ]
});
```

---

### 3.2 统一事件驱动架构

#### 建议 3: 全局事件总线 + 命名空间

```typescript
// modules/core/src/unified-event-bus.mts
export class UnifiedEventBus {
  private eventBus = new EventBus();
  private stateBus = getStateBus();
  
  /**
   * 订阅系统级事件 (system:xxx)
   */
  onSystem(event: string, handler: EventHandler): void {
    this.eventBus.on(`system:${event}`, handler);
  }
  
  /**
   * 订阅容器级事件 (container:{id}:xxx)
   */
  onContainer(containerId: string, event: string, handler: EventHandler): void {
    this.eventBus.on(`container:${containerId}:${event}`, handler);
  }
  
  /**
   * 订阅业务事件 (event.{target}.xxx 或 operation.{target}.xxx)
   */
  onBusiness(eventKey: string, handler: EventHandler): void {
    this.eventBus.on(eventKey, handler);
  }
  
  /**
   * 发布事件并同步到 StateBus
   */
  async emit(event: string, data: any, source?: string): Promise<void> {
    // 发布到事件总线
    await this.eventBus.emit(event, data, source);
    
    // 如果是状态变化事件，同步到 StateBus
    if (event.includes(':state:changed')) {
      const [namespace, id, _, type] = event.split(':');
      this.stateBus.setState(`${namespace}:${id}`, data);
    }
  }
}

// 全局单例
export const unifiedEventBus = new UnifiedEventBus();
```

#### 建议 4: 事件触发操作队列执行

```typescript
// libs/containers/src/engine/EventDrivenOperationController.ts
export class EventDrivenOperationController {
  constructor(
    private runtimeController: RuntimeController,
    private eventBus: UnifiedEventBus
  ) {
    this.setupEventHandlers();
  }
  
  private setupEventHandlers(): void {
    // 监听容器出现事件，触发操作队列
    this.eventBus.onBusiness('event.*.appear', async (data) => {
      const { containerId } = data;
      const node = this.runtimeController.currentGraph().nodes.get(containerId);
      
      if (node && node.opQueue.length > 0) {
        await this.executeOperationQueue(node);
      }
    });
    
    // 监听操作请求事件
    this.eventBus.onBusiness('operation.*.execute', async (data) => {
      const { containerId, operationType, config } = data;
      await this.executeOperation(containerId, operationType, config);
    });
  }
  
  private async executeOperationQueue(node: ContainerNodeRuntime): Promise<void> {
    while (true) {
      const op = OperationQueue.nextRunnable(node);
      if (!op) break;
      
      OperationQueue.markRunning(op);
      
      try {
        const result = await OperationBridge.execute(op, this.createContext(node));
        OperationQueue.markDone(op, result);
        
        // 发布操作完成事件
        await this.eventBus.emit(`container:${node.defId}:operation:completed`, {
          operationType: op.def.type,
          result
        });
      } catch (error) {
        OperationQueue.markFailed(op, error.message);
        
        // 发布操作失败事件
        await this.eventBus.emit(`container:${node.defId}:operation:failed`, {
          operationType: op.def.type,
          error: error.message
        });
        
        break;  // 失败后停止队列执行
      }
    }
  }
}
```

---

### 3.3 统一状态订阅

#### 建议 5: 容器状态自动发布

```typescript
// libs/operations-framework/src/event-driven/EventDrivenContainer.ts
export abstract class EventDrivenContainer {
  constructor(config: ContainerConfig) {
    // ...existing code...
    
    // 自动桥接内部事件到全局总线
    this.setupGlobalEventBridge();
  }
  
  private setupGlobalEventBridge(): void {
    // 监听内部状态变化，发布到全局总线
    this.eventBus.on('container:state:changed', async (data) => {
      await unifiedEventBus.emit(`container:${this.config.id}:state:changed`, data);
    });
    
    // 监听所有容器事件，自动发布到全局
    this.eventBus.on('*', async (event, data) => {
      if (event.startsWith('container:')) {
        await unifiedEventBus.emit(`${event}`, {
          ...data,
          containerId: this.config.id
        });
      }
    });
  }
}
```

#### 建议 6: 统一的状态查询接口

```typescript
// modules/core/src/state-manager.mts
export class StateManager {
  private stateBus = getStateBus();
  private eventBus = unifiedEventBus;
  
  /**
   * 订阅容器状态变化
   */
  onContainerState(containerId: string, callback: (state: ContainerState) => void): void {
    this.eventBus.onContainer(containerId, 'state:changed', (data) => {
      callback(data.toState);
    });
  }
  
  /**
   * 获取容器当前状态
   */
  getContainerState(containerId: string): ContainerState | undefined {
    return this.stateBus.getState(`container:${containerId}`);
  }
  
  /**
   * 订阅所有容器的某种状态变化
   */
  onAnyContainerState(targetState: string, callback: (data: any) => void): void {
    this.eventBus.onSystem('container:*:state:changed', (data) => {
      if (data.toState === targetState) {
        callback(data);
      }
    });
  }
}

// 全局单例
export const stateManager = new StateManager();
```

---

## 四、实施优先级

### P0 (立即实施)

1. **创建 OperationBridge**，桥接两套操作定义系统
2. **创建 UnifiedEventBus**，统一事件命名空间
3. **实现容器状态自动发布到全局总线**

### P1 (短期实施)

4. **实现 EventDrivenOperationController**，支持事件触发操作队列
5. **创建 ContainerOperationRegistry**，管理容器类型与操作绑定
6. **实现 StateManager**，统一状态查询接口

### P2 (中期优化)

7. **整合 WorkflowEngine 与 OperationQueue**
8. **完善操作能力校验机制**
9. **优化事件历史记录和调试工具**

---

## 五、总体评价

### ✅ **架构亮点**

1. **分层设计清晰**: Container Engine、Operations Module、Event Framework 职责明确
2. **事件驱动完善**: EventBus、WorkflowEngine 功能丰富
3. **灵活性高**: 支持多种操作模式、运行模式、分页模式

### ❌ **主要问题**

1. **系统割裂**: 操作定义、事件系统、状态管理各自为政
2. **桥接缺失**: 容器类型、操作、事件、状态之间缺少桥接
3. **文档不足**: 缺少整体架构图和使用示例

### 📊 **改进后的效果**

实施上述建议后，系统将具备:

- ✅ **统一的操作执行流程**: OperationDef → OperationDefinition → Execute
- ✅ **完整的事件驱动链路**: Event → Container → OperationQueue → Execute
- ✅ **清晰的状态订阅机制**: Container State → UnifiedEventBus → StateBus
- ✅ **灵活的容器类型绑定**: ContainerType → AllowedOperations → Validation

---

## 六、参考架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│  (Workflow定义、容器发现请求、操作触发)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Unified Event Bus                           │
│  ┌──────────┬──────────────┬──────────────┐                │
│  │ System:  │ Container:   │ Business:    │                │
│  │ xxx      │ {id}:xxx     │ event.xxx    │                │
│  │          │              │ operation.xxx│                │
│  └──────────┴──────────────┴──────────────┘                │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌───▼────────┐ ┌─▼──────────────┐
│ WorkflowEngine│ │RuntimeCtrl │ │StateManager   │
│              │ │            │ │               │
│ Rules        │ │OpQueue     │ │Subscribe/Query│
│ Tasks        │ │Discovery   │ │               │
└───────┬──────┘ └───┬────────┘ └───────────────┘
        │            │
        └─────┬──────┘
              │
   ┌──────────▼───────────┐
   │ EventDrivenContainer │
   │                      │
   │ - Operations Queue   │
   │ - Event Handlers     │
   │ - State Management   │
   │ - Child Containers   │
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ Operation Bridge     │
   │                      │
   │ OperationDef →       │
   │ OperationDefinition  │
   └──────────┬───────────┘
              │
   ┌──────────▼────────────┐
   │ Operations Registry   │
   │                       │
   │ - scroll              │
   │ - click               │
   │ - highlight           │
   │ - waitFor             │
   │ - custom...           │
   └───────────────────────┘
```

---

**总结**: 当前的 operation 系统基础扎实，但需要通过**统一桥接、命名空间隔离、自动状态发布**等手段，将各个子系统串联成一个完整的事件驱动操作执行流水线。
