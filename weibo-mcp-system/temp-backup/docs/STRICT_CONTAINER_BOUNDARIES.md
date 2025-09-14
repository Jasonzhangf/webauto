# 严格的容器边界和操作范围定义

## 1. 容器边界严格定义

### 1.1 容器边界原则

**核心原则**：每个容器严格对应页面树形结构中的一个DOM节点及其子树，操作范围仅限于该容器内部的元素。

```
容器边界规则：
1. 容器 = DOM节点 + 该节点下的所有子节点
2. 容器操作 = 仅作用于该容器DOM树内的元素
3. 容器通信 = 通过父容器或事件系统，不直接跨容器操作
4. 容器独立 = 每个容器有独立的选择器上下文和操作域
```

### 1.2 容器层级与DOM树的精确映射

```typescript
/**
 * 容器与DOM节点的精确映射
 */
interface IContainer {
  // 容器标识
  id: string;
  name: string;
  type: ContainerType;
  
  // DOM节点映射
  domNode: Element | null;
  selector: string;  // 在父容器中的相对选择器
  absoluteSelector: string;  // 在整个文档中的绝对选择器
  
  // 容器层级
  level: number;
  parent?: IContainer;
  children: IContainer[];
  
  // 边界控制
  boundary: {
    // 容器的DOM范围
    rootNode: Element;
    containmentScope: string;  // CSS containment scope
    
    // 选择器作用域
    selectorScope: string;  // 所有选择器都在此作用域内执行
    
    // 操作边界
    operationBoundary: {
      allowExternalAccess: boolean;
      allowInternalModifications: boolean;
      allowedOperations: OperationType[];
    };
  };
  
  // 容器状态
  state: ContainerState;
  isDiscovered: boolean;
  isValid: boolean;
  
  // 容器生命周期
  discover(): Promise<boolean>;
  validate(): Promise<boolean>;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * 容器边界验证接口
 */
interface IContainerBoundary {
  // 边界检查
  isElementInContainer(element: Element): boolean;
  isSelectorInContainer(selector: string): boolean;
  
  // 边界约束
  constrainSelector(selector: string): string;
  constrainElement(element: Element): Element | null;
  
  // 边界违规检测
  detectBoundaryViolation(operation: IOperation, params: any): BoundaryViolation | null;
  
  // 边界执行
  executeWithinBoundary<T>(operation: () => Promise<T>): Promise<T>;
}
```

## 2. 容器作用域选择器系统

### 2.1 相对选择器系统

```typescript
/**
 * 容器相对选择器系统
 */
class ContainerSelectorSystem {
  private container: IContainer;
  private scopeCache: Map<string, Element[]> = new Map();
  
  constructor(container: IContainer) {
    this.container = container;
  }
  
  /**
   * 在容器作用域内查找元素
   */
  async querySelector(selector: string): Promise<Element | null> {
    const scopedSelector = this.constrainSelector(selector);
    const rootNode = this.container.boundary.rootNode;
    
    if (!rootNode) {
      throw new Error(`Container ${this.container.id} not discovered`);
    }
    
    const result = rootNode.querySelector(scopedSelector);
    
    // 验证结果确实在容器内
    if (result && !this.isElementInContainer(result)) {
      throw new Error(`Selector returned element outside container boundary: ${selector}`);
    }
    
    return result;
  }
  
  /**
   * 在容器作用域内查找所有匹配元素
   */
  async querySelectorAll(selector: string): Promise<Element[]> {
    const scopedSelector = this.constrainSelector(selector);
    const rootNode = this.container.boundary.rootNode;
    
    if (!rootNode) {
      throw new Error(`Container ${this.container.id} not discovered`);
    }
    
    const results = Array.from(rootNode.querySelectorAll(scopedSelector));
    
    // 验证所有结果都在容器内
    const validResults = results.filter(element => this.isElementInContainer(element));
    
    if (validResults.length !== results.length) {
      throw new Error(`Some elements returned by selector are outside container boundary: ${selector}`);
    }
    
    return validResults;
  }
  
  /**
   * 约束选择器到容器作用域
   */
  private constrainSelector(selector: string): string {
    // 确保选择器不会逃逸容器边界
    const escapedSelector = selector
      .replace(/body/gi, ':not(body)')  // 防止选择body
      .replace(/html/gi, ':not(html)')  // 防止选择html
      .replace(/:root/gi, ':not(:root)');  // 防止选择根节点
    
    return escapedSelector;
  }
  
  /**
   * 检查元素是否在容器内
   */
  private isElementInContainer(element: Element): boolean {
    const rootNode = this.container.boundary.rootNode;
    if (!rootNode) return false;
    
    // 检查元素是否是容器根节点或其子节点
    return rootNode === element || rootNode.contains(element);
  }
  
  /**
   * 获取容器的绝对选择器
   */
  getAbsoluteSelector(): string {
    if (this.container.parent) {
      const parentSelector = this.container.parent.getSelector?.() || '';
      return `${parentSelector} > ${this.container.selector}`;
    }
    return this.container.selector;
  }
  
  /**
   * 清除缓存
   */
  clearCache(): void {
    this.scopeCache.clear();
  }
}
```

