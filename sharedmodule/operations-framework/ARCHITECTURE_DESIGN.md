# WebAuto Universal Operator Framework 架构设计

## 1. 通用操作子架构图

```
┌─────────────────────────────────────────────────────────────┐
│                 Universal Operator Framework                   │
├─────────────────────────────────────────────────────────────┤
│                    Framework Core                            │
│  ├── OperatorRegistry (操作子注册中心)                        │
│  ├── OperatorLoader (动态加载器)                              │
│  ├── WorkflowEngine (工作流引擎)                              │
│  ├── StateManager (状态管理器)                                │
│  └── ConfigManager (配置管理器)                              │
├─────────────────────────────────────────────────────────────┤
│                 Operator Libraries                           │
│  ├── Page-based Operators (页面操作子库)                      │
│  │   ├── NavigationOperator (导航操作子)                       │
│  │   ├── ElementOperator (元素操作子)                         │
│  │   └── FormOperator (表单操作子)                           │
│  ├── Non-page Operators (非页面操作子库)                      │
│  │   ├── FileOperator (文件操作子)                            │
│  │   ├── CookieOperator (Cookie操作子)                        │
│  │   ├── DataOperator (数据操作子)                            │
│  │   └── SystemOperator (系统操作子)                          │
│  └── Business Operators (业务操作子库)                        │
│      ├── WeiboOperator (微博操作子)                           │
│      ├── EcommerceOperator (电商操作子)                       │
│      └── SocialOperator (社交操作子)                          │
├─────────────────────────────────────────────────────────────┤
│                Workflow Orchestration                        │
│  ├── Visual Workflow Designer (可视化设计器)                  │
│  ├── Workflow Executor (执行器)                              │
│  ├── Control Flow Engine (控制流引擎)                         │
│  └── Condition Processor (条件处理器)                         │
├─────────────────────────────────────────────────────────────┤
│                 No-Code Composition                           │
│  ├── Operator Composer (操作子组合器)                        │
│  ├── Template System (模板系统)                              │
│  ├── Rule Engine (规则引擎)                                  │
│  └── Event System (事件系统)                                 │
└─────────────────────────────────────────────────────────────┘
```

## 2. 通用操作子抽象设计

### 2.1 UniversalOperator 基础抽象

```typescript
import { RCCBaseModule } from 'rcc-basemodule';

export abstract class UniversalOperator extends RCCBaseModule {
  // 基础属性
  protected _id: string;
  protected _name: string;
  protected _type: OperatorType;
  protected _category: OperatorCategory;
  protected _version: string;
  protected _library: string;

  // 操作子特征
  protected _capabilities: Set<string> = new Set();
  protected _parameters: Map<string, ParameterDefinition> = new Map();
  protected _outputs: Map<string, OutputDefinition> = new Map();
  protected _dependencies: string[] = [];

  // 状态管理
  protected _state: OperatorState = OperatorState.IDLE;
  protected _context: Map<string, any> = new Map();
  protected _metadata: Map<string, any> = new Map();

  // 生命周期
  protected _lifecycle: OperatorLifecycle;

  constructor(config: UniversalOperatorConfig) {
    super();
    this._id = config.id || generateOperatorId();
    this._name = config.name;
    this._type = config.type;
    this._category = config.category;
    this._version = config.version || '1.0.0';
    this._library = config.library;
    this._lifecycle = new OperatorLifecycle();

    this.initializeOperator();
  }

  // 核心抽象方法 - 所有操作子必须实现
  abstract execute(params: Record<string, any>): Promise<OperationResult>;
  abstract validate(params: Record<string, any>): ValidationResult;
  abstract getCapabilities(): Promise<string[]>;
  abstract getMetadata(): Promise<OperatorMetadata>;

  // 生命周期方法
  abstract onInitialize(): Promise<void>;
  abstract onStart(): Promise<void>;
  abstract onStop(): Promise<void>;
  abstract onError(error: Error): Promise<void>;

  // 可选实现的方法
  async onParameterChange(paramName: string, value: any): Promise<void> {
    // 参数变化时的处理
  }

  async onStateChange(oldState: OperatorState, newState: OperatorState): Promise<void> {
    // 状态变化时的处理
  }

  async onContextUpdate(key: string, value: any): Promise<void> {
    // 上下文更新时的处理
  }

  // 通用操作方法
  async connect(targetOperator: UniversalOperator, connectionConfig: ConnectionConfig): Promise<void> {
    // 连接到其他操作子
    this.log(`连接到操作子: ${targetOperator.name}`);
  }

  async disconnect(targetOperator: UniversalOperator): Promise<void> {
    // 断开连接
  }

  async getState(): Promise<OperatorState> {
    return this._state;
  }

  async setState(state: OperatorState): Promise<void> {
    const oldState = this._state;
    this._state = state;
    await this.onStateChange(oldState, state);
  }

  // 上下文管理
  setContext(key: string, value: any): void {
    this._context.set(key, value);
    this.onContextUpdate(key, value);
  }

  getContext(key: string): any {
    return this._context.get(key);
  }

  hasContext(key: string): boolean {
    return this._context.has(key);
  }

  // 元数据管理
  setMetadata(key: string, value: any): void {
    this._metadata.set(key, value);
  }

  getMetadata(key: string): any {
    return this._metadata.get(key);
  }

  // 初始化
  private async initializeOperator(): Promise<void> {
    try {
      await this.defineParameters();
      await this.defineOutputs();
      await this.defineCapabilities();
      await this.onInitialize();
      this.log(`操作子初始化完成: ${this._name}`);
    } catch (error) {
      this.log(`操作子初始化失败: ${error.message}`, 'error');
      throw error;
    }
  }

  // 子类实现这些方法来定义操作子特性
  protected abstract defineParameters(): Promise<void>;
  protected abstract defineOutputs(): Promise<void>;
  protected abstract defineCapabilities(): Promise<void>;
}

// 操作子类型枚举
export enum OperatorType {
  PAGE_BASED = 'page-based',
  NON_PAGE = 'non-page',
  BUSINESS = 'business',
  UTILITY = 'utility',
  CONTROL = 'control'
}

// 操作子类别枚举
export enum OperatorCategory {
  NAVIGATION = 'navigation',
  ELEMENT = 'element',
  FILE = 'file',
  DATA = 'data',
  SYSTEM = 'system',
  COMMUNICATION = 'communication',
  LOGIC = 'logic'
}

// 操作子状态枚举
export enum OperatorState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  STOPPED = 'stopped'
}
```

### 2.2 页面操作子基类

```typescript
export abstract class PageBasedOperator extends UniversalOperator {
  protected browser!: any;
  protected page!: any;
  protected context!: any;

  constructor(config: PageOperatorConfig) {
    super({
      ...config,
      type: OperatorType.PAGE_BASED,
      category: OperatorCategory.NAVIGATION
    });
  }

  async onInitialize(): Promise<void> {
    await this.initializeBrowser();
  }

  async execute(params: Record<string, any>): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      await this.setState(OperatorState.RUNNING);

      // 页面操作子的特殊逻辑
      await this.ensurePageReady();
      const result = await this.performPageOperation(params);

      await this.setState(OperatorState.COMPLETED);
      return this.createSuccessResult(result, startTime);

    } catch (error) {
      await this.setState(OperatorState.ERROR);
      return this.createErrorResult(error, startTime);
    }
  }

  protected abstract performPageOperation(params: Record<string, any>): Promise<any>;

  private async ensurePageReady(): Promise<void> {
    if (!this.page || !this.browser) {
      throw new Error('浏览器实例未初始化');
    }

    // 等待页面准备就绪
    await this.page.waitForLoadState('domcontentloaded');
  }

  private async initializeBrowser(): Promise<void> {
    // 从父类继承的浏览器初始化逻辑
    if (!this.browser) {
      this.browser = await this.createBrowserInstance();
    }

    if (!this.page) {
      this.page = await this.browser.newPage();
    }
  }
}
```

### 2.3 非页面操作子基类

```typescript
export abstract class NonPageOperator extends UniversalOperator {
  constructor(config: NonPageOperatorConfig) {
    super({
      ...config,
      type: OperatorType.NON_PAGE
    });
  }

  async onInitialize(): Promise<void> {
    // 非页面操作子的初始化逻辑
    await this.initializeResources();
  }

  async execute(params: Record<string, any>): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      await this.setState(OperatorState.RUNNING);

      // 非页面操作子的特殊逻辑
      const result = await this.performNonPageOperation(params);

      await this.setState(OperatorState.COMPLETED);
      return this.createSuccessResult(result, startTime);

    } catch (error) {
      await this.setState(OperatorState.ERROR);
      return this.createErrorResult(error, startTime);
    }
  }

  protected abstract performNonPageOperation(params: Record<string, any>): Promise<any>;

  protected abstract initializeResources(): Promise<void>;
}
```

## 3. 动态操作子加载系统

### 3.1 OperatorLoader 动态加载器

