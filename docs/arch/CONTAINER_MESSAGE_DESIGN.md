# 容器消息系统设计方案

## 需求回顾

基于您的描述，容器消息系统需要支持：

1. **页面级状态管理**：根容器挂载页面变量和状态
2. **页面事件驱动**：页面加载、滚动、导航等事件挂在根容器
3. **子容器发现**：从根容器向下搜索，发现子容器后发出 appear 事件
4. **消息传播机制**：所有消息从根容器向下传播
5. **容器内消息注册**：根容器定义中可以注册自定义消息
6. **事件触发操作**：通过消息驱动容器操作执行

## 核心设计原则

### 1. 消息层级结构

```
根容器（页面级）
  ├── 系统消息（页面生命周期）
  ├── 自定义消息（业务特定）
  └── 子容器消息（转发 + 过滤）
      ├── 容器生命周期
      ├── 容器交互事件
      └── 容器状态变更
```

### 2. 消息流向

```
页面加载
  ↓
MSG_CONTAINER_ROOT_PAGE_LOAD (根容器接收)
  ↓
根容器初始化状态变量
  ↓
MSG_CONTAINER_ROOT_DISCOVER_START (开始发现子容器)
  ↓
MSG_CONTAINER_APPEAR (子容器出现)
  ↓
子容器响应 appear 事件执行操作
  ↓
MSG_CONTAINER_OPERATION_COMPLETE (操作完成)
```

## 推荐的容器消息分类

### A. 根容器专属消息

#### A1. 页面生命周期消息
```typescript
// 页面加载完成
MSG_CONTAINER_ROOT_PAGE_LOAD
MSG_CONTAINER_ROOT_PAGE_DOM_READY
MSG_CONTAINER_ROOT_PAGE_FULLY_LOADED

// 页面导航
MSG_CONTAINER_ROOT_PAGE_NAVIGATE
MSG_CONTAINER_ROOT_PAGE_NAVIGATE_COMPLETE

// 页面卸载
MSG_CONTAINER_ROOT_PAGE_UNLOAD
MSG_CONTAINER_ROOT_PAGE_BEFORE_UNLOAD
```

#### A2. 页面级操作消息
```typescript
// 滚动操作
MSG_CONTAINER_ROOT_SCROLL_START
MSG_CONTAINER_ROOT_SCROLL_PROGRESS
MSG_CONTAINER_ROOT_SCROLL_BOTTOM
MSG_CONTAINER_ROOT_SCROLL_STOP
MSG_CONTAINER_ROOT_SCROLL_TO_TOP

// 刷新操作
MSG_CONTAINER_ROOT_REFRESH_START
MSG_CONTAINER_ROOT_REFRESH_COMPLETE
```

#### A3. 子容器发现消息
```typescript
// 发现流程
MSG_CONTAINER_ROOT_DISCOVER_START      // 开始发现
MSG_CONTAINER_ROOT_DISCOVER_PROGRESS   // 发现进度
MSG_CONTAINER_ROOT_DISCOVER_COMPLETE   // 发现完成

// 子容器生命周期（根容器发出）
MSG_CONTAINER_CHILD_DISCOVERED         // 子容器被发现
MSG_CONTAINER_CHILD_REGISTERED         // 子容器已注册
MSG_CONTAINER_CHILD_REMOVED            // 子容器被移除
```

#### A4. 状态管理消息
```typescript
// 变量操作
MSG_CONTAINER_ROOT_VAR_SET
MSG_CONTAINER_ROOT_VAR_GET
MSG_CONTAINER_ROOT_VAR_DELETE
MSG_CONTAINER_ROOT_VAR_CHANGED

// 状态变更
MSG_CONTAINER_ROOT_STATE_CHANGED
MSG_CONTAINER_ROOT_STATE_READY
MSG_CONTAINER_ROOT_STATE_BUSY
MSG_CONTAINER_ROOT_STATE_ERROR
```

### B. 通用容器消息

#### B1. 生命周期消息
```typescript
MSG_CONTAINER_CREATED                  // 容器创建
MSG_CONTAINER_INITIALIZED              // 容器初始化完成
MSG_CONTAINER_MOUNTED                  // 容器挂载到 DOM
MSG_CONTAINER_APPEAR                   // 容器出现（appear 事件）
MSG_CONTAINER_DISAPPEAR                // 容器消失
MSG_CONTAINER_DESTROYED                // 容器销毁
```