### 2.2 容器作用域验证器

```typescript
/**
 * 容器作用域验证器
 */
class ContainerBoundaryValidator {
  private container: IContainer;
  
  constructor(container: IContainer) {
    this.container = container;
  }
  
  /**
   * 验证元素是否在容器边界内
   */
  validateElement(element: Element): ValidationResult {
    if (!this.container.boundary.rootNode) {
      return {
        valid: false,
        error: 'Container not discovered'
      };
    }
    
    const rootNode = this.container.boundary.rootNode;
    
    // 检查元素是否在容器内
    if (!this.isElementInContainer(element, rootNode)) {
      return {
        valid: false,
        error: `Element is outside container boundary: ${element.tagName}`
      };
    }
    
    // 检查元素是否被允许操作
    if (!this.isElementOperationAllowed(element)) {
      return {
        valid: false,
        error: `Element operation not allowed: ${element.tagName}`
      };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证选择器是否在容器边界内
   */
  validateSelector(selector: string): ValidationResult {
    // 检查选择器是否会逃逸容器
    if (this.willEscapeContainer(selector)) {
      return {
        valid: false,
        error: `Selector will escape container boundary: ${selector}`
      };
    }
    
    // 检查选择器语法
    try {
      document.querySelector(selector);
    } catch (error) {
      return {
        valid: false,
        error: `Invalid selector syntax: ${selector}`
      };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证操作是否在容器边界内
   */
  validateOperation(operation: IOperation, params: any): ValidationResult {
    // 检查操作类型是否允许
    const allowedOperations = this.container.boundary.operationBoundary.allowedOperations;
    if (!allowedOperations.includes(operation.category as OperationType)) {
      return {
        valid: false,
        error: `Operation type not allowed in container: ${operation.category}`
      };
    }
    
    // 检查操作参数是否包含外部元素
    const externalElement = this.findExternalElementInParams(params);
    if (externalElement) {
      return {
        valid: false,
        error: `Operation parameters contain external element: ${externalElement}`
      };
    }
    
    return { valid: true };
  }
  
  /**
   * 检查元素是否在容器内
   */
  private isElementInContainer(element: Element, rootNode: Element): boolean {
    return rootNode === element || rootNode.contains(element);
  }
  
  /**
   * 检查元素操作是否被允许
   */
  private isElementOperationAllowed(element: Element): boolean {
    // 检查元素是否在允许操作的类型范围内
    const tagName = element.tagName.toLowerCase();
    const allowedTags = ['div', 'span', 'a', 'button', 'input', 'textarea', 'img', 'video'];
    
    return allowedTags.includes(tagName);
  }
  
  /**
   * 检查选择器是否会逃逸容器
   */
  private willEscapeContainer(selector: string): boolean {
    const escapePatterns = [
      /^body\b/i,
      /^html\b/i,
      /^:root\b/i,
      /\s+body\b/i,
      /\s+html\b/i,
      /\s+:root\b/i,
      /^>/,  // 直接子选择器可能逃逸
      /~\s*body/i,  // 兄弟选择器
      /\+\s*body/i  // 相邻兄弟选择器
    ];
    
    return escapePatterns.some(pattern => pattern.test(selector));
  }
  
  /**
   * 在参数中查找外部元素
   */
  private findExternalElementInParams(params: any): Element | null {
    if (typeof params !== 'object' || params === null) {
      return null;
    }
    
    // 检查直接包含的元素
    if (params instanceof Element) {
      if (!this.isElementInContainer(params, this.container.boundary.rootNode)) {
        return params;
      }
      return null;
    }
    
    // 递归检查嵌套对象
    for (const key in params) {
      const value = params[key];
      if (value instanceof Element) {
        if (!this.isElementInContainer(value, this.container.boundary.rootNode)) {
          return value;
        }
      } else if (typeof value === 'object' && value !== null) {
        const result = this.findExternalElementInParams(value);
        if (result) {
          return result;
        }
      }
    }
    
    return null;
  }
}
```

## 3. 容器操作边界执行器