```typescript
export class OperatorLoader {
  private static instance: OperatorLoader;
  private loadedLibraries: Map<string, OperatorLibrary> = new Map();
  private operatorCache: Map<string, UniversalOperator> = new Map();

  static getInstance(): OperatorLoader {
    if (!OperatorLoader.instance) {
      OperatorLoader.instance = new OperatorLoader();
    }
    return OperatorLoader.instance;
  }

  async loadLibrary(libraryPath: string): Promise<OperatorLibrary> {
    if (this.loadedLibraries.has(libraryPath)) {
      return this.loadedLibraries.get(libraryPath)!;
    }

    try {
      // 动态加载操作子库
      const library = await this.importOperatorLibrary(libraryPath);
      this.loadedLibraries.set(libraryPath, library);

      console.log(`[OperatorLoader] 成功加载操作子库: ${libraryPath}`);
      return library;

    } catch (error) {
      console.error(`[OperatorLoader] 加载操作子库失败: ${error.message}`);
      throw error;
    }
  }

  async createOperator(
    libraryPath: string,
    operatorType: string,
    config: UniversalOperatorConfig
  ): Promise<UniversalOperator> {
    const cacheKey = `${libraryPath}:${operatorType}:${config.id}`;

    if (this.operatorCache.has(cacheKey)) {
      return this.operatorCache.get(cacheKey)!;
    }

    const library = await this.loadLibrary(libraryPath);
    const OperatorClass = library.getOperator(operatorType);

    if (!OperatorClass) {
      throw new Error(`未找到操作子类型: ${operatorType}`);
    }

    const operator = new OperatorClass(config);
    this.operatorCache.set(cacheKey, operator);

    return operator;
  }

  private async importOperatorLibrary(libraryPath: string): Promise<OperatorLibrary> {
    // 支持多种加载方式
    if (libraryPath.endsWith('.js')) {
      return this.loadJavaScriptLibrary(libraryPath);
    } else if (libraryPath.endsWith('.ts')) {
      return this.loadTypeScriptLibrary(libraryPath);
    } else {
      return this.loadNpmPackage(libraryPath);
    }
  }

  private async loadJavaScriptLibrary(path: string): Promise<OperatorLibrary> {
    // 动态导入JavaScript库
    const module = await import(path);
    return new OperatorLibrary(module.default || module);
  }

  private async loadTypeScriptLibrary(path: string): Promise<OperatorLibrary> {
    // 编译并加载TypeScript库
    const compiledPath = await this.compileTypeScript(path);
    return this.loadJavaScriptLibrary(compiledPath);
  }

  private async loadNpmPackage(packageName: string): Promise<OperatorLibrary> {
    // 加载npm包
    const module = await import(packageName);
    return new OperatorLibrary(module.default || module);
  }
}

// 操作子库定义
export class OperatorLibrary {
  private operators: Map<string, typeof UniversalOperator> = new Map();
  private metadata: LibraryMetadata;

  constructor(module: any) {
    this.extractOperators(module);
    this.metadata = this.extractMetadata(module);
  }

  getOperator(type: string): typeof UniversalOperator | undefined {
    return this.operators.get(type);
  }

  getAllOperators(): Map<string, typeof UniversalOperator> {
    return new Map(this.operators);
  }

  getMetadata(): LibraryMetadata {
    return this.metadata;
  }

  private extractOperators(module: any): void {
    // 从模块中提取操作子类
    Object.values(module).forEach((exported: any) => {
      if (this.isOperatorClass(exported)) {
        this.operators.set(exported.name, exported);
      }
    });
  }

  private isOperatorClass(obj: any): boolean {
    return obj &&
           obj.prototype instanceof UniversalOperator &&
           typeof obj.name === 'string';
  }

  private extractMetadata(module: any): LibraryMetadata {
    // 提取库的元数据
    return {
      name: module.name || 'Unknown',
      version: module.version || '1.0.0',
      description: module.description || '',
      author: module.author || '',
      operators: Array.from(this.operators.keys())
    };
  }
}
```

## 4. 工作流编排系统

### 4.1 WorkflowEngine 工作流引擎

```typescript
export class WorkflowEngine {
  private operators: Map<string, UniversalOperator> = new Map();
  private executionContext: WorkflowExecutionContext;
  private controlFlowManager: ControlFlowManager;
  private stateManager: StateManager;

  constructor(config: WorkflowEngineConfig) {
    this.executionContext = new WorkflowExecutionContext();
    this.controlFlowManager = new ControlFlowManager();
    this.stateManager = new StateManager();
  }

  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const startTime = Date.now();

    try {
      console.log(`[WorkflowEngine] 开始执行工作流: ${workflow.name}`);

      // 初始化工作流
      await this.initializeWorkflow(workflow);

      // 执行工作流
      const result = await this.executeWorkflowSteps(workflow);

      return {
        success: true,
        workflowId: workflow.id,
        result,
        metadata: {
          name: workflow.name,
          duration: Date.now() - startTime,
          stepsExecuted: this.executionContext.executedSteps,
          operatorsUsed: this.executionContext.operatorsUsed
        }
      };

    } catch (error) {
      console.error(`[WorkflowEngine] 工作流执行失败: ${error.message}`);
      return {
        success: false,
        workflowId: workflow.id,
        error: error.message,
        metadata: {
          name: workflow.name,
          duration: Date.now() - startTime,
          failedAt: this.executionContext.currentStep
        }
      };
    }
  }

  private async initializeWorkflow(workflow: WorkflowDefinition): Promise<void> {
    // 初始化操作子
    for (const stepConfig of workflow.steps) {
      const operator = await this.createOperator(stepConfig.operator);
      this.operators.set(stepConfig.id, operator);
    }

    // 初始化执行上下文
    this.executionContext.initialize(workflow);

    // 初始化状态管理器
    this.stateManager.initialize(workflow.initialState);
  }

  private async executeWorkflowSteps(workflow: WorkflowDefinition): Promise<any> {
    let currentStepIndex = 0;
    const maxSteps = workflow.steps.length * 10; // 防止无限循环

    while (currentStepIndex < maxSteps) {
      const stepConfig = this.controlFlowManager.getNextStep(workflow, currentStepIndex);

      if (!stepConfig) {
        break; // 工作流完成
      }

      const operator = this.operators.get(stepConfig.id);
      if (!operator) {
        throw new Error(`未找到操作子: ${stepConfig.id}`);
      }

      // 执行操作子
      const result = await this.executeStep(operator, stepConfig);

      // 更新执行上下文
      this.executionContext.recordStepExecution(stepConfig, result);

      // 检查条件跳转
      const nextStep = await this.controlFlowManager.evaluateNextStep(
        workflow,
        currentStepIndex,
        result
      );

      if (nextStep.jump) {
        currentStepIndex = nextStep.targetIndex;
      } else {
        currentStepIndex++;
      }
    }

    return this.executionContext.getFinalResult();
  }

  private async executeStep(
    operator: UniversalOperator,
    stepConfig: WorkflowStep
  ): Promise<OperationResult> {
    console.log(`[WorkflowEngine] 执行步骤: ${stepConfig.name}`);

    // 准备参数
    const params = await this.prepareParameters(stepConfig.parameters);

    // 执行操作子
    const result = await operator.execute(params);

    // 更新状态
    if (result.success) {
      this.stateManager.updateState(stepConfig.id, result.data);
    }

    return result;
  }

  private async prepareParameters(parameters: Record<string, any>): Promise<Record<string, any>> {
    const resolvedParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(parameters)) {
      resolvedParams[key] = await this.resolveParameterValue(value);
    }

    return resolvedParams;
  }

  private async resolveParameterValue(value: any): Promise<any> {
    if (typeof value === 'string' && value.startsWith('${')) {
      // 引用工作流上下文中的值
      const contextKey = value.slice(2, -1);
      return this.stateManager.getState(contextKey);
    }

    return value;
  }

  private async createOperator(operatorConfig: OperatorConfig): Promise<UniversalOperator> {
    const loader = OperatorLoader.getInstance();
    return loader.createOperator(
      operatorConfig.library,
      operatorConfig.type,
      operatorConfig
    );
  }
}
```

### 4.2 ControlFlowManager 控制流管理器

```typescript
export class ControlFlowManager {
  async getNextStep(
    workflow: WorkflowDefinition,
    currentIndex: number
  ): Promise<WorkflowStep | null> {
    if (currentIndex >= workflow.steps.length) {
      return null;
    }

    return workflow.steps[currentIndex];
  }

  async evaluateNextStep(
    workflow: WorkflowDefinition,
    currentIndex: number,
    lastResult: OperationResult
  ): Promise<{ jump: boolean; targetIndex: number }> {
    const currentStep = workflow.steps[currentIndex];

    // 检查条件跳转
    if (currentStep.conditions) {
      for (const condition of currentStep.conditions) {
        const shouldJump = await this.evaluateCondition(condition, lastResult);

        if (shouldJump) {
          const targetIndex = this.findStepIndex(workflow, condition.targetStep);
          if (targetIndex !== -1) {
            return { jump: true, targetIndex };
          }
        }
      }
    }

    // 检查循环跳转
    if (currentStep.loop) {
      const shouldLoop = await this.evaluateLoopCondition(currentStep.loop, lastResult);
      if (shouldLoop) {
        return { jump: true, targetIndex: currentIndex };
      }
    }

    // 默认顺序执行
    return { jump: false, targetIndex: currentIndex + 1 };
  }

  private async evaluateCondition(
    condition: ConditionConfig,
    lastResult: OperationResult
  ): Promise<boolean> {
    // 评估条件表达式
    switch (condition.type) {
      case 'success':
        return lastResult.success;

      case 'failure':
        return !lastResult.success;

      case 'result_equals':
        return lastResult.data === condition.value;

      case 'result_contains':
        return String(lastResult.data).includes(condition.value);

      case 'custom':
        // 执行自定义条件函数
        return await this.executeCustomCondition(condition.function, lastResult);

      default:
        return false;
    }
  }

  private async evaluateLoopCondition(
    loopConfig: LoopConfig,
    lastResult: OperationResult
  ): Promise<boolean> {
    // 评估循环条件
    if (loopConfig.maxIterations && loopConfig.currentIteration >= loopConfig.maxIterations) {
      return false;
    }

    if (loopConfig.condition) {
      return await this.evaluateCondition(loopConfig.condition, lastResult);
    }

    return false;
  }

  private findStepIndex(workflow: WorkflowDefinition, stepId: string): number {
    return workflow.steps.findIndex(step => step.id === stepId);
  }

  private async executeCustomCondition(
    conditionFunction: string,
    lastResult: OperationResult
  ): Promise<boolean> {
    // 执行自定义条件函数
    // 这里可以实现动态函数执行
    return false;
  }
}
```

