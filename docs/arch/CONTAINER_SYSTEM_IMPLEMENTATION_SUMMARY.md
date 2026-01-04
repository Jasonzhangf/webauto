# 容器消息驱动系统实现总结

## 已完成的工作

### 1. 消息常量扩展
**文件**：`libs/operations-framework/src/event-driven/MessageConstants.ts`

新增消息常量：
- `MSG_CONTAINER_ROOT_VAR_SET/GET/DELETE/CHANGED` - 根容器变量管理
- `MSG_CONTAINER_ROOT_DISCOVER_START/PROGRESS/COMPLETE` - 根容器发现流程
- `MSG_CONTAINER_CHILD_DISCOVERED/REGISTERED/REMOVED` - 子容器生命周期
- `MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE` - 批量操作完成
- `MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE` - 所有操作完成
- `MSG_CONTAINER_ROOT_SCROLL_COMPLETE` - 根容器滚动完成

### 2. 变量管理器
**文件**：`libs/operations-framework/src/event-driven/ContainerVariableManager.ts`

核心功能：
- 支持根容器和子容器的变量初始化和管理
- 通过消息驱动的变量修改（`MSG_CONTAINER_ROOT_VAR_SET`, `MSG_CONTAINER_VAR_SET`）
- 变量类型验证和只读保护
- 变量变更消息发布

关键接口：
```typescript
interface ContainerVariables {
  // 系统变量（只读）
  readonly $containerId: string;
  readonly $type: 'root' | 'item' | 'list' | 'form' | 'modal' | 'section';
  readonly $parent: string | null;
  readonly $domPath: string | null;
  readonly $createdAt: number;
  
  // 用户自定义变量（可读写）
  [key: string]: any;
}
```

### 3. 条件评估器
**文件**：`libs/operations-framework/src/event-driven/TriggerConditionEvaluator.ts`