#### B2. 交互事件消息
```typescript
MSG_CONTAINER_FOCUSED                  // 获得焦点
MSG_CONTAINER_DEFOCUSED                // 失去焦点
MSG_CONTAINER_CLICK                    // 点击
MSG_CONTAINER_DOUBLE_CLICK             // 双击
MSG_CONTAINER_INPUT                    // 输入
MSG_CONTAINER_CHANGE                   // 变更
MSG_CONTAINER_SUBMIT                   // 提交
MSG_CONTAINER_HOVER                    // 悬停
MSG_CONTAINER_LEAVE                    // 离开
```

#### B3. 数据操作消息
```typescript
MSG_CONTAINER_DATA_EXTRACT_START       // 开始提取数据
MSG_CONTAINER_DATA_EXTRACT_PROGRESS    // 提取进度
MSG_CONTAINER_DATA_EXTRACT_COMPLETE    // 提取完成
MSG_CONTAINER_DATA_EXTRACT_FAILED      // 提取失败

MSG_CONTAINER_DATA_UPDATED             // 数据更新
MSG_CONTAINER_DATA_VALIDATED           // 数据验证
MSG_CONTAINER_DATA_SUBMITTED           // 数据提交
```

#### B4. 操作执行消息
```typescript
MSG_CONTAINER_OPERATION_START          // 操作开始
MSG_CONTAINER_OPERATION_PROGRESS       // 操作进度
MSG_CONTAINER_OPERATION_COMPLETE       // 操作完成
MSG_CONTAINER_OPERATION_FAILED         // 操作失败
MSG_CONTAINER_OPERATION_CANCELLED      // 操作取消
MSG_CONTAINER_OPERATION_RETRY          // 操作重试
```

### C. 业务特定消息（示例）

#### C1. 列表容器消息
```typescript
MSG_CONTAINER_LIST_LOAD_MORE           // 加载更多
MSG_CONTAINER_LIST_ITEM_ADDED          // 列表项添加
MSG_CONTAINER_LIST_ITEM_REMOVED        // 列表项移除
MSG_CONTAINER_LIST_EMPTY               // 列表为空
MSG_CONTAINER_LIST_FULL                // 列表已满
```

#### C2. 表单容器消息
```typescript
MSG_CONTAINER_FORM_VALIDATE            // 表单验证
MSG_CONTAINER_FORM_SUBMIT              // 表单提交
MSG_CONTAINER_FORM_RESET               // 表单重置
MSG_CONTAINER_FORM_ERROR               // 表单错误
```

#### C3. 模态框消息
```typescript
MSG_CONTAINER_MODAL_OPEN               // 模态框打开
MSG_CONTAINER_MODAL_CLOSE              // 模态框关闭
MSG_CONTAINER_MODAL_CONFIRM            // 模态框确认
MSG_CONTAINER_MODAL_CANCEL             // 模态框取消
```

## 容器定义示例

### 根容器定义（淘宝主页）