## 5. No-Code 操作子组合系统

### 5.1 OperatorComposer 操作子组合器

```typescript
export class OperatorComposer {
  private templates: Map<string, OperatorTemplate> = new Map();
  private compositions: Map<string, OperatorComposition> = new Map();

  constructor() {
    this.initializeBuiltInTemplates();
  }

  // 创建操作子组合
  async createComposition(config: CompositionConfig): Promise<OperatorComposition> {
    const composition = new OperatorComposition(config);
    await composition.initialize();

    this.compositions.set(config.id, composition);
    return composition;
  }

  // 从模板创建组合
  async createFromTemplate(templateId: string, params: Record<string, any>): Promise<OperatorComposition> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`未找到模板: ${templateId}`);
    }

    return template.createComposition(params);
  }

  // 保存组合为模板
  async saveAsTemplate(composition: OperatorComposition, templateId: string): Promise<void> {
    const template = await OperatorTemplate.fromComposition(composition, templateId);
    this.templates.set(templateId, template);
  }

  private initializeBuiltInTemplates(): void {
    // 初始化内置模板
    this.templates.set('web-scraping', new WebScrapingTemplate());
    this.templates.set('data-processing', new DataProcessingTemplate());
    this.templates.set('file-operations', new FileOperationsTemplate());
  }
}

// 操作子组合
export class OperatorComposition {
  private config: CompositionConfig;
  private operators: Map<string, UniversalOperator> = new Map();
  private connections: Connection[] = [];
  private workflow: WorkflowDefinition;

  constructor(config: CompositionConfig) {
    this.config = config;
    this.workflow = this.createWorkflowDefinition();
  }

  async initialize(): Promise<void> {
    // 初始化所有操作子
    for (const operatorConfig of this.config.operators) {
      const operator = await this.createOperator(operatorConfig);
      this.operators.set(operatorConfig.id, operator);
    }

    // 建立连接
    await this.establishConnections();
  }

  async execute(): Promise<CompositionResult> {
    const engine = new WorkflowEngine({});
    return engine.executeWorkflow(this.workflow);
  }

  async addOperator(operatorConfig: OperatorConfig): Promise<void> {
    const operator = await this.createOperator(operatorConfig);
    this.operators.set(operatorConfig.id, operator);
    this.config.operators.push(operatorConfig);
    this.updateWorkflowDefinition();
  }

  async removeOperator(operatorId: string): Promise<void> {
    this.operators.delete(operatorId);
    this.config.operators = this.config.operators.filter(op => op.id !== operatorId);
    this.connections = this.connections.filter(conn =>
      conn.from !== operatorId && conn.to !== operatorId
    );
    this.updateWorkflowDefinition();
  }

  async addConnection(connection: ConnectionConfig): Promise<void> {
    const fromOperator = this.operators.get(connection.from);
    const toOperator = this.operators.get(connection.to);

    if (!fromOperator || !toOperator) {
      throw new Error('连接的操作子不存在');
    }

    // 建立操作子之间的连接
    await fromOperator.connect(toOperator, connection.config);

    this.connections.push({
      from: connection.from,
      to: connection.to,
      config: connection.config
    });

    this.updateWorkflowDefinition();
  }

  private async createOperator(operatorConfig: OperatorConfig): Promise<UniversalOperator> {
    const loader = OperatorLoader.getInstance();
    return loader.createOperator(
      operatorConfig.library,
      operatorConfig.type,
      operatorConfig
    );
  }

  private async establishConnections(): Promise<void> {
    for (const connection of this.connections) {
      const fromOperator = this.operators.get(connection.from);
      const toOperator = this.operators.get(connection.to);

      if (fromOperator && toOperator) {
        await fromOperator.connect(toOperator, connection.config);
      }
    }
  }

  private createWorkflowDefinition(): WorkflowDefinition {
    return {
      id: this.config.id,
      name: this.config.name,
      description: this.config.description,
      initialState: {},
      steps: this.config.operators.map(op => ({
        id: op.id,
        name: op.name,
        operator: op,
        parameters: op.parameters || {}
      }))
    };
  }

  private updateWorkflowDefinition(): void {
    this.workflow = this.createWorkflowDefinition();
  }
}
```

## 6. 可视化工作流设计器

### 6.1 VisualWorkflowDesigner 可视化设计器

```typescript
export class VisualWorkflowDesigner {
  private canvas: WorkflowCanvas;
  private palette: OperatorPalette;
  private propertyEditor: PropertyEditor;
  private workflowExporter: WorkflowExporter;

  constructor(container: HTMLElement) {
    this.canvas = new WorkflowCanvas(container);
    this.palette = new OperatorPalette();
    this.propertyEditor = new PropertyEditor();
    this.workflowExporter = new WorkflowExporter();

    this.initializeEventHandlers();
  }

  // 从可视化设计创建工作流
  async createWorkflowFromVisual(): Promise<WorkflowDefinition> {
    const visualElements = this.canvas.getVisualElements();
    const connections = this.canvas.getConnections();

    const steps: WorkflowStep[] = [];
    const operators: OperatorConfig[] = [];

    // 转换视觉元素为工作流步骤
    for (const element of visualElements) {
      if (element.type === 'operator') {
        const operatorConfig = this.createOperatorConfig(element);
        operators.push(operatorConfig);

        steps.push({
          id: element.id,
          name: element.name,
          operator: operatorConfig,
          parameters: element.parameters || {}
        });
      }
    }

    // 创建工作流定义
    const workflow: WorkflowDefinition = {
      id: generateWorkflowId(),
      name: 'Visual Workflow',
      description: 'Created from visual designer',
      initialState: {},
      steps
    };

    return workflow;
  }

  // 导出工作流为不同格式
  async exportWorkflow(format: ExportFormat): Promise<string> {
    const workflow = await this.createWorkflowFromVisual();
    return this.workflowExporter.export(workflow, format);
  }

  // 导入工作流
  async importWorkflow(workflowData: string, format: ExportFormat): Promise<void> {
    const workflow = await this.workflowExporter.import(workflowData, format);
    this.renderWorkflowToCanvas(workflow);
  }

  private renderWorkflowToCanvas(workflow: WorkflowDefinition): void {
    // 将工作流渲染到画布
    this.canvas.clear();

    for (const step of workflow.steps) {
      this.canvas.addOperatorElement(step);
    }

    // 添加连接线等视觉元素
    this.canvas.renderConnections();
  }

  private initializeEventHandlers(): void {
    this.canvas.on('operatorAdded', (element) => {
      this.propertyEditor.showProperties(element);
    });

    this.canvas.on('connectionCreated', (connection) => {
      this.handleConnectionCreation(connection);
    });
  }

  private handleConnectionCreation(connection: ConnectionConfig): void {
    // 处理连接创建逻辑
    console.log('创建连接:', connection);
  }

  private createOperatorConfig(element: VisualElement): OperatorConfig {
    return {
      id: element.id,
      name: element.name,
      type: element.operatorType,
      library: element.library,
      parameters: element.parameters || {}
    };
  }
}
```

## 7. 工作流定义和配置

### 7.1 WorkflowDefinition 工作流定义

```typescript
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  initialState: Record<string, any>;
  steps: WorkflowStep[];
  globalParameters: Record<string, ParameterDefinition>;
  errorHandling: ErrorHandlingConfig;
  metadata: WorkflowMetadata;
}

export interface WorkflowStep {
  id: string;
  name: string;
  operator: OperatorConfig;
  parameters: Record<string, any>;
  conditions?: ConditionConfig[];
  loop?: LoopConfig;
  onError?: ErrorHandlerConfig;
  timeout?: number;
  retryPolicy?: RetryPolicyConfig;
}

export interface ConditionConfig {
  type: 'success' | 'failure' | 'result_equals' | 'result_contains' | 'custom';
  value?: any;
  targetStep: string;
  function?: string;
}

export interface LoopConfig {
  maxIterations?: number;
  condition?: ConditionConfig;
  currentIteration?: number;
}

export interface OperatorConfig {
  id: string;
  name: string;
  type: string;
  library: string;
  parameters: Record<string, any>;
  metadata?: Record<string, any>;
}

// 导出格式
export type ExportFormat = 'json' | 'yaml' | 'xml' | 'visual';

// 工作流结果
export interface WorkflowResult {
  success: boolean;
  workflowId: string;
  result?: any;
  error?: string;
  metadata: WorkflowExecutionMetadata;
}

export interface WorkflowExecutionMetadata {
  name: string;
  duration: number;
  stepsExecuted: number;
  operatorsUsed: string[];
  failedAt?: string;
  startTime: number;
  endTime: number;
}
```

## 8. 完整的使用示例

### 8.1 动态加载和执行工作流