核心功能：
- 支持多种条件类型：变量条件、表达式条件、消息载荷条件
- 支持比较运算符：`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `matches`
- 支持组合条件：`all`（所有条件满足）、`any`（任一条件满足）
- 支持防抖和节流：避免频繁触发

使用示例：
```typescript
{
  "triggers": [
    {
      "message": "MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE",
      "condition": {
        "all": [
          {
            "variable": "scrollCount",
            "scope": "root",
            "operator": "lt",
            "value": 10
          },
          {
            "expression": "rootVariables.totalProducts < 100"
          }
        ]
      }
    }
  ]
}
```

### 4. 容器发现引擎
**文件**：`libs/operations-framework/src/event-driven/ContainerDiscoveryEngine.ts`

核心功能：
- 批量发现 DOM 元素
- 生成唯一容器标识：`definitionId_index_hash`
- 维护容器注册表和状态跟踪
- 提取元素元数据（ID、class、data-* 属性）

容器状态流转：
```
discovered → initializing → ready → processing → completed/error/removed
```

关键接口：
```typescript
interface DiscoveredContainer {
  containerId: string;
  definitionId: string;
  index: number;
  domPath: string | null;
  selector: string;
  variables: Record<string, any>;
  appearedAt: number;
  state: 'discovered' | 'initializing' | 'ready' | 'processing' | 'completed' | 'error' | 'removed';
  operationResults: Map<string, OperationResult>;
  metadata?: {
    hash: string;
    tagName?: string;
    attributes?: Record<string, string>;
  };
}
```

### 5. 操作执行器
**文件**：`libs/operations-framework/src/event-driven/ContainerOperationExecutor.ts`

核心功能：
- 支持三种执行策略：`serial`（串行）、`parallel`（并行）、`batch`（批量）
- 支持 6 种操作类型：`extract`, `click`, `highlight`, `input`, `scroll`, `custom`
- 操作结果记录和状态跟踪
- 批量完成消息发布

执行策略：
- **串行**：按顺序执行，前一个完成再执行下一个
- **并行**：所有容器同时执行，支持并发控制
- **批量**：分批执行，每批内串行，批次间并行

### 6. 状态跟踪器
**文件**：`libs/operations-framework/src/event-driven/ContainerStatusTracker.ts`

核心功能：
- 跟踪每个容器的操作状态
- 实时计算完成进度
- 发布全部完成消息（`MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE`）

状态类型：
```typescript
type ContainerOperationStatus = {
  containerId: string;
  operationId: string;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: any;
  error?: string;
}
```

### 7. 消息注册表
**文件**：`libs/operations-framework/src/event-driven/ContainerMessageRegistry.ts`

核心功能：
- 注册容器自定义消息
- 验证消息名称（必须以 `MSG_` 开头）
- 验证消息载荷类型
- 消息发布和查询

使用示例：
```typescript
{
  "messages": [
    {
      "name": "MSG_CONTAINER_ROOT_PRODUCT_FOUND",
      "description": "发现新商品容器",
      "payload": {
        "productId": "string",
        "title": "string",
        "price": "number"
      },
      "broadcast": true
    }
  ]
}
```

### 8. 统一导出索引
**文件**：`libs/operations-framework/src/event-driven/index.ts`

统一导出所有模块，便于使用。

## 消息流程示例

### 滚动加载商品流程

```
1. MSG_CONTAINER_ROOT_PAGE_LOAD (页面加载完成）
   ↓
2. MSG_CONTAINER_ROOT_DISCOVER_START (开始发现)
   ↓
3. MSG_CONTAINER_CHILD_DISCOVERED (多次，每个商品容器)
   ↓
4. MSG_CONTAINER_ROOT_DISCOVER_COMPLETE (发现完成)
   ↓
5. MSG_CONTAINER_OPERATION_START (多次，每个容器）
   ↓
6. MSG_CONTAINER_OPERATION_COMPLETE (多次，每个容器)
   ↓
7. MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE (批量完成)
   ↓
8. MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE (全部完成)
   ↓
9. 判断是否继续滚动（条件触发）
   ↓
10. MSG_CONTAINER_ROOT_SCROLL_START (滚动开始)
    ↓
11. MSG_CONTAINER_ROOT_SCROLL_PROGRESS (滚动进度)
    ↓
12. 回到步骤 2，开始下一轮发现
```

## 核心设计原则

1. **消息驱动**：所有行为通过消息触发和传播
2. **状态隔离**：根容器变量独立，子容器变量独立
3. **唯一标识**：每个容器有唯一 ID（`definitionId_index_hash`）
4. **批量处理**：支持多容器批量操作和状态跟踪
5. **条件触发**：支持复杂条件组合（变量 + 表达式）
6. **类型安全**：TypeScript 全面支持
7. **消息验证**：根据注册表验证消息载荷

## 使用示例

### 初始化系统

```typescript
import { 
  MessageBusService,
  ContainerVariableManager,
  TriggerConditionEvaluator,
  ContainerDiscoveryEngine,
  ContainerOperationExecutor,
  ContainerStatusTracker,
  ContainerMessageRegistry
} from '@webauto/operations-framework/event-driven';

const messageBus = new MessageBusService({ historyLimit: 1000 });
await messageBus.start();

const variableManager = new ContainerVariableManager(messageBus);
const conditionEvaluator = new TriggerConditionEvaluator(variableManager);
const discoveryEngine = new ContainerDiscoveryEngine(messageBus);
const operationExecutor = new ContainerOperationExecutor(discoveryEngine, messageBus);
const messageRegistry = new ContainerMessageRegistry(messageBus);
```

### 定义根容器

```json
{
  "id": "taobao_main_page",
  "type": "root",
  "selectors": [{ "css": "#app" }],
  
  "variables": {
    "productList": [],
    "scrollCount": 0,
    "totalProducts": 0,
    "stopScroll": false
  },
  
  "messages": [
    {
      "name": "MSG_CONTAINER_ROOT_PRODUCT_FOUND",
      "description": "发现新商品",
      "payload": {
        "productId": "string",
        "title": "string",
        "price": "number"
      }
    }
  ],
  
  "operations": [
    {
      "id": "auto_scroll",
      "type": "scroll",
      "triggers": [
        {
          "message": "MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE",
          "condition": {
            "all": [
              { "variable": "scrollCount", "scope": "root", "operator": "lt", "value": 10 },
              { "variable": "stopScroll", "scope": "root", "operator": "eq", "value": false }
            ]
          }
        }
      ]
    }
  ]
}
```

## 文件结构

```
libs/operations-framework/src/event-driven/
├── index.ts                        # 统一导出 ✅
├── MessageConstants.ts             # 消息常量（已扩展）✅
├── MessageBusService.ts            # 消息总线服务 ✅
├── EventBus.ts                     # 原有 EventBus（兼容层）✅
├── ContainerVariableManager.ts      # 变量管理器 ✅
├── TriggerConditionEvaluator.ts     # 条件评估器 ✅
├── ContainerDiscoveryEngine.ts      # 发现引擎 ✅
├── ContainerOperationExecutor.ts    # 操作执行器 ✅
├── ContainerStatusTracker.ts        # 状态跟踪器 ✅
└── ContainerMessageRegistry.ts     # 消息注册表 ✅
```

## 下一步工作

### 待实现
1. 实现 RootContainerDriver（根容器驱动器）
2. 集成到容器运行时
3. UI 界面集成（容器编辑器、消息面板、变量查看器）

### UI 需求
1. 根容器特殊配置界面（消息 + 变量）
2. 消息匹配配置（支持 MSG_* + 通配符）
3. 自定义消息创建界面
4. 变量创建与编辑界面（类型/默认值/只读）
5. 消息历史查看器
6. 操作执行状态面板

## 验收标准

- [x] 变量管理器支持根容器和子容器变量
- [x] 条件评估器支持多种条件类型和组合
- [x] 发现引擎支持批量发现和唯一标识
- [x] 操作执行器支持三种执行策略
- [x] 状态跟踪器支持完成进度计算
- [x] 消息注册表支持自定义消息注册和验证
- [ ] 根容器驱动器支持滚动加载逻辑
- [ ] 集成到容器运行时
- [ ] UI 界面支持根容器特殊配置
