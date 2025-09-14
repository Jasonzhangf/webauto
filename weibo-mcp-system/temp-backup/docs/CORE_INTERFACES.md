# 浏览器操作系统 - 核心接口设计

## 1. 核心接口定义

### 1.1 容器接口 (IContainer)

```typescript
/**
 * 容器接口 - 定义了容器化操作的基本契约
 */
interface IContainer {
    // 基础属性
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly type: ContainerType;
    readonly selectors: string[];
    readonly metadata: ContainerMetadata;
    
    // 内容和操作
    readonly contentList: IContainer[];
    readonly operations: Map<string, IOperation>;
    
    // 继承关系
    readonly parent?: IContainer;
    
    // 核心方法
    executeOperation(name: string, context: IExecutionContext, params?: any): Promise<OperationResult>;
    findChild(id: string): IContainer | null;
    getChildrenByType(type: ContainerType): IContainer[];
    addChild(child: IContainer): void;
    removeChild(id: string): boolean;
    
    // 操作管理
    addOperation(operation: IOperation): void;
    removeOperation(name: string): boolean;
    getOperation(name: string): IOperation | null;
    hasOperation(name: string): boolean;
    
    // 查询和验证
    matchesElement(element: Element): Promise<boolean>;
    findInContext(context: IExecutionContext): Promise<Element | null>;
    validate(): ValidationResult;
    
    // 序列化
    toJSON(): ContainerJSON;
    fromJSON(json: ContainerJSON): void;
}

/**
 * 容器类型枚举
 */
enum ContainerType {
    PAGE_CONTAINER = 'page-container',
    CONTENT_CONTAINER = 'content-container',
    MEDIA_CONTAINER = 'media-container',
    TEXT_CONTAINER = 'text-container',
    INTERACTIVE_CONTAINER = 'interactive-container',
    FORM_CONTAINER = 'form-container',
    NAVIGATION_CONTAINER = 'navigation-container',
    DATA_CONTAINER = 'data-container',
    CUSTOM = 'custom'
}

/**
 * 容器元数据
 */
interface ContainerMetadata {
    version?: string;
    author?: string;
    createdAt?: Date;
    updatedAt?: Date;
    tags?: string[];
    dependencies?: string[];
    config?: Record<string, any>;
}

/**
 * 容器JSON序列化格式
 */
interface ContainerJSON {
    id: string;
    name: string;
    description: string;
    type: ContainerType;
    selectors: string[];
    contentList: string[];
    operations: string[];
    metadata: ContainerMetadata;
    parent?: string;
}
```

### 1.2 操作接口 (IOperation)

```typescript
/**
 * 操作接口 - 定义了可执行操作的基本契约
 */
interface IOperation {
    // 基础属性
    readonly name: string;
    readonly description: string;
    readonly category: OperationCategory;
    readonly timeout: number;
    readonly retryCount: number;
    
    // 参数和验证
    readonly parameters: OperationParameter[];
    readonly preconditions: ValidationRule[];
    readonly postconditions: ValidationRule[];
    
    // 核心方法
    execute(context: IExecutionContext, params: any): Promise<OperationResult>;
    validate(params: any): ValidationResult;
    
    // 元数据
    readonly metadata: OperationMetadata;
}

/**
 * 操作类别枚举
 */
enum OperationCategory {
    NAVIGATION = 'navigation',
    EXTRACTION = 'extraction',
    INTERACTION = 'interaction',
    VALIDATION = 'validation',
    TRANSFORMATION = 'transformation',
    CUSTOM = 'custom'
}

/**
 * 操作参数定义
 */
interface OperationParameter {
    name: string;
    type: ParameterType;
    description: string;
    required: boolean;
    defaultValue?: any;
    validation?: ValidationRule[];
    options?: any[];
}

/**
 * 参数类型枚举
 */
enum ParameterType {
    STRING = 'string',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    ARRAY = 'array',
    OBJECT = 'object',
    FUNCTION = 'function',
    ANY = 'any'
}

/**
 * 验证规则
 */
interface ValidationRule {
    name: string;
    validator: (value: any) => boolean;
    errorMessage: string;
}

/**
 * 验证结果
 */
interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * 操作结果
 */
interface OperationResult {
    success: boolean;
    data?: any;
    error?: Error;
    executionTime: number;
    metadata?: Record<string, any>;
}

/**
 * 操作元数据
 */
interface OperationMetadata {
    version?: string;
    author?: string;
    createdAt?: Date;
    updatedAt?: Date;
    examples?: any[];
    notes?: string[];
    performance?: PerformanceMetrics;
}

/**
 * 性能指标
 */
interface PerformanceMetrics {
    averageExecutionTime?: number;
    successRate?: number;
    failureRate?: number;
    lastExecutionTime?: number;
}
```