```typescript
import { WorkflowEngine, OperatorLoader } from './framework';

async function main() {
  // 1. 创建工作流引擎
  const engine = new WorkflowEngine({
    enableLogging: true,
    enableMonitoring: true
  });

  // 2. 定义工作流
  const workflow = {
    id: 'weibo-comment-extraction',
    name: '微博评论提取',
    description: '从微博帖子中提取评论',
    version: '1.0.0',
    initialState: {
      targetUrl: 'https://weibo.com/123456',
      maxComments: 50
    },
    steps: [
      {
        id: 'navigate',
        name: '导航到微博页面',
        operator: {
          id: 'nav-op',
          name: '导航操作子',
          type: 'NavigationOperator',
          library: '@webauto/browser-operators',
          parameters: {
            url: '${targetUrl}'
          }
        },
        parameters: {
          url: '${targetUrl}'
        }
      },
      {
        id: 'load-cookies',
        name: '加载Cookie',
        operator: {
          id: 'cookie-op',
          name: 'Cookie操作子',
          type: 'CookieOperator',
          library: '@webauto/utility-operators',
          parameters: {
            action: 'load',
            path: './cookies/weibo.json'
          }
        },
        parameters: {
          action: 'load',
          path: './cookies/weibo.json'
        }
      },
      {
        id: 'extract-comments',
        name: '提取评论',
        operator: {
          id: 'comment-op',
          name: '评论提取操作子',
          type: 'CommentOperator',
          library: '@webauto/weibo-operators',
          parameters: {
            maxComments: '${maxComments}'
          }
        },
        parameters: {
          maxComments: '${maxComments}'
        },
        conditions: [
          {
            type: 'success',
            targetStep: 'save-results'
          },
          {
            type: 'failure',
            targetStep: 'error-handler'
          }
        ]
      },
      {
        id: 'save-results',
        name: '保存结果',
        operator: {
          id: 'file-op',
          name: '文件操作子',
          type: 'FileOperator',
          library: '@webauto/utility-operators',
          parameters: {
            action: 'save',
            path: './results/comments.json',
            data: '${extract-comments}'
          }
        },
        parameters: {
          action: 'save',
          path: './results/comments.json',
          data: '${extract-comments}'
        }
      },
      {
        id: 'error-handler',
        name: '错误处理',
        operator: {
          id: 'log-op',
          name: '日志操作子',
          type: 'LogOperator',
          library: '@webauto/utility-operators',
          parameters: {
            message: '评论提取失败',
            level: 'error'
          }
        },
        parameters: {
          message: '评论提取失败',
          level: 'error'
        }
      }
    ],
    globalParameters: {
      targetUrl: {
        type: 'string',
        required: true,
        description: '目标微博URL'
      },
      maxComments: {
        type: 'number',
        required: false,
        default: 50,
        description: '最大评论数量'
      }
    },
    errorHandling: {
      strategy: 'continue',
      maxRetries: 3,
      retryDelay: 1000
    },
    metadata: {
      author: 'WebAuto Team',
      created: new Date().toISOString(),
      tags: ['weibo', 'comments', 'extraction']
    }
  };

  // 3. 执行工作流
  const result = await engine.executeWorkflow(workflow);

  if (result.success) {
    console.log('工作流执行成功:', result.result);
  } else {
    console.error('工作流执行失败:', result.error);
  }
}

main().catch(console.error);
```

### 8.2 No-Code 操作子组合

```typescript
import { OperatorComposer } from './framework';

async function noCodeExample() {
  // 1. 创建操作子组合器
  const composer = new OperatorComposer();

  // 2. 从模板创建组合
  const webScrapingComposition = await composer.createFromTemplate('web-scraping', {
    targetUrl: 'https://example.com',
    outputFormat: 'json'
  });

  // 3. 添加自定义操作子
  await webScrapingComposition.addOperator({
    id: 'data-processor',
    name: '数据处理器',
    type: 'DataProcessor',
    library: '@webauto/data-operators',
    parameters: {
      processData: true,
      format: 'structured'
    }
  });

  // 4. 建立连接
  await webScrapingComposition.addConnection({
    from: 'web-scraper',
    to: 'data-processor',
    config: {
      dataMapping: {
        'scrapedData': 'inputData'
      }
    }
  });

  // 5. 保存为模板
  await composer.saveAsTemplate(webScrapingComposition, 'custom-web-scraper');

  // 6. 执行组合
  const result = await webScrapingComposition.execute();

  console.log('组合执行结果:', result);
}
```

## 9. 系统架构优势

### 9.1 完全模块化
- **框架与实现分离**: 框架只提供核心功能，具体操作子动态加载
- **库化设计**: 操作子按功能库组织，便于维护和扩展
- **插件化架构**: 支持第三方操作子库

### 9.2 高度可扩展
- **动态加载**: 支持运行时加载新的操作子库
- **无限嵌套**: 操作子可以无限嵌套组合
- **模板系统**: 支持操作子组合模板

### 9.3 No-Code 开发
- **可视化设计**: 提供可视化工作流设计器
- **拖拽组合**: 支持拖拽方式组合操作子
- **配置驱动**: 通过配置文件定义工作流

### 9.4 强大的控制流
- **条件跳转**: 支持基于条件的跳转逻辑
- **循环执行**: 支持循环执行操作子
- **状态管理**: 完整的状态管理系统
- **错误处理**: 完善的错误处理机制

### 9.5 生产就绪
- **监控和日志**: 完整的监控和日志系统
- **性能优化**: 支持并行执行和性能优化
- **部署支持**: 支持多种部署方式

这个重新设计的架构完全满足你的需求：
- ✅ 页面和非页面操作子统一抽象
- ✅ 无限嵌套和组合能力
- ✅ 框架与实现分离
- ✅ 动态加载操作子库
- ✅ 支持跳转、条件、状态判断
- ✅ No-Code 方式组合操作子
- ✅ 完整的工作流编排系统

## 2. 核心接口定义

### 2.1 IOperator 接口

```typescript
export interface IOperator {
  // 基础属性
  id: string;
  selector: string;
  type: string;
  parent?: IOperator;
  children: IOperator[];

  // 核心方法
  observe(): Promise<PageTree>;
  list(): Promise<IOperator[]>;
  capabilities(): Promise<string[]>;
  operate(action: string, params: any): Promise<OperationResult>;
  status(): Promise<OperatorStatus>;
  connect(target: IOperator, data: any): Promise<void>;

  // 上下文管理
  setContext(key: string, value: any): void;
  getContext(key: string): any;
  hasContext(key: string): boolean;
}
```

### 2.2 PageTree 结构

```typescript
export interface PageTree {
  root: ElementNode;
  operators: OperatorMatch[];
  metadata: {
    url: string;
    timestamp: number;
    title: string;
  };
}

export interface ElementNode {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  children: ElementNode[];
  selector: string;
  isVisible: boolean;
}

export interface OperatorMatch {
  operatorId: string;
  element: ElementNode;
  confidence: number;
  selector: string;
}
```

### 2.3 操作结果结构

```typescript
export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata: {
    operation: string;
    operatorId: string;
    duration: number;
    timestamp: number;
  };
  context?: Map<string, any>;
}
```

## 3. 操作子类型体系

### 3.1 BaseOperator 抽象基类

```typescript
import { RCCBaseModule } from 'rcc-basemodule';

export abstract class BaseOperator extends RCCBaseModule implements IOperator {
  protected _id: string;
  protected _selector: string;
  protected _type: string;
  protected _children: IOperator[] = [];
  protected _parent?: IOperator;
  protected _capabilities: Set<string> = new Set();
  protected _context: Map<string, any> = new Map();
  protected _state: OperatorState = OperatorState.IDLE;

  // 浏览器实例（从RCCBaseModule继承）
  protected browser!: any;
  protected page!: any;

  constructor(config: OperatorConfig) {
    super();
    this._id = config.id || generateOperatorId();
    this._selector = config.selector;
    this._type = config.type;
    this.initializeCapabilities();
  }

  // 抽象方法 - 子类必须实现
  abstract observe(): Promise<PageTree>;
  abstract operate(action: string, params: any): Promise<OperationResult>;

  // 可重写的方法
  async list(): Promise<IOperator[]> {
    return this._children;
  }

  async capabilities(): Promise<string[]> {
    return Array.from(this._capabilities);
  }

  async status(): Promise<OperatorStatus> {
    return {
      id: this._id,
      state: this._state,
      capabilities: Array.from(this._capabilities),
      childrenCount: this._children.length,
      lastActivity: Date.now()
    };
  }

  async connect(target: IOperator, data: any): Promise<void> {
    // 建立操作子连接，传递数据和上下文
    this.logConnection(target, data);
  }

  // 上下文管理
  setContext(key: string, value: any): void {
    this._context.set(key, value);
  }

  getContext(key: string): any {
    return this._context.get(key);
  }

  hasContext(key: string): boolean {
    return this._context.has(key);
  }

  // 子类重写此方法来定义能力
  protected abstract initializeCapabilities(): void;

  // 辅助方法
  protected log(message: string, level: LogLevel = 'info'): void {
    this.logger.log(level, `[${this._type}:${this._id}] ${message}`);
  }
}
```

### 3.2 PageOperator 页面操作子