```json
{
  "id": "taobao_main_page",
  "type": "root",
  "name": "淘宝主页",
  "selectors": [
    { "css": "#app", "variant": "primary" }
  ],
  
  "messages": [
    {
      "name": "MSG_CONTAINER_ROOT_PRODUCT_FOUND",
      "description": "发现新商品容器",
      "payload": {
        "productId": "string",
        "title": "string",
        "price": "number",
        "domPath": "string",
        "containerId": "string"
      },
      "broadcast": true
    },
    {
      "name": "MSG_CONTAINER_ROOT_SCROLL_COMPLETE",
      "description": "滚动加载完成",
      "payload": {
        "totalProducts": "number",
        "scrollCount": "number",
        "duration": "number"
      },
      "broadcast": true
    },
    {
      "name": "MSG_CONTAINER_ROOT_PRODUCT_CLICK",
      "description": "商品被点击",
      "payload": {
        "productId": "string",
        "url": "string"
      },
      "broadcast": false
    }
  ],
  
  "variables": {
    "productList": [],
    "scrollCount": 0,
    "totalProducts": 0,
    "isLoading": false,
    "lastScrollTime": 0
  },
  
  "operations": [
    {
      "id": "init_page",
      "type": "custom",
      "triggers": ["MSG_CONTAINER_ROOT_PAGE_LOAD"],
      "enabled": true,
      "config": {
        "script": "console.log('页面加载完成，初始化状态')",
        "emit": "MSG_CONTAINER_ROOT_DISCOVER_START"
      }
    },
    {
      "id": "auto_scroll",
      "type": "scroll",
      "triggers": ["MSG_CONTAINER_ROOT_DISCOVER_START"],
      "enabled": true,
      "config": {
        "direction": "down",
        "distance": 500,
        "interval": 2000,
        "maxScrolls": 10,
        "stopCondition": "MSG_CONTAINER_ROOT_SCROLL_BOTTOM",
        "emitProgress": "MSG_CONTAINER_ROOT_SCROLL_PROGRESS"
      }
    },
    {
      "id": "discover_products",
      "type": "discover",
      "triggers": ["MSG_CONTAINER_ROOT_SCROLL_PROGRESS"],
      "enabled": true,
      "config": {
        "containerPattern": "taobao_product_*",
        "maxDepth": 3,
        "emitFound": "MSG_CONTAINER_ROOT_PRODUCT_FOUND"
      }
    },
    {
      "id": "update_product_count",
      "type": "custom",
      "triggers": ["MSG_CONTAINER_ROOT_PRODUCT_FOUND"],
      "enabled": true,
      "config": {
        "script": "variables.totalProducts++; variables.productList.push(payload.productId);"
      }
    },
    {
      "id": "complete_scroll",
      "type": "custom",
      "triggers": ["MSG_CONTAINER_ROOT_SCROLL_BOTTOM"],
      "enabled": true,
      "config": {
        "script": "console.log('滚动完成，共发现', variables.totalProducts, '个商品')",
        "emit": "MSG_CONTAINER_ROOT_SCROLL_COMPLETE",
        "emitPayload": {
          "totalProducts": "${variables.totalProducts}",
          "scrollCount": "${variables.scrollCount}",
          "duration": "${Date.now() - variables.lastScrollTime}"
        }
      }
    }
  ]
}
```

### 子容器定义（商品卡片）

```json
{
  "id": "taobao_product_card",
  "type": "item",
  "name": "商品卡片",
  "parent": "taobao_main_page",
  "selectors": [
    { "css": ".product-card", "variant": "primary" }
  ],
  
  "messages": [
    {
      "name": "MSG_CONTAINER_PRODUCT_DETAIL_REQUESTED",
      "description": "请求查看商品详情",
      "payload": {
        "productId": "string",
        "url": "string"
      }
    }
  ],
  
  "variables": {
    "productId": null,
    "title": null,
    "price": null,
    "isHighlighted": false
  },
  
  "operations": [
    {
      "id": "extract_info",
      "type": "extract",
      "triggers": ["MSG_CONTAINER_APPEAR"],
      "enabled": true,
      "config": {
        "selectors": {
          "title": ".product-title",
          "price": ".product-price",
          "productId": "[data-product-id]"
        },
        "storeInVariables": true,
        "emit": "MSG_CONTAINER_ROOT_PRODUCT_FOUND",
        "emitPayload": {
          "productId": "${variables.productId}",
          "title": "${variables.title}",
          "price": "${variables.price}",
          "domPath": "${metadata.dom_path}",
          "containerId": "${id}"
        }
      }
    },
    {
      "id": "highlight_on_focus",
      "type": "highlight",
      "triggers": ["MSG_CONTAINER_FOCUSED"],
      "enabled": true,
      "config": {
        "style": "2px solid #ff6600",
        "duration": 0
      }
    },
    {
      "id": "clear_highlight",
      "type": "highlight",
      "triggers": ["MSG_CONTAINER_DEFOCUSED"],
      "enabled": true,
      "config": {
        "style": "none"
      }
    },
    {
      "id": "handle_click",
      "type": "custom",
      "triggers": ["MSG_CONTAINER_CLICK"],
      "enabled": true,
      "config": {
        "script": "const url = document.querySelector('.product-link')?.href;",
        "emit": "MSG_CONTAINER_PRODUCT_DETAIL_REQUESTED",
        "emitPayload": {
          "productId": "${variables.productId}",
          "url": "${url}"
        }
      }
    }
  ]
}
```