### 1.3 执行上下文接口 (IExecutionContext)

```typescript
/**
 * 执行上下文接口 - 提供操作执行所需的环境信息
 */
interface IExecutionContext {
    // 基础环境
    readonly container: IContainer;
    readonly element: Element;
    readonly page: Page;
    
    // 工具和服务
    readonly finder: IElementFinder;
    readonly logger: ILogger;
    readonly metrics: IMetricsCollector;
    readonly cache: ICacheManager;
    
    // 配置和状态
    readonly config: RuntimeConfig;
    readonly state: StateManager;
    
    // 工具方法
    createChildContext(element: Element): IExecutionContext;
    waitForCondition(condition: () => Promise<boolean>, timeout?: number): Promise<boolean>;
    retryOperation<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T>;
}

/**
 * 元素查找器接口
 */
interface IElementFinder {
    findElement(selectors: string[], context?: Element): Promise<Element | null>;
    findElements(selectors: string[], context?: Element): Promise<Element[]>;
    waitForElement(selectors: string[], options?: WaitForOptions): Promise<Element>;
    isVisible(element: Element): Promise<boolean>;
    isEnabled(element: Element): Promise<boolean>;
}

/**
 * 日志记录器接口
 */
interface ILogger {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error, meta?: any): void;
}

/**
 * 性能指标收集器接口
 */
interface IMetricsCollector {
    recordOperation(operation: string, duration: number, success: boolean): void;
    recordError(operation: string, error: Error): void;
    getMetrics(): OperationMetrics[];
    reset(): void;
}

/**
 * 缓存管理器接口
 */
interface ICacheManager {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    invalidate(key: string): Promise<void>;
    clear(): Promise<void>;
}

/**
 * 运行时配置
 */
interface RuntimeConfig {
    defaultTimeout: number;
    maxRetries: number;
    enableCaching: boolean;
    enableMetrics: boolean;
    logLevel: LogLevel;
    customSettings: Record<string, any>;
}

/**
 * 日志级别
 */
enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

/**
 * 状态管理器
 */
interface StateManager {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
}
```

### 1.4 操作执行引擎接口 (IOperationExecutionEngine)