```typescript
export class PageOperator extends BaseOperator {
  protected _type = 'page';

  constructor(config: PageOperatorConfig = {}) {
    super({
      id: 'page-root',
      selector: 'body',
      type: 'page',
      ...config
    });
  }

  async observe(): Promise<PageTree> {
    try {
      // 获取页面完整DOM树
      const pageContent = await this.page.content();
      const document = parseHTML(pageContent);

      const pageTree: PageTree = {
        root: this.buildElementTree(document.body),
        operators: [],
        metadata: {
          url: this.page.url(),
          timestamp: Date.now(),
          title: await this.page.title()
        }
      };

      // 匹配已注册的容器操作子
      pageTree.operators = await this.matchContainerOperators(pageTree.root);

      this.log(`页面观察完成，发现 ${pageTree.operators.length} 个容器操作子`);
      return pageTree;
    } catch (error) {
      this.log(`页面观察失败: ${error.message}`, 'error');
      throw error;
    }
  }

  async operate(action: string, params: any): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      switch (action) {
        case 'navigate':
          await this.page.goto(params.url);
          return this.createSuccessResult('navigate', { url: params.url }, startTime);

        case 'screenshot':
          const screenshot = await this.page.screenshot();
          return this.createSuccessResult('screenshot', { screenshot }, startTime);

        case 'wait':
          await this.page.waitForTimeout(params.timeout || 5000);
          return this.createSuccessResult('wait', {}, startTime);

        case 'evaluate':
          const result = await this.page.evaluate(params.script);
          return this.createSuccessResult('evaluate', { result }, startTime);

        default:
          throw new Error(`未知操作: ${action}`);
      }
    } catch (error) {
      return this.createErrorResult(action, error.message, startTime);
    }
  }

  protected initializeCapabilities(): void {
    this._capabilities.add('navigate');
    this._capabilities.add('screenshot');
    this._capabilities.add('wait');
    this._capabilities.add('evaluate');
    this._capabilities.add('observe');
    this._capabilities.add('list');
  }

  private async matchContainerOperators(rootElement: ElementNode): Promise<OperatorMatch[]> {
    const registry = OperatorRegistry.getInstance();
    const matches: OperatorMatch[] = [];

    // 遍历所有已注册的容器操作子
    for (const [operatorType, operatorClass] of registry.getOperators()) {
      if (operatorType === 'page') continue;

      const operator = new operatorClass({ selector: 'auto-match' });
      const match = await this.tryMatchOperator(operator, rootElement);

      if (match) {
        matches.push(match);
        this.log(`匹配到操作子: ${operatorType} (置信度: ${match.confidence})`);
      }
    }

    return matches;
  }
}
```

### 3.3 ContainerOperator 容器操作子

```typescript
export abstract class ContainerOperator extends BaseOperator {
  protected _type = 'container';

  constructor(config: ContainerOperatorConfig) {
    super(config);
  }

  async observe(): Promise<PageTree> {
    try {
      // 查找匹配的容器元素
      const element = await this.page.waitForSelector(this._selector);
      const elementHandle = await element.asElement();

      if (!elementHandle) {
        throw new Error(`未找到匹配的容器元素: ${this._selector}`);
      }

      // 获取容器内部结构
      const innerHTML = await elementHandle.innerHTML();
      const document = parseHTML(innerHTML);

      const pageTree: PageTree = {
        root: this.buildElementTree(document.body),
        operators: [],
        metadata: {
          url: this.page.url(),
          timestamp: Date.now(),
          title: await this.page.title()
        }
      };

      // 匹配子操作子
      pageTree.operators = await this.matchChildOperators(pageTree.root);

      this.log(`容器观察完成，发现 ${pageTree.operators.length} 个子操作子`);
      return pageTree;
    } catch (error) {
      this.log(`容器观察失败: ${error.message}`, 'error');
      throw error;
    }
  }

  async operate(action: string, params: any): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      // 查找容器元素
      const container = await this.page.waitForSelector(this._selector);

      switch (action) {
        case 'extract-text':
          const text = await container.textContent();
          return this.createSuccessResult('extract-text', { text }, startTime);

        case 'find-elements':
          const elements = await container.$$(params.selector);
          const elementData = await Promise.all(
            elements.map(async (el, index) => ({
              index,
              text: await el.textContent(),
              attributes: await el.evaluate(el => {
                const attrs = {};
                for (const attr of el.attributes) {
                  attrs[attr.name] = attr.value;
                }
                return attrs;
              })
            }))
          );
          return this.createSuccessResult('find-elements', { elements: elementData }, startTime);

        case 'interact':
          if (params.action === 'click') {
            await container.click();
            return this.createSuccessResult('interact', { action: 'click' }, startTime);
          }
          // 其他交互操作
          break;

        default:
          // 调用子类实现的特定操作
          return this.performCustomOperation(container, action, params, startTime);
      }
    } catch (error) {
      return this.createErrorResult(action, error.message, startTime);
    }
  }

  // 子类实现的自定义操作
  protected abstract performCustomOperation(
    container: any,
    action: string,
    params: any,
    startTime: number
  ): Promise<OperationResult>;
}
```

## 4. 微博专用操作子

### 4.1 WeiboHomepageOperator

```typescript
export class WeiboHomepageOperator extends ContainerOperator {
  protected _type = 'weibo-homepage';

  constructor(config: WeiboOperatorConfig = {}) {
    super({
      id: 'weibo-homepage',
      selector: '.Main_wrap, .WB_main, [data-node-type="feed"]',
      ...config
    });
  }

  protected initializeCapabilities(): void {
    super.initializeCapabilities();
    this._capabilities.add('extract-feed-links');
    this._capabilities.add('get-hot-topics');
    this._capabilities.add('navigate-to-profile');
    this._capabilities.add('search-content');
    this._capabilities.add('get-recommendations');
  }

  protected async performCustomOperation(
    container: any,
    action: string,
    params: any,
    startTime: number
  ): Promise<OperationResult> {
    switch (action) {
      case 'extract-feed-links':
        return this.extractFeedLinks(container, startTime);

      case 'get-hot-topics':
        return this.getHotTopics(container, startTime);

      case 'search-content':
        return this.searchContent(container, params, startTime);

      default:
        throw new Error(`未知操作: ${action}`);
    }
  }

  private async extractFeedLinks(container: any, startTime: number): Promise<OperationResult> {
    const feedItems = await container.$$('.Feed_body, .card-wrap, [data-feed-id]');
    const links = [];

    for (const item of feedItems) {
      try {
        const link = await item.$('a');
        if (link) {
          const href = await link.getAttribute('href');
          const text = await link.textContent();

          if (href && text) {
            links.push({
              url: href.startsWith('http') ? href : `https://weibo.com${href}`,
              title: text.trim(),
              timestamp: Date.now()
            });
          }
        }
      } catch (error) {
        this.log(`提取链接失败: ${error.message}`, 'warn');
      }
    }

    return this.createSuccessResult('extract-feed-links', {
      links: links.slice(0, params.limit || 10)
    }, startTime);
  }

  private async getHotTopics(container: any, startTime: number): Promise<OperationResult> {
    const topicElements = await container.$$('.txt, .hot_word, [data-topic]');
    const topics = [];

    for (const element of topicElements) {
      try {
        const text = await element.textContent();
        if (text && text.trim()) {
          topics.push({
            title: text.trim(),
            rank: topics.length + 1,
            heat: await this.extractTopicHeat(element)
          });
        }
      } catch (error) {
        this.log(`提取话题失败: ${error.message}`, 'warn');
      }
    }

    return this.createSuccessResult('get-hot-topics', {
      topics: topics.slice(0, params.limit || 10)
    }, startTime);
  }
}
```

### 4.2 WeiboPostOperator

```typescript
export class WeiboPostOperator extends ContainerOperator {
  protected _type = 'weibo-post';

  constructor(config: WeiboOperatorConfig = {}) {
    super({
      id: 'weibo-post',
      selector: '.Feed_body, .card-wrap, [data-feed-id]',
      ...config
    });
  }

  protected initializeCapabilities(): void {
    super.initializeCapabilities();
    this._capabilities.add('extract-post-content');
    this._capabilities.add('get-author-info');
    this._capabilities.add('extract-comments');
    this._capabilities.add('like-post');
    this._capabilities.add('share-post');
    this._capabilities.add('get-post-stats');
  }

  protected async performCustomOperation(
    container: any,
    action: string,
    params: any,
    startTime: number
  ): Promise<OperationResult> {
    switch (action) {
      case 'extract-post-content':
        return this.extractPostContent(container, startTime);

      case 'get-author-info':
        return this.getAuthorInfo(container, startTime);

      case 'extract-comments':
        return this.extractComments(container, params, startTime);

      case 'get-post-stats':
        return this.getPostStats(container, startTime);

      default:
        throw new Error(`未知操作: ${action}`);
    }
  }

  private async extractComments(container: any, params: any, startTime: number): Promise<OperationResult> {
    try {
      // 点击评论按钮展开评论区
      const commentButton = await container.$('a:has-text("评论"), .comment_btn, [action-type="fl_comment"]');
      if (commentButton) {
        await commentButton.click();
        await this.page.waitForTimeout(2000);
      }

      // 提取评论内容
      const commentElements = await container.$$('.comment_list, .WB_comment, .comment-item');
      const comments = [];

      for (const commentEl of commentElements) {
        try {
          const author = await commentEl.$('.comment_name, .WB_name, .username');
          const content = await commentEl.$('.comment_txt, .WB_text, .comment-content');
          const time = await commentEl.$('.WB_from, .comment-time, .time');

          const comment = {
            id: generateId(),
            author: author ? await author.textContent() : '未知用户',
            content: content ? await content.textContent() : '',
            time: time ? await time.textContent() : '',
            likes: await this.extractCommentLikes(commentEl),
            replies: []
          };

          if (comment.content.trim()) {
            comments.push(comment);
          }
        } catch (error) {
          this.log(`提取评论失败: ${error.message}`, 'warn');
        }
      }

      return this.createSuccessResult('extract-comments', {
        comments: comments.slice(0, params.limit || 50),
        total: comments.length,
        postId: params.postId || 'unknown'
      }, startTime);
    } catch (error) {
      return this.createErrorResult('extract-comments', error.message, startTime);
    }
  }
}
```

## 5. 虚拟操作子

### 5.1 CookieManagerOperator

```typescript
export class CookieManagerOperator extends BaseOperator {
  protected _type = 'virtual-cookie-manager';
  protected _selector = 'virtual://cookie-manager';