## 消息订阅和发布机制

### 1. 容器运行时订阅消息

```typescript
class ContainerRuntime {
  private messageBus: MessageBusService;
  private container: Container;
  
  async initialize() {
    // 订阅容器定义中的 triggers
    for (const operation of this.container.operations) {
      for (const trigger of operation.triggers) {
        this.messageBus.subscribe(trigger, async (message) => {
          // 检查是否是针对当前容器
          if (this.shouldHandleMessage(message)) {
            await this.executeOperation(operation, message);
          }
        }, {
          priority: operation.priority || 5,
          filter: (msg) => this.filterMessage(msg, operation)
        });
      }
    }
    
    // 根容器订阅页面事件
    if (this.container.type === 'root') {
      this.subscribePageEvents();
    }
  }
  
  private subscribePageEvents() {
    // 页面加载事件
    window.addEventListener('load', () => {
      this.messageBus.publish(MSG_CONTAINER_ROOT_PAGE_LOAD, {
        containerId: this.container.id,
        url: window.location.href,
        timestamp: Date.now()
      }, { component: 'ContainerRuntime', containerId: this.container.id });
    });
    
    // 页面滚动事件
    window.addEventListener('scroll', debounce(() => {
      this.messageBus.publish(MSG_CONTAINER_ROOT_PAGE_SCROLL, {
        containerId: this.container.id,
        scrollTop: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight
      }, { component: 'ContainerRuntime', containerId: this.container.id });
    }, 100));
  }
  
  private shouldHandleMessage(message: Message): boolean {
    // 广播消息：所有容器都处理
    if (message.meta.broadcast) {
      return true;
    }
    
    // 定向消息：只有目标容器处理
    if (message.payload.containerId) {
      return message.payload.containerId === this.container.id;
    }
    
    // 父容器消息：子容器可以接收
    if (message.source.containerId) {
      return this.isChildOf(message.source.containerId);
    }
    
    return true;
  }
}
```

### 2. 操作执行后发送消息

```typescript
class OperationExecutor {
  async execute(operation: Operation, message: Message) {
    const result = await this.runOperation(operation);
    
    // 操作完成后发送消息
    if (operation.config.emit) {
      const payload = this.resolvePayload(
        operation.config.emitPayload, 
        { result, message, variables: this.container.variables }
      );
      
      await this.messageBus.publish(operation.config.emit, payload, {
        component: 'OperationExecutor',
        containerId: this.container.id
      });
    }
    
    // 发送通用操作完成消息
    await this.messageBus.publish(MSG_CONTAINER_OPERATION_COMPLETE, {
      containerId: this.container.id,
      operationId: operation.id,
      success: result.success,
      duration: result.duration
    }, {
      component: 'OperationExecutor',
      containerId: this.container.id
    });
  }
}
```

## 消息注册表

### 在根容器中注册自定义消息

```typescript
interface MessageDefinition {
  name: string;              // 消息名称（必须以 MSG_ 开头）
  description: string;       // 消息描述
  payload: Record<string, string>;  // 载荷字段及类型
  broadcast?: boolean;       // 是否广播（默认 false）
  ttl?: number;             // 生存时间（毫秒）
  persist?: boolean;        // 是否持久化
}

class ContainerMessageRegistry {
  private messageDefinitions: Map<string, MessageDefinition> = new Map();
  
  registerMessages(containerId: string, messages: MessageDefinition[]) {
    for (const msg of messages) {
      // 验证消息名称
      if (!msg.name.startsWith('MSG_')) {
        throw new Error(`消息名称必须以 MSG_ 开头: ${msg.name}`);
      }
      
      // 注册到全局注册表
      this.messageDefinitions.set(msg.name, {
        ...msg,
        containerId
      });
      
      console.log(`[MessageRegistry] 注册消息: ${msg.name} (${containerId})`);
    }
  }
  
  getMessageDefinition(messageName: string): MessageDefinition | null {
    return this.messageDefinitions.get(messageName) || null;
  }
  
  validatePayload(messageName: string, payload: any): boolean {
    const def = this.messageDefinitions.get(messageName);
    if (!def) return true; // 未注册的消息不验证
    
    for (const [key, type] of Object.entries(def.payload)) {
      if (!(key in payload)) {
        console.warn(`[MessageRegistry] 缺少字段: ${key} in ${messageName}`);
        return false;
      }
      
      const actualType = typeof payload[key];
      if (actualType !== type) {
        console.warn(`[MessageRegistry] 类型错误: ${key} 应为 ${type}，实际为 ${actualType}`);
        return false;
      }
    }
    
    return true;
  }
}
```