```typescript
/**
 * 操作执行引擎接口
 */
interface IOperationExecutionEngine {
    // 执行操作
    execute(container: IContainer, operationName: string, params?: any): Promise<OperationResult>;
    executeBatch(operations: OperationRequest[]): Promise<OperationResult[]>;
    
    // 引擎控制
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    
    // 监控和状态
    getStatus(): EngineStatus;
    getMetrics(): EngineMetrics;
    getHistory(): OperationHistory[];
    
    // 配置管理
    configure(config: EngineConfig): void;
    getConfiguration(): EngineConfig;
}

/**
 * 操作请求
 */
interface OperationRequest {
    containerId: string;
    operationName: string;
    params?: any;
    priority?: Priority;
    timeout?: number;
}

/**
 * 优先级枚举
 */
enum Priority {
    LOW = 'low',
    NORMAL = 'normal',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * 引擎状态
 */
interface EngineStatus {
    state: EngineState;
    uptime: number;
    operationsExecuted: number;
    successRate: number;
    averageExecutionTime: number;
    currentQueue: number;
}

/**
 * 引擎状态枚举
 */
enum EngineState {
    IDLE = 'idle',
    RUNNING = 'running',
    PAUSED = 'paused',
    STOPPED = 'stopped',
    ERROR = 'error'
}

/**
 * 引擎指标
 */
interface EngineMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageExecutionTime: number;
    operationsPerSecond: number;
    errorRate: number;
}

/**
 * 引擎配置
 */
interface EngineConfig {
    maxConcurrentOperations: number;
    defaultTimeout: number;
    maxRetries: number;
    enableMetrics: boolean;
    enableLogging: boolean;
    logLevel: LogLevel;
    queueSize: number;
    retryDelay: number;
}

/**
 * 操作历史记录
 */
interface OperationHistory {
    id: string;
    timestamp: Date;
    containerId: string;
    operationName: string;
    params: any;
    result: OperationResult;
    executionTime: number;
    retryCount: number;
}
```

### 1.5 容器管理器接口 (IContainerManager)

```typescript
/**
 * 容器管理器接口
 */
interface IContainerManager {
    // 容器注册和管理
    registerContainer(container: IContainer): void;
    unregisterContainer(id: string): boolean;
    getContainer(id: string): IContainer | null;
    getAllContainers(): IContainer[];
    
    // 容器查找和检索
    findContainerByType(type: ContainerType): IContainer[];
    findContainerBySelector(selector: string): IContainer[];
    findContainerByTag(tag: string): IContainer[];
    
    // 容器关系管理
    setParent(containerId: string, parentId: string): boolean;
    getChildren(containerId: string): IContainer[];
    getParent(containerId: string): IContainer | null;
    
    // 容器验证和检查
    validateContainer(container: IContainer): ValidationResult;
    checkDependencies(containerId: string): DependencyCheckResult;
    
    // 容器序列化
    exportContainers(): ContainerExport;
    importContainers(export: ContainerExport): void;
}

/**
 * 依赖检查结果
 */
interface DependencyCheckResult {
    isValid: boolean;
    missingDependencies: string[];
    circularDependencies: string[];
}

/**
 * 容器导出格式
 */
interface ContainerExport {
    version: string;
    timestamp: Date;
    containers: ContainerJSON[];
    relationships: ContainerRelationship[];
    metadata: Record<string, any>;
}

/**
 * 容器关系
 */
interface ContainerRelationship {
    parent: string;
    child: string;
    relationshipType: RelationshipType;
}

/**
 * 关系类型枚举
 */
enum RelationshipType {
    CONTAINS = 'contains',
    EXTENDS = 'extends',
    IMPLEMENTS = 'implements',
    DEPENDS_ON = 'depends_on'
}
```

### 1.6 页面适配器接口 (IPageAdapter)

```typescript
/**
 * 页面适配器接口
 */
interface IPageAdapter {
    // 适配器生命周期
    initialize(page: Page): Promise<void>;
    dispose(): Promise<void>;
    
    // 页面识别
    canHandle(url: string): Promise<boolean>;
    getPageType(): Promise<PageType>;
    
    // 容器获取
    getRootContainer(): Promise<IContainer>;
    getContainerByType(type: ContainerType): Promise<IContainer[]>;
    
    // 操作执行
    executeOperation(operationName: string, params?: any): Promise<OperationResult>;
    executeBatch(operations: OperationRequest[]): Promise<OperationResult[]>;
    
    // 页面交互
    navigateTo(url: string): Promise<void>;
    scrollTo(position: ScrollPosition): Promise<void>;
    waitForReady(): Promise<void>;
    
    // 状态检查
    isReady(): Promise<boolean>;
    isLoading(): Promise<boolean>;
    hasError(): Promise<boolean>;
}

/**
 * 页面类型枚举
 */
enum PageType {
    WEIBO_POST = 'weibo-post',
    WEIBO_PROFILE = 'weibo-profile',
    WEIBO_SEARCH = 'weibo-search',
    WEIBO_FEED = 'weibo-feed',
    GENERIC = 'generic',
    UNKNOWN = 'unknown'
}

/**
 * 滚动位置
 */
interface ScrollPosition {
    x: number;
    y: number;
    behavior?: ScrollBehavior;
}

/**
 * 滚动行为
 */
enum ScrollBehavior {
    AUTO = 'auto',
    SMOOTH = 'smooth',
    INSTANT = 'instant'
}
```