  constructor(config: OperatorConfig = {}) {
    super({
      id: 'cookie-manager',
      selector: 'virtual://cookie-manager',
      type: 'virtual-cookie-manager',
      ...config
    });
  }

  async observe(): Promise<PageTree> {
    // 虚拟操作子不需要观察页面
    return {
      root: { id: 'virtual', tagName: 'virtual', attributes: {}, children: [], selector: 'virtual', isVisible: true },
      operators: [],
      metadata: { url: 'virtual://cookie-manager', timestamp: Date.now(), title: 'Cookie Manager' }
    };
  }

  async operate(action: string, params: any): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      switch (action) {
        case 'load-cookies':
          return this.loadCookies(params.path, startTime);

        case 'save-cookies':
          return this.saveCookies(params.path, startTime);

        case 'inject-cookies':
          return this.injectCookies(params.cookies, startTime);

        case 'clear-cookies':
          return this.clearCookies(startTime);

        case 'validate-session':
          return this.validateSession(startTime);

        default:
          throw new Error(`未知操作: ${action}`);
      }
    } catch (error) {
      return this.createErrorResult(action, error.message, startTime);
    }
  }

  protected initializeCapabilities(): void {
    this._capabilities.add('load-cookies');
    this._capabilities.add('save-cookies');
    this._capabilities.add('inject-cookies');
    this._capabilities.add('clear-cookies');
    this._capabilities.add('validate-session');
  }

  private async loadCookies(path: string, startTime: number): Promise<OperationResult> {
    try {
      const fs = require('fs');
      const cookieData = fs.readFileSync(path, 'utf8');
      const cookies = JSON.parse(cookieData);

      await this.page.context().addCookies(cookies);

      return this.createSuccessResult('load-cookies', {
        count: cookies.length,
        path
      }, startTime);
    } catch (error) {
      return this.createErrorResult('load-cookies', `加载Cookie失败: ${error.message}`, startTime);
    }
  }

  private async saveCookies(path: string, startTime: number): Promise<OperationResult> {
    try {
      const cookies = await this.page.context().cookies();

      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(path);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(path, JSON.stringify(cookies, null, 2));

      return this.createSuccessResult('save-cookies', {
        count: cookies.length,
        path
      }, startTime);
    } catch (error) {
      return this.createErrorResult('save-cookies', `保存Cookie失败: ${error.message}`, startTime);
    }
  }
}
```

## 6. 操作子注册中心

```typescript
export class OperatorRegistry {
  private static instance: OperatorRegistry;
  private operators: Map<string, typeof BaseOperator> = new Map();
  private instances: Map<string, IOperator> = new Map();
  private globalState: Map<string, any> = new Map();

  static getInstance(): OperatorRegistry {
    if (!OperatorRegistry.instance) {
      OperatorRegistry.instance = new OperatorRegistry();
    }
    return OperatorRegistry.instance;
  }

  register(type: string, operatorClass: typeof BaseOperator): void {
    this.operators.set(type, operatorClass);
    console.log(`[OperatorRegistry] 注册操作子: ${type}`);
  }

  getOperator(type: string): typeof BaseOperator | undefined {
    return this.operators.get(type);
  }

  getOperators(): Map<string, typeof BaseOperator> {
    return new Map(this.operators);
  }

  createInstance(type: string, config: OperatorConfig): IOperator {
    const OperatorClass = this.operators.get(type);
    if (!OperatorClass) {
      throw new Error(`未找到操作子类型: ${type}`);
    }

    const instance = new OperatorClass(config);
    this.instances.set(instance.id, instance);

    return instance;
  }

  getInstance(id: string): IOperator | undefined {
    return this.instances.get(id);
  }

  // 全局状态管理
  setGlobalState(key: string, value: any): void {
    this.globalState.set(key, value);
  }

  getGlobalState(key: string): any {
    return this.globalState.get(key);
  }

  hasGlobalState(key: string): boolean {
    return this.globalState.has(key);
  }

  removeGlobalState(key: string): boolean {
    return this.globalState.delete(key);
  }
}
```

## 7. 操作子编排器

```typescript
export class OperatorOrchestrator {
  private registry: OperatorRegistry;
  private rootOperator: PageOperator;
  private context: ContextManager;

  constructor(config: OrchestratorConfig = {}) {
    this.registry = OperatorRegistry.getInstance();
    this.context = new ContextManager();
    this.rootOperator = new PageOperator(config.pageConfig);
  }

  async initialize(): Promise<void> {
    // 注册内置操作子
    this.registerBuiltInOperators();

    // 启动浏览器
    await this.rootOperator.initialize();

    console.log('[OperatorOrchestrator] 初始化完成');
  }

  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const workflowContext = new Map<string, any>();
    const results: OperationResult[] = [];

    try {
      for (const step of workflow.steps) {
        console.log(`[Workflow] 执行步骤: ${step.name}`);

        // 查找或创建操作子
        const operator = await this.resolveOperator(step.operatorType, step.config);

        // 设置操作子上下文
        this.setupOperatorContext(operator, workflowContext, step.context);

        // 执行操作
        const result = await operator.operate(step.action, step.params);
        results.push(result);

        // 更新工作流上下文
        if (result.success) {
          workflowContext.set(step.name, result.data);
          this.context.setStepResult(step.name, result);
        } else {
          throw new Error(`步骤执行失败: ${step.name} - ${result.error}`);
        }
      }

      return {
        success: true,
        results,
        context: workflowContext,
        metadata: {
          workflowName: workflow.name,
          duration: Date.now() - workflow.startTime,
          stepsCount: workflow.steps.length
        }
      };
    } catch (error) {
      return {
        success: false,
        results,
        error: error.message,
        context: workflowContext,
        metadata: {
          workflowName: workflow.name,
          duration: Date.now() - workflow.startTime,
          stepsCount: workflow.steps.length
        }
      };
    }
  }

  private registerBuiltInOperators(): void {
    // 注册微博相关操作子
    this.registry.register('weibo-homepage', WeiboHomepageOperator);
    this.registry.register('weibo-post', WeiboPostOperator);
    this.registry.register('weibo-profile', WeiboProfileOperator);

    // 注册虚拟操作子
    this.registry.register('cookie-manager', CookieManagerOperator);
    this.registry.register('state-manager', StateManagerOperator);
    this.registry.register('logger', LoggerOperator);
  }

  private async resolveOperator(type: string, config: OperatorConfig): Promise<IOperator> {
    // 尝试获取现有实例
    if (config.id) {
      const existing = this.registry.getInstance(config.id);
      if (existing) return existing;
    }

    // 创建新实例
    return this.registry.createInstance(type, config);
  }
}
```

## 8. 使用示例

### 8.1 基本使用

```typescript
import { OperatorOrchestrator } from './src/OperatorOrchestrator';
import { OperatorRegistry } from './src/OperatorRegistry';

async function main() {
  // 创建编排器
  const orchestrator = new OperatorOrchestrator();

  // 初始化
  await orchestrator.initialize();

  // 定义工作流
  const workflow = {
    name: 'weibo-comment-extraction',
    startTime: Date.now(),
    steps: [
      {
        name: 'navigate_to_homepage',
        operatorType: 'page',
        action: 'navigate',
        params: { url: 'https://weibo.com' }
      },
      {
        name: 'load_cookies',
        operatorType: 'cookie-manager',
        action: 'load-cookies',
        params: { path: './cookies/weibo.json' }
      },
      {
        name: 'extract_feeds',
        operatorType: 'weibo-homepage',
        action: 'extract-feed-links',
        params: { limit: 5 }
      },
      {
        name: 'extract_comments',
        operatorType: 'weibo-post',
        action: 'extract-comments',
        params: {
          postId: '${extract_feeds.links[0].url}',
          limit: 20
        }
      }
    ]
  };

  // 执行工作流
  const result = await orchestrator.executeWorkflow(workflow);

  if (result.success) {
    console.log('工作流执行成功:', result.context);
  } else {
    console.error('工作流执行失败:', result.error);
  }
}

main().catch(console.error);
```

### 8.2 自定义操作子

```typescript
export class CustomSearchOperator extends ContainerOperator {
  protected _type = 'custom-search';

  constructor(config: OperatorConfig) {
    super({
      id: 'custom-search',
      selector: '.search-container, .search-box',
      ...config
    });
  }

  protected initializeCapabilities(): void {
    super.initializeCapabilities();
    this._capabilities.add('search-keywords');
    this._capabilities.add('filter-results');
    this._capabilities.add('extract-search-data');
  }