### 3.1 边界安全的操作执行

```typescript
/**
 * 容器边界安全操作执行器
 */
class BoundaryAwareOperationExecutor {
  private container: IContainer;
  private validator: ContainerBoundaryValidator;
  private selectorSystem: ContainerSelectorSystem;
  
  constructor(container: IContainer) {
    this.container = container;
    this.validator = new ContainerBoundaryValidator(container);
    this.selectorSystem = new ContainerSelectorSystem(container);
  }
  
  /**
   * 在容器边界内安全执行操作
   */
  async execute<T>(operation: IOperation, params: any): Promise<OperationResult> {
    const startTime = Date.now();
    
    try {
      // 验证操作是否允许
      const operationValidation = this.validator.validateOperation(operation, params);
      if (!operationValidation.valid) {
        throw new BoundaryViolationError(operationValidation.error);
      }
      
      // 创建边界受限的执行上下文
      const boundedContext = this.createBoundedContext();
      
      // 执行操作
      const result = await this.executeWithBoundary(operation, params, boundedContext);
      
      return {
        success: true,
        status: OperationStatus.COMPLETED,
        data: result,
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          memory: process.memoryUsage().heapUsed
        },
        boundary: {
          containerId: this.container.id,
          boundaryMaintained: true
        }
      };
      
    } catch (error) {
      return {
        success: false,
        status: OperationStatus.FAILED,
        error: this.normalizeError(error),
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          memory: process.memoryUsage().heapUsed
        },
        boundary: {
          containerId: this.container.id,
          boundaryMaintained: false,
          violation: error instanceof BoundaryViolationError ? error.message : undefined
        }
      };
    }
  }
  
  /**
   * 创建边界受限的执行上下文
   */
  private createBoundedContext(): IExecutionContext {
    return {
      page: this.container.page,
      frame: this.container.frame,
      container: this.container,
      selectorSystem: this.selectorSystem,
      boundaryValidator: this.validator,
      environment: {
        timestamp: Date.now(),
        sessionId: generateSessionId(),
        containerId: this.container.id,
        boundaryMode: true
      },
      // 确保所有操作都在容器边界内
      querySelector: (selector: string) => this.selectorSystem.querySelector(selector),
      querySelectorAll: (selector: string) => this.selectorSystem.querySelectorAll(selector),
      evaluate: (func: Function, ...args: any[]) => this.safeEvaluate(func, ...args)
    };
  }
  
  /**
   * 在边界内执行操作
   */
  private async executeWithBoundary(
    operation: IOperation, 
    params: any, 
    context: IExecutionContext
  ): Promise<any> {
    // 创建边界包装器
    const boundaryWrapper = new BoundaryWrapper(context);
    
    try {
      // 在边界包装器中执行操作
      return await boundaryWrapper.execute(() => operation.execute(context, params));
    } finally {
      // 清理边界包装器
      boundaryWrapper.cleanup();
    }
  }
  
  /**
   * 安全执行页面评估
   */
  private async safeEvaluate(func: Function, ...args: any[]): Promise<any> {
    const rootNode = this.container.boundary.rootNode;
    if (!rootNode) {
      throw new Error('Container not discovered');
    }
    
    // 创建边界受限的评估函数
    const boundedFunc = () => {
      // 在容器上下文中执行
      return func.apply(rootNode, args);
    };
    
    return await this.container.page.evaluate(boundedFunc);
  }
  
  private normalizeError(error: Error): OperationError {
    return {
      message: error.message,
      stack: error.stack,
      code: error.name,
      timestamp: Date.now()
    };
  }
}

/**
 * 边界包装器
 */
class BoundaryWrapper {
  private context: IExecutionContext;
  private originalQuerySelector: Function;
  private originalQuerySelectorAll: Function;
  
  constructor(context: IExecutionContext) {
    this.context = context;
    this.originalQuerySelector = context.page.querySelector;
    this.originalQuerySelectorAll = context.page.querySelectorAll;
    
    // 替换为边界安全的方法
    this.installBoundaryMethods();
  }
  
  /**
   * 执行边界包装的操作
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof BoundaryViolationError) {
        throw error;
      }
      
      // 检查是否是边界违规
      if (this.isBoundaryViolation(error)) {
        throw new BoundaryViolationError(error.message);
      }
      
      throw error;
    }
  }
  
  /**
   * 安装边界方法
   */
  private installBoundaryMethods(): void {
    // 替换querySelector为边界安全版本
    this.context.page.querySelector = (selector: string) => {
      return this.context.selectorSystem.querySelector(selector);
    };
    
    // 替换querySelectorAll为边界安全版本
    this.context.page.querySelectorAll = (selector: string) => {
      return this.context.selectorSystem.querySelectorAll(selector);
    };
  }
  
  /**
   * 清理边界包装器
   */
  cleanup(): void {
    // 恢复原始方法
    this.context.page.querySelector = this.originalQuerySelector;
    this.context.page.querySelectorAll = this.originalQuerySelectorAll;
  }
  
  /**
   * 检查是否是边界违规
   */
  private isBoundaryViolation(error: Error): boolean {
    const boundaryViolationPatterns = [
      /Element not found/,
      /Selector returned element/,
      /outside container boundary/,
      /escape container boundary/,
      /not allowed in container/
    ];
    
    return boundaryViolationPatterns.some(pattern => pattern.test(error.message));
  }
}
```