## 2. 基础实现类

### 2.1 基础容器类 (BaseContainer)

```typescript
/**
 * 基础容器类 - 提供容器的默认实现
 */
abstract class BaseContainer implements IContainer {
    public readonly id: string;
    public readonly name: string;
    public readonly description: string;
    public readonly type: ContainerType;
    public readonly selectors: string[];
    public readonly metadata: ContainerMetadata;
    
    public contentList: IContainer[] = [];
    public operations: Map<string, IOperation> = new Map();
    public parent?: IContainer;
    
    protected constructor(config: ContainerConfig) {
        this.id = config.id;
        this.name = config.name;
        this.description = config.description;
        this.type = config.type;
        this.selectors = config.selectors || [];
        this.metadata = config.metadata || {};
        
        this.initialize();
    }
    
    protected initialize(): void {
        // 子类可以重写此方法进行自定义初始化
    }
    
    public async executeOperation(name: string, context: IExecutionContext, params?: any): Promise<OperationResult> {
        const operation = this.operations.get(name);
        if (!operation) {
            throw new Error(`Operation '${name}' not found in container '${this.id}'`);
        }
        
        const validation = operation.validate(params);
        if (!validation.isValid) {
            throw new Error(`Operation validation failed: ${validation.errors.join(', ')}`);
        }
        
        return await operation.execute(context, params);
    }
    
    public findChild(id: string): IContainer | null {
        return this.contentList.find(child => child.id === id) || null;
    }
    
    public getChildrenByType(type: ContainerType): IContainer[] {
        return this.contentList.filter(child => child.type === type);
    }
    
    public addChild(child: IContainer): void {
        if (this.findChild(child.id)) {
            throw new Error(`Child container with id '${child.id}' already exists`);
        }
        child.parent = this;
        this.contentList.push(child);
    }
    
    public removeChild(id: string): boolean {
        const index = this.contentList.findIndex(child => child.id === id);
        if (index >= 0) {
            this.contentList[index].parent = undefined;
            this.contentList.splice(index, 1);
            return true;
        }
        return false;
    }
    
    public addOperation(operation: IOperation): void {
        if (this.operations.has(operation.name)) {
            throw new Error(`Operation '${operation.name}' already exists`);
        }
        this.operations.set(operation.name, operation);
    }
    
    public removeOperation(name: string): boolean {
        return this.operations.delete(name);
    }
    
    public getOperation(name: string): IOperation | null {
        return this.operations.get(name) || null;
    }
    
    public hasOperation(name: string): boolean {
        return this.operations.has(name);
    }
    
    public async matchesElement(element: Element): Promise<boolean> {
        // 默认实现：检查元素是否匹配任何选择器
        for (const selector of this.selectors) {
            if (await element.matches(selector)) {
                return true;
            }
        }
        return false;
    }
    
    public async findInContext(context: IExecutionContext): Promise<Element | null> {
        return await context.finder.findElement(this.selectors, context.element);
    }
    
    public validate(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!this.id) errors.push('Container id is required');
        if (!this.name) errors.push('Container name is required');
        if (!this.type) errors.push('Container type is required');
        if (this.selectors.length === 0) warnings.push('No selectors defined');
        
        // 验证子容器
        for (const child of this.contentList) {
            const childValidation = child.validate();
            errors.push(...childValidation.errors.map(err => `Child ${child.id}: ${err}`));
            warnings.push(...childValidation.warnings.map(warn => `Child ${child.id}: ${warn}`));
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    public toJSON(): ContainerJSON {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            type: this.type,
            selectors: this.selectors,
            contentList: this.contentList.map(child => child.id),
            operations: Array.from(this.operations.keys()),
            metadata: this.metadata,
            parent: this.parent?.id
        };
    }
    
    public fromJSON(json: ContainerJSON): void {
        // 基础属性在构造函数中设置
        this.metadata = json.metadata;
        // 子容器和操作需要在容器管理器中重建
    }
}

/**
 * 容器配置
 */
interface ContainerConfig {
    id: string;
    name: string;
    description: string;
    type: ContainerType;
    selectors?: string[];
    metadata?: ContainerMetadata;
}
```