  protected async performCustomOperation(
    container: any,
    action: string,
    params: any,
    startTime: number
  ): Promise<OperationResult> {
    switch (action) {
      case 'search-keywords':
        return this.searchKeywords(container, params, startTime);
      case 'filter-results':
        return this.filterResults(container, params, startTime);
      case 'extract-search-data':
        return this.extractSearchData(container, startTime);
      default:
        throw new Error(`未知操作: ${action}`);
    }
  }

  private async searchKeywords(container: any, params: any, startTime: number): Promise<OperationResult> {
    // 实现搜索逻辑
    return this.createSuccessResult('search-keywords', { results: [] }, startTime);
  }
}

// 注册自定义操作子
OperatorRegistry.getInstance().register('custom-search', CustomSearchOperator);
```

这个架构设计提供了完整的嵌套操作子系统，支持动态匹配、能力驱动、上下文管理和工作流编排。

## 9. 完整文件架构

### 9.1 目录结构设计

```
sharedmodule/operations-framework/
├── src/
│   ├── core/                              # 核心框架组件
│   │   ├── interfaces/                    # 接口定义
│   │   │   ├── IOperator.ts              # 操作子核心接口
│   │   │   ├── PageTree.ts               # 页面树结构接口
│   │   │   ├── OperationResult.ts        # 操作结果接口
│   │   │   ├── OperatorStatus.ts         # 操作子状态接口
│   │   │   ├── WorkflowDefinition.ts     # 工作流定义接口
│   │   │   ├── OperatorConfig.ts         # 操作子配置接口
│   │   │   └── ContextManager.ts         # 上下文管理接口
│   │   ├── abstract/                     # 抽象基类
│   │   │   ├── BaseOperator.ts           # 操作子抽象基类
│   │   │   ├── BaseContainerOperator.ts  # 容器操作子抽象基类
│   │   │   └── BaseVirtualOperator.ts    # 虚拟操作子抽象基类
│   │   ├── concrete/                     # 具体实现类
│   │   │   ├── PageOperator.ts           # 页面操作子
│   │   │   ├── ContainerOperator.ts      # 容器操作子
│   │   │   └── VirtualOperator.ts        # 虚拟操作子
│   │   ├── registry/                     # 注册管理系统
│   │   │   ├── OperatorRegistry.ts       # 操作子注册中心
│   │   │   ├── RegistryManager.ts        # 注册管理器
│   │   │   └── StateManager.ts           # 状态管理器
│   │   ├── orchestration/                # 编排系统
│   │   │   ├── OperatorOrchestrator.ts   # 操作子编排器
│   │   │   ├── WorkflowEngine.ts         # 工作流引擎
│   │   │   ├── ContextManager.ts         # 上下文管理器
│   │   │   └── ExecutionPlanner.ts       # 执行规划器
│   │   ├── utils/                        # 工具类
│   │   │   ├── PageTreeBuilder.ts        # 页面树构建器
│   │   │   ├── SelectorMatcher.ts        # 选择器匹配器
│   │   │   ├── CapabilityResolver.ts     # 能力解析器
│   │   │   ├── OperationHelper.ts        # 操作辅助工具
│   │   │   └── ErrorHelper.ts            # 错误处理辅助
│   │   └── types/                        # 类型定义
│   │       ├── OperatorTypes.ts          # 操作子类型
│   │       ├── WorkflowTypes.ts          # 工作流类型
│   │       └── CommonTypes.ts            # 通用类型
│   ├── operators/                        # 操作子实现
│   │   ├── base/                         # 基础操作子
│   │   │   ├── PageOperator.ts           # 页面操作子实现
│   │   │   └── ContainerOperator.ts      # 容器操作子实现
│   │   ├── virtual/                      # 虚拟操作子
│   │   │   ├── CookieManagerOperator.ts  # Cookie管理操作子
│   │   │   ├── StateManagerOperator.ts   # 状态管理操作子
│   │   │   ├── LoggerOperator.ts         # 日志记录操作子
│   │   │   └── FileManagerOperator.ts    # 文件管理操作子
│   │   ├── weibo/                        # 微博专用操作子
│   │   │   ├── WeiboHomepageOperator.ts  # 微博主页操作子
│   │   │   ├── WeiboPostOperator.ts      # 微博帖子操作子
│   │   │   ├── WeiboProfileOperator.ts   # 微博个人主页操作子
│   │   │   ├── WeiboSearchOperator.ts    # 微博搜索操作子
│   │   │   ├── WeiboCommentOperator.ts   # 微博评论操作子
│   │   │   └── WeiboLoginOperator.ts     # 微博登录操作子
│   │   ├── browser/                      # 浏览器操作子
│   │   │   ├── NavigationOperator.ts     # 导航操作子
│   │   │   ├── InteractionOperator.ts    # 交互操作子
│   │   │   ├── ElementOperator.ts        # 元素操作子
│   │   │   └── FormOperator.ts           # 表单操作子
│   │   └── custom/                      # 自定义操作子（用户扩展）
│   │       └── README.md                # 自定义操作子开发指南
│   ├── workflows/                        # 工作流定义
│   │   ├── predefined/                   # 预定义工作流
│   │   │   ├── WeiboCommentExtraction.ts # 微博评论提取工作流
│   │   │   ├── WeiboPostDownload.ts      # 微博帖子下载工作流
│   │   │   ├── WeiboProfileScraping.ts   # 微博个人资料抓取工作流
│   │   │   └── WeiboHotTopics.ts         # 微博热门话题工作流
│   │   ├── templates/                    # 工作流模板
│   │   │   ├── BasicNavigationTemplate.ts # 基础导航模板
│   │   │   ├── DataExtractionTemplate.ts  # 数据提取模板
│   │   │   └── AutomationTemplate.ts     # 自动化模板
│   │   └── custom/                       # 自定义工作流（用户扩展）
│   │       └── README.md                 # 自定义工作流开发指南
│   ├── plugins/                          # 插件系统
│   │   ├── core/                         # 核心插件
│   │   │   ├── PluginInterface.ts        # 插件接口
│   │   │   ├── PluginManager.ts         # 插件管理器
│   │   │   └── PluginLoader.ts          # 插件加载器
│   │   ├── builtin/                      # 内置插件
│   │   │   ├── DataProcessorPlugin.ts    # 数据处理插件
│   │   │   ├── FileExportPlugin.ts       # 文件导出插件
│   │   │   ├── NotificationPlugin.ts     # 通知插件
│   │   │   └── MonitoringPlugin.ts       # 监控插件
│   │   └── custom/                      # 自定义插件（用户扩展）
│   │       └── README.md                 # 自定义插件开发指南
│   ├── config/                           # 配置系统
│   │   ├── OperatorConfig.ts             # 操作子配置
│   │   ├── WorkflowConfig.ts             # 工作流配置
│   │   ├── SystemConfig.ts               # 系统配置
│   │   └── ConfigManager.ts              # 配置管理器
│   ├── storage/                          # 存储系统
│   │   ├── StateStorage.ts               # 状态存储
│   │   ├── CookieStorage.ts              # Cookie存储
│   │   ├── LogStorage.ts                 # 日志存储
│   │   └── CacheStorage.ts               # 缓存存储
│   ├── testing/                          # 测试框架
│   │   ├── TestRunner.ts                 # 测试运行器
│   │   ├── TestOperator.ts               # 测试操作子
│   │   ├── MockOperator.ts               # 模拟操作子
│   │   └── TestHelpers.ts               # 测试辅助工具
│   ├── migration/                        # 迁移工具
│   │   ├── CookieMigration.ts            # Cookie迁移工具
│   │   ├── WorkflowMigration.ts          # 工作流迁移工具
│   │   └── LegacyAdapter.ts              # 遗留系统适配器
│   └── index.ts                          # 框架入口文件
├── examples/                             # 使用示例
│   ├── basic-usage/                      # 基础使用示例
│   │   ├── simple-navigation.ts          # 简单导航示例
│   │   ├── cookie-management.ts          # Cookie管理示例
│   │   └── element-interaction.ts       # 元素交互示例
│   ├── weibo-automation/                 # 微博自动化示例
│   │   ├── comment-extraction.ts        # 评论提取示例
│   │   ├── post-download.ts             # 帖子下载示例
│   │   ├── profile-scraping.ts          # 个人资料抓取示例
│   │   └── batch-automation.ts          # 批量自动化示例
│   ├── custom-operators/                 # 自定义操作子示例
│   │   ├── search-operator.ts            # 搜索操作子示例
│   │   ├── ecommerce-operator.ts         # 电商操作子示例
│   │   └── social-media-operator.ts     # 社交媒体操作子示例
│   └── workflow-examples/                # 工作流示例
│       ├── sequential-workflow.ts        # 顺序工作流示例
│       ├── parallel-workflow.ts          # 并行工作流示例
│       └── conditional-workflow.ts       # 条件工作流示例
├── tests/                                # 测试文件
│   ├── unit/                             # 单元测试
│   │   ├── core/
│   │   │   ├── BaseOperator.test.ts      # 基础操作子测试
│   │   │   ├── OperatorRegistry.test.ts  # 操作子注册中心测试
│   │   │   └── OperatorOrchestrator.test.ts # 操作子编排器测试
│   │   ├── operators/
│   │   │   ├── PageOperator.test.ts      # 页面操作子测试
│   │   │   ├── ContainerOperator.test.ts # 容器操作子测试
│   │   │   └── VirtualOperator.test.ts   # 虚拟操作子测试
│   │   ├── weibo/
│   │   │   ├── WeiboHomepageOperator.test.ts # 微博主页操作子测试
│   │   │   ├── WeiboPostOperator.test.ts     # 微博帖子操作子测试
│   │   │   └── WeiboCommentOperator.test.ts  # 微博评论操作子测试
│   │   └── workflows/
│   │       ├── WorkflowEngine.test.ts   # 工作流引擎测试
│   │       └── ContextManager.test.ts   # 上下文管理器测试
│   ├── integration/                      # 集成测试
│   │   ├── end-to-end/                   # 端到端测试
│   │   │   ├── CompleteWorkflow.test.ts   # 完整工作流测试
│   │   │   ├── WeiboAutomation.test.ts   # 微博自动化测试
│   │   │   └── ErrorHandling.test.ts     # 错误处理测试
│   │   └── performance/                   # 性能测试
│   │       ├── LargeScaleWorkflow.test.ts # 大规模工作流测试
│   │       └── MemoryUsage.test.ts       # 内存使用测试
│   └── e2e/                              # 端到端测试
│       ├── real-scenarios/               # 真实场景测试
│       │   ├── RealWeiboTest.ts          # 真实微博测试
│       │   ├── ProductionWorkflow.test.ts # 生产环境工作流测试
│       │   └── BrowserCompatibility.test.ts # 浏览器兼容性测试
│       └── setup/                        # 测试环境设置
│           ├── TestEnvironment.ts        # 测试环境
│           └── TestData.ts               # 测试数据
├── docs/                                 # 文档
│   ├── api/                              # API文档
│   │   ├── core/                         # 核心API
│   │   ├── operators/                    # 操作子API
│   │   ├── workflows/                    # 工作流API
│   │   └── plugins/                      # 插件API
│   ├── guides/                           # 开发指南
│   │   ├── getting-started.md            # 快速开始
│   │   ├── operator-development.md       # 操作子开发指南
│   │   ├── workflow-development.md       # 工作流开发指南
│   │   ├── plugin-development.md         # 插件开发指南
│   │   └── migration-guide.md            # 迁移指南
│   ├── examples/                         # 示例文档
│   │   ├── basic-examples.md             # 基础示例
│   │   ├── weibo-examples.md             # 微博示例
│   │   └── advanced-examples.md          # 高级示例
│   ├── architecture/                     # 架构文档
│   │   ├── core-architecture.md          # 核心架构
│   │   ├── operator-system.md            # 操作子系统
│   │   ├── workflow-system.md            # 工作流系统
│   │   ├── plugin-system.md              # 插件系统
│   │   └── performance-considerations.md # 性能考虑
│   └── troubleshooting/                  # 故障排除
│       ├── common-issues.md              # 常见问题
│       ├── performance-issues.md         # 性能问题
│       ├── browser-issues.md            # 浏览器问题
│       └── debugging-tips.md            # 调试技巧
├── tools/                                # 工具脚本
│   ├── build/                            # 构建工具
│   │   ├── build.ts                      # 构建脚本
│   │   ├── bundle.ts                     # 打包脚本
│   │   └── optimize.ts                   # 优化脚本
│   ├── testing/                          # 测试工具
│   │   ├── test-runner.ts                # 测试运行器
│   │   ├── coverage.ts                   # 测试覆盖率
│   │   └── benchmark.ts                  # 性能基准测试
│   ├── deployment/                       # 部署工具
│   │   ├── package.ts                    # 打包发布
│   │   ├── version.ts                    # 版本管理
│   │   └── publish.ts                    # 发布工具
│   └── development/                      # 开发工具
│       ├── codegen.ts                    # 代码生成
│       ├── validate.ts                   # 验证工具
│       └── format.ts                     # 代码格式化
├── config/                               # 配置文件
│   ├── default.json                      # 默认配置
│   ├── development.json                  # 开发环境配置
│   ├── production.json                   # 生产环境配置
│   └── test.json                         # 测试环境配置
├── scripts/                              # 脚本文件
│   ├── setup.sh                          # 环境设置脚本
│   ├── build.sh                          # 构建脚本
│   ├── test.sh                           # 测试脚本
│   └── deploy.sh                         # 部署脚本
├── package.json                          # 包配置
├── tsconfig.json                         # TypeScript配置
├── jest.config.js                        # Jest测试配置
├── eslint.config.js                      # ESLint配置
├── .gitignore                           # Git忽略文件
└── README.md                            # 项目说明文档
```

### 9.2 核心文件功能说明

#### 9.2.1 入口文件 (src/index.ts)
```typescript
// 框架主入口文件
export { BaseOperator } from './core/abstract/BaseOperator';
export { PageOperator } from './operators/base/PageOperator';
export { ContainerOperator } from './operators/base/ContainerOperator';
export { VirtualOperator } from './operators/base/VirtualOperator';