## 推荐的实现优先级

### Phase 1: 基础消息（本周）
1. ✅ 根容器页面生命周期消息
2. ✅ 容器生命周期消息（created, appear, destroyed）
3. ✅ 基本交互消息（click, focus, input）

### Phase 2: 发现机制（下周）
1. 子容器发现消息
2. 容器注册和移除消息
3. 消息注册表实现

### Phase 3: 操作集成（下下周）
1. 操作触发器消息订阅
2. 操作执行结果消息发布
3. 消息驱动的操作链

### Phase 4: 高级功能（月底）
1. 消息过滤和转发
2. 消息优先级和去重
3. 业务特定消息支持

## 总结

### 核心推荐

1. **消息命名规范**：严格遵循 `MSG_CONTAINER_<层级>_<对象>_<动作>` 格式
2. **根容器专属**：页面级事件和状态管理消息只在根容器
3. **消息注册表**：支持在容器定义中注册自定义消息
4. **操作触发**：通过 `triggers` 字段订阅消息
5. **消息发布**：操作完成后通过 `emit` 字段发布消息
6. **变量引用**：支持 `${variables.xxx}` 语法引用容器变量
7. **消息验证**：根据注册表验证消息载荷

这个设计既保持了灵活性，又提供了足够的约束来保证系统的可维护性。

## 补充设计：根容器变量与条件触发

### 1. 根容器局部变量

#### 1.1 变量作用域

```typescript
interface ContainerVariables {
  // 系统级变量（只读）
  readonly $containerId: string;
  readonly $type: 'root' | 'item' | 'list' | 'form';
  readonly $parent: string | null;
  readonly $domPath: string;
  
  // 用户自定义变量（可读写）
  [key: string]: any;
}

class ContainerVariableManager {
  private rootVariables: Map<string, ContainerVariables> = new Map();
  
  /**
   * 初始化根容器变量
   */
  initRootVariables(containerId: string, initialVariables: Record<string, any>): void {
    this.rootVariables.set(containerId, {
      $containerId: containerId,
      $type: 'root',
      $parent: null,
      $domPath: '/root',
      ...initialVariables
    });
  }
  
  /**
   * 设置变量（通过消息）
   */
  async setVariable(containerId: string, key: string, value: any): Promise<void> {
    const variables = this.rootVariables.get(containerId);
    if (!variables) {
      throw new Error(`容器未找到: ${containerId}`);
    }
    
    // 系统变量不可修改
    if (key.startsWith('$')) {
      throw new Error(`系统变量不可修改: ${key}`);
    }
    
    const oldValue = variables[key];
    variables[key] = value;
    
    // 发布变量变更消息
    await messageBus.publish(MSG_CONTAINER_ROOT_VAR_CHANGED, {
      containerId,
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    }, {
      component: 'ContainerVariableManager',
      containerId
    });
  }
  
  /**
   * 获取变量
   */
  getVariable(containerId: string, key: string): any {
    const variables = this.rootVariables.get(containerId);
    return variables?.[key];
  }
  
  /**
   * 获取所有变量
   */
  getAllVariables(containerId: string): ContainerVariables | null {
    return this.rootVariables.get(containerId) || null;
  }
}
```

#### 1.2 通过消息修改变量

```typescript
// 操作定义中支持修改变量
{
  "id": "update_product_count",
  "type": "custom",
  "triggers": ["MSG_CONTAINER_ROOT_PRODUCT_FOUND"],
  "enabled": true,
  "config": {
    // 通过消息修改变量
    "emitMessages": [
      {
        "type": "MSG_CONTAINER_ROOT_VAR_SET",
        "payload": {
          "key": "totalProducts",
          "value": "${variables.totalProducts + 1}"
        }
      },
      {
        "type": "MSG_CONTAINER_ROOT_VAR_SET",
        "payload": {
          "key": "lastProductId",
          "value": "${payload.productId}"
        }
      }
    ]
  }
}
```

