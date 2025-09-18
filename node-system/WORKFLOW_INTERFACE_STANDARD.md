# 工作流节点系统接口标准 (Workflow Node System Interface Standard)

## 版本 0.1

本文档定义了工作流节点系统的标准化接口和属性，确保所有节点实现的一致性和互操作性。

## 1. 核心接口架构

### 1.1 BaseNode 抽象基类

所有节点必须继承自 `BaseNode` 类并实现其核心接口：

```typescript
abstract class BaseNode {
    // 必须实现的抽象方法
    abstract async execute(context: ExecutionContext, params?: any): Promise<any>

    // 输入验证
    validateInputs(context: ExecutionContext): boolean

    // 参数解析
    resolveParameters(context: ExecutionContext): object

    // 变量解析
    resolveVariable(expression: string, context: ExecutionContext): string

    // 输入输出管理
    getInput(context: ExecutionContext, inputName: string): any
    setOutput(context: ExecutionContext, outputName: string, value: any): void

    // 状态管理
    getState(): NodeState
    canExecute(context: ExecutionContext): boolean
}
```

### 1.2 ExecutionContext 执行上下文

```typescript
class ExecutionContext {
    // 节点管理
    addNode(node: BaseNode): void
    getNode(nodeId: string): BaseNode | undefined

    // 连接管理
    addConnection(connection: NodeConnection): void

    // 输入输出
    setOutput(nodeId: string, outputName: string, value: any): void
    hasInput(nodeId: string, inputName: string): boolean
    getInput(nodeId: string, inputName: string): any

    // 变量管理
    setVariable(name: string, value: any): void
    hasVariable(name: string): boolean
    getVariable(name: string): any

    // 全局状态
    setGlobalState(key: string, value: any): void
    getGlobalState(key: string): any

    // 执行统计
    getExecutionStats(): ExecutionStats
}
```

### 1.3 NodeConnection 连接管理

```typescript
class NodeConnection {
    validate(fromNode: BaseNode, toNode: BaseNode): boolean

    // 连接属性
    fromNodeId: string
    fromOutput: string
    toNodeId: string
    toInput: string
    valid: boolean
    error: string | null
}
```

## 2. 节点生命周期

### 2.1 状态流转

```
idle → running → completed
         ↓
        error
```

### 2.2 执行方法签名

```typescript
async execute(context: ExecutionContext, params?: any): Promise<ExecutionResult>
```

其中 `ExecutionResult` 类型定义：

```typescript
interface ExecutionResult {
    success: boolean
    data?: any
    error?: string
    executionTime: number
    metadata?: Record<string, any>
}
```

## 3. 标准节点类型

### 3.1 BROWSER_OPERATOR - 浏览器操作节点

**输入接口:**
- `config` (object, 可选): 浏览器配置
- `cookies` (array, 可选): Cookie数组

**输出接口:**
- `page` (object): 页面对象
- `browser` (object): 浏览器对象

**必需参数:**
- `headless` (boolean): 是否无头模式

### 3.2 COOKIE_MANAGER - Cookie管理节点

**输入接口:**
- `cookiePath` (string, 必需): Cookie文件路径
- `domain` (string, 可选): 域名过滤

**输出接口:**
- `cookies` (array): Cookie数组
- `success` (boolean): 操作是否成功

**必需参数:**
- `cookiePath` (string): Cookie文件路径

### 3.3 NAVIGATION_OPERATOR - 导航操作节点

**输入接口:**
- `page` (object, 必需): 页面对象
- `url` (string, 必需): 目标URL
- `trigger` (any, 可选): 触发器

**输出接口:**
- `page` (object): 导航后的页面对象
- `navigationResult` (object): 导航结果

### 3.4 CONTAINER_EXTRACTOR - 容器提取节点

**输入接口:**
- `page` (object, 必需): 页面对象
- `containerSelector` (string, 必需): 容器选择器
- `linkSelector` (string, 可选): 链接选择器
- `maxPosts` (number, 可选): 最大帖子数量

**输出接口:**
- `containers` (array): 提取的容器数组
- `links` (array): 提取的链接数组
- `extractionResult` (object): 提取结果详情

### 3.5 LINK_FILTER - 链接过滤节点

**输入接口:**
- `links` (array, 必需): 待过滤链接
- `filterPatterns` (array, 可选): 过滤模式

**输出接口:**
- `filteredLinks` (array): 过滤后的链接
- `filterStats` (object): 过滤统计信息