## 4. 容器间通信机制

### 4.1 通过父容器的层级通信

```typescript
/**
 * 容器层级通信系统
 */
class ContainerHierarchicalCommunication {
  private container: IContainer;
  
  constructor(container: IContainer) {
    this.container = container;
  }
  
  /**
   * 向父容器发送请求
   */
  async requestFromParent<T>(request: ContainerRequest): Promise<T> {
    if (!this.container.parent) {
      throw new Error('No parent container available');
    }
    
    const parentCommunication = new ContainerHierarchicalCommunication(this.container.parent);
    return await parentCommunication.handleRequest(request);
  }
  
  /**
   * 处理子容器的请求
   */
  async handleRequest<T>(request: ContainerRequest): Promise<T> {
    // 验证请求是否在容器边界内
    if (!this.isRequestInBoundary(request)) {
      throw new BoundaryViolationError('Request exceeds container boundary');
    }
    
    // 处理请求
    switch (request.type) {
      case 'element_discovery':
        return await this.handleElementDiscovery(request);
      case 'operation_execution':
        return await this.handleOperationExecution(request);
      case 'state_query':
        return await this.handleStateQuery(request);
      default:
        throw new Error(`Unknown request type: ${request.type}`);
    }
  }
  
  /**
   * 向子容器广播消息
   */
  async broadcastToChildren(message: ContainerMessage): Promise<void> {
    for (const child of this.container.children) {
      const childCommunication = new ContainerHierarchicalCommunication(child);
      await childCommunication.receiveMessage(message);
    }
  }
  
  /**
   * 接收消息
   */
  async receiveMessage(message: ContainerMessage): Promise<void> {
    // 处理接收到的消息
    console.log(`Container ${this.container.id} received message:`, message);
  }
  
  /**
   * 检查请求是否在容器边界内
   */
  private isRequestInBoundary(request: ContainerRequest): boolean {
    // 验证请求中的选择器是否在容器内
    if (request.selector) {
      const validation = this.container.boundary.validator.validateSelector(request.selector);
      if (!validation.valid) {
        return false;
      }
    }
    
    // 验证请求参数是否包含外部元素
    if (this.containsExternalElements(request.params)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 检查参数是否包含外部元素
   */
  private containsExternalElements(params: any): boolean {
    // 递归检查参数中是否包含外部元素
    const checkElement = (element: Element): boolean => {
      return !this.container.boundary.validator.validateElement(element).valid;
    };
    
    const traverse = (obj: any): boolean => {
      if (obj instanceof Element) {
        return checkElement(obj);
      }
      
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (traverse(obj[key])) {
            return true;
          }
        }
      }
      
      return false;
    };
    
    return traverse(params);
  }
  
  private async handleElementDiscovery(request: ContainerRequest): Promise<any> {
    // 处理元素发现请求
    const selector = request.selector;
    return await this.container.selectorSystem.querySelector(selector);
  }
  
  private async handleOperationExecution(request: ContainerRequest): Promise<any> {
    // 处理操作执行请求
    const operation = request.operation;
    const params = request.params;
    
    const executor = new BoundaryAwareOperationExecutor(this.container);
    const result = await executor.execute(operation, params);
    
    return result;
  }
  
  private async handleStateQuery(request: ContainerRequest): Promise<any> {
    // 处理状态查询请求
    return this.container.state;
  }
}
```

这个修正后的设计确保了：

1. **严格的容器边界**：每个容器只能操作其DOM树范围内的元素
2. **相对选择器系统**：所有选择器都在容器作用域内执行
3. **边界验证**：所有操作都经过边界验证，防止跨容器操作
4. **层级通信**：容器间通信通过父容器进行，不直接跨容器操作
5. **错误处理**：专门的边界违规错误类型和处理机制

这样的设计确保了容器的独立性和操作的精确性。