### 2. 条件触发机制

#### 2.1 触发器定义扩展

```typescript
interface OperationTrigger {
  // 消息触发
  message?: string;                    // 消息类型
  messagePattern?: string;             // 消息模式（支持通配符）
  
  // 条件触发
  condition?: TriggerCondition;        // 触发条件
  
  // 组合触发
  all?: OperationTrigger[];           // 所有条件满足
  any?: OperationTrigger[];           // 任一条件满足
  
  // 防抖/节流
  debounce?: number;                  // 防抖时间（毫秒）
  throttle?: number;                  // 节流时间（毫秒）
  
  // 优先级
  priority?: number;                  // 优先级（数字越大优先级越高）
}

interface TriggerCondition {
  // 变量条件
  variable?: string;                  // 变量名
  scope?: 'root' | 'current';        // 变量作用域（根容器/当前容器）
  operator?: ComparisonOperator;      // 比较运算符
  value?: any;                        // 比较值
  
  // 表达式条件
  expression?: string;                // JavaScript 表达式
  
  // 消息条件
  messagePayload?: {                  // 消息载荷条件
    [key: string]: any;
  };
}

type ComparisonOperator = 
  | 'eq'      // 等于
  | 'neq'     // 不等于
  | 'gt'      // 大于
  | 'gte'     // 大于等于
  | 'lt'      // 小于
  | 'lte'     // 小于等于
  | 'in'      // 包含
  | 'contains' // 包含
  | 'matches'; // 正则匹配
```

#### 2.2 条件评估器