### 3.6 FILE_SAVER - 文件保存节点

**输入接口:**
- `data` (any, 必需): 要保存的数据
- `filePath` (string, 必需): 文件路径
- `format` (string, 可选): 输出格式

**输出接口:**
- `savedPath` (string): 保存的文件路径
- `success` (boolean): 保存是否成功

### 3.7 CONDITIONAL_ROUTER - 条件路由节点

**输入接口:**
- `condition` (boolean, 必需): 条件判断
- `input` (any, 可选): 输入数据

**输出接口:**
- `true` (any): 条件为真时的输出
- `false` (any): 条件为假时的输出

### 3.8 LOOP_CONTROLLER - 循环控制器节点

**输入接口:**
- `items` (array, 必需): 循环项数组
- `currentItem` (any, 可选): 当前项

**输出接口:**
- `current` (any): 当前项
- `completed` (boolean): 循环是否完成

### 3.9 STATE_MANAGER - 状态管理节点

**输入接口:**
- `stateKey` (string, 必需): 状态键
- `stateValue` (any, 可选): 状态值

**输出接口:**
- `previousValue` (any): 前一个值
- `currentState` (any): 当前状态

## 4. 数据类型系统

### 4.1 支持的数据类型

- `string`: 字符串
- `number`: 数字
- `boolean`: 布尔值
- `object`: 对象
- `array`: 数组
- `any`: 任意类型

### 4.2 类型兼容性规则

1. 相同类型完全兼容
2. `any` 类型与所有类型兼容
3. 结构兼容性检查（未来版本增强）

## 5. 错误处理标准

### 5.1 错误传播机制

```typescript
// 节点内部错误处理
try {
    // 执行逻辑
    return { success: true, data: result };
} catch (error) {
    this.log('error', `Node execution failed: ${error.message}`);
    return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
    };
}
```

### 5.2 错误恢复策略

1. **节点级错误**: 节点标记为 `error` 状态，停止执行
2. **连接级错误**: 连接标记为无效，记录错误信息
3. **工作流级错误**: 整个工作流停止，生成错误报告

## 6. 配置和参数系统

### 6.1 参数优先级

1. 节点参数 (`this.parameters`)
2. 输入连接 (`this.getInput()`)
3. 默认值

### 6.2 变量解析

支持 `${variable}` 语法进行变量替换：

```javascript
{
    "parameters": {
        "outputPath": "${executionDir}/results/${timestamp}.json"
    }
}
```

## 7. 验证规则

### 7.1 节点验证

- 必需输入检查
- 参数类型验证
- 连接完整性验证
- 循环依赖检测

### 7.2 连接验证

- 输出端口存在性
- 输入端口存在性
- 类型兼容性
- 多重连接检查

## 8. 执行语义

### 8.1 依赖执行

节点只在所有依赖节点完成后才能执行：

```typescript
canExecute(context: ExecutionContext): boolean {
    for (const depId of this.dependencies) {
        const depNode = context.getNode(depId);
        if (!depNode || depNode.state !== 'completed') {
            return false;
        }
    }
    return true;
}
```

### 8.2 并发执行

没有依赖关系的节点可以并发执行。

## 9. 扩展性

### 9.1 自定义节点开发

1. 继承 `BaseNode` 类
2. 实现输入输出定义
3. 实现 `execute` 方法
4. 在 `NodeTypes` 中注册

### 9.2 节点注册

```typescript
const NodeTypes = {
    CUSTOM_NODE: {
        class: 'CustomNode',
        inputs: [...],
        outputs: [...]
    }
};
```

## 10. 性能考虑

### 10.1 内存管理

- 及时清理不再需要的引用
- 使用流式处理大数据集
- 避免循环引用

### 10.2 执行优化

- 并行执行独立节点
- 缓存重复计算结果
- 延迟加载资源

## 11. 调试和监控

### 11.1 日志系统

```typescript
log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void
```

### 11.2 执行追踪

- 执行时间统计
- 节点状态变化记录
- 错误堆栈保存
- 性能指标收集

## 12. 向后兼容性

### 12.1 版本控制

- 工作流文件版本号
- 节点接口版本标记
- 渐进式升级支持

### 12.2 废弃策略

- 提前至少一个主版本通知
- 提供迁移工具和文档
- 保持关键接口的稳定性

---

**版本 0.1** - 初始标准定义
- 核心接口架构
- 基础节点类型
- 执行语义定义
- 错误处理规范