### 2.2 基础操作类 (BaseOperation)

```typescript
/**
 * 基础操作类 - 提供操作的默认实现
 */
abstract class BaseOperation implements IOperation {
    public readonly name: string;
    public readonly description: string;
    public readonly category: OperationCategory;
    public readonly timeout: number;
    public readonly retryCount: number;
    public readonly parameters: OperationParameter[];
    public readonly preconditions: ValidationRule[];
    public readonly postconditions: ValidationRule[];
    public readonly metadata: OperationMetadata;
    
    protected constructor(config: OperationConfig) {
        this.name = config.name;
        this.description = config.description;
        this.category = config.category;
        this.timeout = config.timeout || 30000;
        this.retryCount = config.retryCount || 3;
        this.parameters = config.parameters || [];
        this.preconditions = config.preconditions || [];
        this.postconditions = config.postconditions || [];
        this.metadata = config.metadata || {};
    }
    
    public abstract execute(context: IExecutionContext, params: any): Promise<OperationResult>;
    
    public validate(params: any): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // 检查必需参数
        for (const param of this.parameters) {
            if (param.required && params[param.name] === undefined) {
                errors.push(`Required parameter '${param.name}' is missing`);
            }
        }
        
        // 验证参数类型
        for (const param of this.parameters) {
            const value = params[param.name];
            if (value !== undefined && !this.validateType(value, param.type)) {
                errors.push(`Parameter '${param.name}' should be of type ${param.type}`);
            }
        }
        
        // 应用验证规则
        for (const rule of this.preconditions) {
            try {
                if (!rule.validator(params)) {
                    errors.push(rule.errorMessage);
                }
            } catch (error) {
                errors.push(`Validation rule '${rule.name}' failed: ${error.message}`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    private validateType(value: any, type: ParameterType): boolean {
        switch (type) {
            case ParameterType.STRING:
                return typeof value === 'string';
            case ParameterType.NUMBER:
                return typeof value === 'number';
            case ParameterType.BOOLEAN:
                return typeof value === 'boolean';
            case ParameterType.ARRAY:
                return Array.isArray(value);
            case ParameterType.OBJECT:
                return typeof value === 'object' && !Array.isArray(value);
            case ParameterType.FUNCTION:
                return typeof value === 'function';
            case ParameterType.ANY:
                return true;
            default:
                return false;
        }
    }
    
    protected async executeWithRetry(
        operation: () => Promise<OperationResult>,
        context: IExecutionContext
    ): Promise<OperationResult> {
        const startTime = Date.now();
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt <= this.retryCount; attempt++) {
            try {
                const result = await this.executeWithTimeout(operation, this.timeout);
                
                // 验证后置条件
                for (const rule of this.postconditions) {
                    if (!rule.validator(result.data)) {
                        throw new Error(`Postcondition failed: ${rule.errorMessage}`);
                    }
                }
                
                result.executionTime = Date.now() - startTime;
                return result;
            } catch (error) {
                lastError = error;
                context.logger.warn(`Operation ${this.name} failed (attempt ${attempt + 1}): ${error.message}`);
                
                if (attempt < this.retryCount) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }
        
        return {
            success: false,
            error: lastError || new Error('Operation failed after all retries'),
            executionTime: Date.now() - startTime
        };
    }
    
    private async executeWithTimeout(
        operation: () => Promise<OperationResult>,
        timeout: number
    ): Promise<OperationResult> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeout}ms`));
            }, timeout);
            
            operation()
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }
}