// 虚拟操作子
export { CookieManagerOperator } from './operators/virtual/CookieManagerOperator';
export { StateManagerOperator } from './operators/virtual/StateManagerOperator';
export { LoggerOperator } from './operators/virtual/LoggerOperator';

// 微博操作子
export { WeiboHomepageOperator } from './operators/weibo/WeiboHomepageOperator';
export { WeiboPostOperator } from './operators/weibo/WeiboPostOperator';
export { WeiboProfileOperator } from './operators/weibo/WeiboProfileOperator';

// 核心管理器
export { OperatorRegistry } from './core/registry/OperatorRegistry';
export { OperatorOrchestrator } from './core/orchestration/OperatorOrchestrator';
export { ContextManager } from './core/orchestration/ContextManager';

// 接口定义
export * from './core/interfaces/IOperator';
export * from './core/interfaces/PageTree';
export * from './core/interfaces/OperationResult';
export * from './core/interfaces/WorkflowDefinition';

// 类型定义
export * from './core/types/OperatorTypes';
export * from './core/types/WorkflowTypes';

// 工具类
export { PageTreeBuilder } from './core/utils/PageTreeBuilder';
export { SelectorMatcher } from './core/utils/SelectorMatcher';
export { CapabilityResolver } from './core/utils/CapabilityResolver';

// 默认配置
export { defaultOperatorConfig } from './config/OperatorConfig';
export { defaultWorkflowConfig } from './config/WorkflowConfig';
```

#### 9.2.2 配置文件层次结构
```typescript
// config/default.json - 默认配置
{
  "framework": {
    "name": "WebAuto Operator Framework",
    "version": "1.0.0",
    "description": "基于嵌套operator的自动化操作框架"
  },
  "browser": {
    "headless": false,
    "viewport": { "width": 1920, "height": 1080 },
    "timeout": 30000,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  },
  "operators": {
    "defaultTimeout": 10000,
    "retryAttempts": 3,
    "enableLogging": true,
    "logLevel": "info"
  },
  "workflows": {
    "maxSteps": 100,
    "enableParallel": true,
    "maxConcurrency": 5
  },
  "storage": {
    "cookiePath": "./storage/cookies",
    "logPath": "./storage/logs",
    "cachePath": "./storage/cache"
  }
}

// config/development.json - 开发环境配置
{
  "framework": {
    "debug": true,
    "enableDevTools": true
  },
  "browser": {
    "headless": false,
    "devtools": true
  },
  "operators": {
    "enableLogging": true,
    "logLevel": "debug"
  }
}

// config/production.json - 生产环境配置
{
  "framework": {
    "debug": false,
    "enableDevTools": false
  },
  "browser": {
    "headless": true,
    "devtools": false
  },
  "operators": {
    "enableLogging": false,
    "logLevel": "warn"
  }
}
```

### 9.3 开发工作流程

#### 9.3.1 新操作子开发流程
```bash
# 1. 创建操作子文件
mkdir -p src/operators/custom/my-operator
touch src/operators/custom/my-operator/MyOperator.ts

# 2. 实现操作子类
# 实现 BaseOperator 或 ContainerOperator 的抽象方法

# 3. 注册操作子
# 在 OperatorRegistry 中注册新操作子类型

# 4. 编写测试
# 创建对应的测试文件

# 5. 运行测试
npm test

# 6. 构建项目
npm run build
```

#### 9.3.2 新工作流开发流程
```bash
# 1. 创建工作流定义文件
touch src/workflows/custom/MyWorkflow.ts

# 2. 定义工作流步骤
# 使用现有的操作子组合工作流

# 3. 测试工作流
# 使用测试运行器验证工作流

# 4. 部署工作流
# 将工作流配置部署到生产环境
```

### 9.4 构建和部署

#### 9.4.1 构建命令
```bash
# 开发构建
npm run build:dev

# 生产构建
npm run build:prod

# 完整构建（包含测试）
npm run build:full

# 仅构建类型定义
npm run build:types
```

#### 9.4.2 测试命令
```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行端到端测试
npm run test:e2e

# 生成测试覆盖率报告
npm run test:coverage
```

### 9.5 扩展点设计

#### 9.5.1 操作子扩展点
- **自定义操作子**: 继承 BaseOperator 实现特定功能
- **操作子插件**: 通过插件系统动态加载操作子
- **操作子装饰器**: 为现有操作子添加额外功能

#### 9.5.2 工作流扩展点
- **自定义工作流步骤**: 实现自定义的工作流步骤类型
- **工作流插件**: 通过插件系统扩展工作流功能
- **工作流模板**: 创建可重用的工作流模板

#### 9.5.3 插件扩展点
- **核心插件**: 扩展框架核心功能
- **工具插件**: 提供额外的工具和实用程序
- **集成插件**: 与第三方系统集成

这个完整的文件架构提供了清晰的模块化设计，支持灵活的扩展和维护。每个模块都有明确的职责和边界，便于团队协作和代码管理。