```typescript
class TriggerConditionEvaluator {
  private variableManager: ContainerVariableManager;
  
  /**
   * 评估触发条件
   */
  async evaluate(
    containerId: string,
    trigger: OperationTrigger,
    message: Message
  ): Promise<boolean> {
    // 1. 检查消息匹配
    if (trigger.message && !this.matchMessage(trigger.message, message.type)) {
      return false;
    }
    
    if (trigger.messagePattern && !this.matchPattern(trigger.messagePattern, message.type)) {
      return false;
    }
    
    // 2. 检查条件
    if (trigger.condition) {
      const conditionMet = await this.evaluateCondition(containerId, trigger.condition, message);
      if (!conditionMet) {
        return false;
      }
    }
    
    // 3. 检查组合条件
    if (trigger.all) {
      for (const subTrigger of trigger.all) {
        const subResult = await this.evaluate(containerId, subTrigger, message);
        if (!subResult) {
          return false;
        }
      }
    }
    
    if (trigger.any) {
      let anyMet = false;
      for (const subTrigger of trigger.any) {
        const subResult = await this.evaluate(containerId, subTrigger, message);
        if (subResult) {
          anyMet = true;
          break;
        }
      }
      if (!anyMet) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 评估单个条件
   */
  private async evaluateCondition(
    containerId: string,
    condition: TriggerCondition,
    message: Message
  ): Promise<boolean> {
    // 变量条件
    if (condition.variable) {
      return this.evaluateVariableCondition(containerId, condition, message);
    }
    
    // 表达式条件
    if (condition.expression) {
      return this.evaluateExpressionCondition(containerId, condition, message);
    }
    
    // 消息载荷条件
    if (condition.messagePayload) {
      return this.evaluatePayloadCondition(message, condition.messagePayload);
    }
    
    return true;
  }
  
  /**
   * 评估变量条件
   */
  private evaluateVariableCondition(
    containerId: string,
    condition: TriggerCondition,
    message: Message
  ): boolean {
    const scope = condition.scope || 'current';
    let variableValue: any;
    
    if (scope === 'root') {
      // 从根容器获取变量
      const rootId = this.findRootContainer(containerId);
      variableValue = this.variableManager.getVariable(rootId, condition.variable!);
    } else {
      // 从当前容器获取变量
      variableValue = this.variableManager.getVariable(containerId, condition.variable!);
    }
    
    return this.compareValues(variableValue, condition.operator!, condition.value);
  }
  
  /**
   * 评估表达式条件
   */
  private evaluateExpressionCondition(
    containerId: string,
    condition: TriggerCondition,
    message: Message
  ): boolean {
    try {
      const variables = this.variableManager.getAllVariables(containerId);
      const rootId = this.findRootContainer(containerId);
      const rootVariables = this.variableManager.getAllVariables(rootId);
      
      const context = {
        variables,
        rootVariables,
        payload: message.payload,
        message
      };
      
      // 使用 Function 创建安全的执行环境
      const fn = new Function('context', `
        const { variables, rootVariables, payload, message } = context;
        return ${condition.expression};
      `);
      
      return Boolean(fn(context));
    } catch (error) {
      console.error('[TriggerConditionEvaluator] 表达式评估失败:', error);
      return false;
    }
  }
  
  /**
   * 评估消息载荷条件
   */
  private evaluatePayloadCondition(
    message: Message,
    expectedPayload: Record<string, any>
  ): boolean {
    for (const [key, value] of Object.entries(expectedPayload)) {
      if (!(key in message.payload)) {
        return false;
      }
      
      if (typeof value === 'object' && value !== null) {
        // 递归比较对象
        if (!this.deepEqual(message.payload[key], value)) {
          return false;
        }
      } else {
        // 简单值比较
        if (message.payload[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * 比较值
   */
  private compareValues(actual: any, operator: ComparisonOperator, expected: any): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      
      case 'neq':
        return actual !== expected;
      
      case 'gt':
        return actual > expected;
      
      case 'gte':
        return actual >= expected;
      
      case 'lt':
        return actual < expected;
      
      case 'lte':
        return actual <= expected;
      
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      
      case 'contains':
        if (typeof actual === 'string') {
          return actual.includes(String(expected));
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;
      
      case 'matches':
        if (typeof actual === 'string' && typeof expected === 'string') {
          const regex = new RegExp(expected);
          return regex.test(actual);
        }
        return false;
      
      default:
        return false;
    }
  }
  
  private matchMessage(message: string, type: string): boolean {
    return message === type;
  }
  
  private matchPattern(pattern: string, type: string): boolean {
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(type);
  }
  
  private deepEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  
  private findRootContainer(containerId: string): string {
    // 简化实现：假设根容器 ID 不包含下划线后缀
    return containerId.split('_')[0] + '_main_page';
  }
}
```

#### 2.3 完整触发器示例

```json
{
  "id": "scroll_when_ready",
  "type": "scroll",
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
            "variable": "stopScroll",
            "scope": "root",
            "operator": "eq",
            "value": false
          },
          {
            "expression": "rootVariables.totalProducts < 100"
          }
        ]
      }
    }
  ],
  "config": {
    "direction": "down",
    "distance": 500
  }
}
```

```json
{
  "id": "highlight_expensive_products",
  "type": "highlight",
  "triggers": [
    {
      "messagePattern": "MSG_CONTAINER_*_APPEAR",
      "condition": {
        "variable": "price",
        "scope": "current",
        "operator": "gt",
        "value": 1000
      }
    }
  ],
  "config": {
    "style": "3px solid red",
    "duration": 0
  }
}
```

```json
{
  "id": "stop_on_error_threshold",
  "type": "custom",
  "triggers": [
    {
      "message": "MSG_CONTAINER_OPERATION_FAILED",
      "condition": {
        "expression": "rootVariables.failedCount >= 5"
      }
    }
  ],
  "config": {
    "emitMessages": [
      {
        "type": "MSG_CONTAINER_ROOT_VAR_SET",
        "payload": {
          "key": "stopScroll",
          "value": true
        }
      },
      {
        "type": "MSG_CONTAINER_ROOT_SCROLL_STOP",
        "payload": {
          "reason": "Too many failures",
          "failedCount": "${rootVariables.failedCount}"
        }
      }
    ]
  }
}
```

这个扩展设计完整支持了：
1. 根容器局部变量的定义和通过消息修改
2. 基于变量（根容器/当前容器）和消息载荷的条件触发
3. 复杂的条件组合（all/any）和表达式评估

这使得容器系统具备了完整的状态管理和条件驱动能力。