/**
 * 操作配置
 */
interface OperationConfig {
    name: string;
    description: string;
    category: OperationCategory;
    timeout?: number;
    retryCount?: number;
    parameters?: OperationParameter[];
    preconditions?: ValidationRule[];
    postconditions?: ValidationRule[];
    metadata?: OperationMetadata;
}
```

## 3. 使用示例

### 3.1 创建自定义容器

```typescript
class WeiboPostContainer extends BaseContainer {
    constructor() {
        super({
            id: 'weibo-post',
            name: '微博帖子容器',
            description: '包含微博帖子的所有内容和操作',
            type: ContainerType.CONTENT_CONTAINER,
            selectors: ['article[class*="Feed_wrap_3v9LH"]'],
            metadata: {
                version: '1.0.0',
                author: 'Weibo System',
                tags: ['weibo', 'post', 'content']
            }
        });
        
        this.initializeOperations();
        this.initializeChildren();
    }
    
    private initializeOperations(): void {
        this.addOperation(new ExtractPostInfoOperation());
        this.addOperation(new LikePostOperation());
        this.addOperation(new ExtractMediaOperation());
        this.addOperation(new ScrollToCommentsOperation());
    }
    
    private initializeChildren(): void {
        this.addChild(new WeiboMediaContainer());
        this.addChild(new WeiboTextContainer());
        this.addChild(new WeiboCommentsContainer());
    }
}
```

### 3.2 创建自定义操作

```typescript
class ExtractPostInfoOperation extends BaseOperation {
    constructor() {
        super({
            name: 'extract-post-info',
            description: '提取微博帖子的基本信息',
            category: OperationCategory.EXTRACTION,
            timeout: 10000,
            parameters: [
                {
                    name: 'includeStats',
                    type: ParameterType.BOOLEAN,
                    description: '是否包含统计信息',
                    required: false,
                    defaultValue: false
                }
            ],
            metadata: {
                version: '1.0.0',
                examples: [
                    { params: {}, description: '提取基本信息' },
                    { params: { includeStats: true }, description: '提取包含统计的信息' }
                ]
            }
        });
    }
    
    public async execute(context: IExecutionContext, params: any): Promise<OperationResult> {
        const element = context.element;
        
        try {
            const title = await element.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
            const author = await element.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
            const time = await element.$eval('.head-info_time_6sFQg', el => el.textContent).catch(() => '');
            
            const result: any = { title, author, time };
            
            if (params.includeStats) {
                const stats = await element.$eval('.feed_action_3fFqM', el => el.textContent).catch(() => '');
                result.stats = stats;
            }
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }
}
```

### 3.3 使用容器系统

```typescript
// 创建容器管理器
const containerManager = new ContainerManager();

// 注册容器
const postContainer = new WeiboPostContainer();
containerManager.registerContainer(postContainer);

// 创建执行引擎
const engine = new OperationExecutionEngine(containerManager);

// 执行操作
const result = await engine.execute('weibo-post', 'extract-post-info', {
    includeStats: true
});

if (result.success) {
    console.log('提取结果:', result.data);
} else {
    console.error('提取失败:', result.error);
}
```

这些核心接口设计提供了一个完整的浏览器操作系统框架，支持容器化操作、精确控制和灵活扩展。请您审阅这个设计并提供反馈。