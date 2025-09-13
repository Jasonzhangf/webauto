# Browser Assistant 详细实现设计

## 1. 技术栈确认

### 1.1 核心依赖
- **Camoufox-js**: 基于 Firefox 的反检测浏览器
- **Playwright**: 浏览器自动化框架
- **TypeScript**: 类型安全的开发语言
- **Zod**: 数据验证和模式定义
- **WS**: WebSocket 服务器实现

### 1.2 可选 LLM 集成
- **OpenAI Compatible Providers**: 已有的 LLM 提供商框架
- **本地模型**: 支持本地运行的 AI 模型

## 2. 核心类设计

### 2.1 BrowserAssistant (主入口类)

```typescript
// src/core/BrowserAssistant.ts
export class BrowserAssistant {
  private browserManager: BrowserManager;
  private pageObserver: PageObserver;
  private operationEngine: OperationEngine;
  private cookieManager: CookieManager;
  private webSocketServer?: WebSocketServer;
  private aiAnalyzer?: AIAnalyzer;
  private config: BrowserAssistantConfig;
  private isInitialized = false;

  constructor(config: Partial<BrowserAssistantConfig> = {}) {
    this.config = mergeConfig(config);
    this.browserManager = new BrowserManager(this.config.browser);
    this.cookieManager = new CookieManager(this.config.cookies);
    this.pageObserver = new PageObserver(this.config.observation);
    this.operationEngine = new OperationEngine(this.config.operations);
    
    // 可选组件
    if (this.config.websocket.enabled) {
      this.webSocketServer = new WebSocketServer(this.config.websocket);
    }
    
    if (this.config.observation.enableAI && hasLLMConfig()) {
      this.aiAnalyzer = new AIAnalyzer();
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // 1. 初始化浏览器
    await this.browserManager.launch();
    
    // 2. 注册内置操作
    this.registerBuiltinOperations();
    
    // 3. 启动 WebSocket 服务器（如果启用）
    if (this.webSocketServer) {
      await this.webSocketServer.start(this.config.websocket.port);
      this.registerWebSocketHandlers();
    }
    
    this.isInitialized = true;
  }

  // 主要 API
  async observePage(url: string, options?: ObserveOptions): Promise<ObserveResult> {
    const page = await this.browserManager.newPage();
    await page.goto(url);
    return this.pageObserver.observe(page, options);
  }

  async analyzePage(url: string): Promise<PageAnalysis> {
    const page = await this.browserManager.newPage();
    await page.goto(url);
    return this.pageObserver.analyzePage(page);
  }

  async executeOperation(operation: string, params: Record<string, unknown>): Promise<unknown> {
    return this.operationEngine.execute(operation, params);
  }

  async close(): Promise<void> {
    await this.browserManager.close();
    if (this.webSocketServer) {
      await this.webSocketServer.stop();
    }
  }
}
```

### 2.2 BrowserManager (浏览器管理器)

```typescript
// src/core/BrowserManager.ts
export class BrowserManager {
  private browser?: import('camoufox-js').Camoufox;
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private cdpSessions: Map<string, CDPSession> = new Map();
  private config: BrowserConfig;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: false,
      viewport: { width: 1280, height: 720 },
      locale: ['zh-CN', 'en-US'],
      ...config
    };
  }

  async launch(): Promise<void> {
    const { Camoufox } = await import('camoufox-js');
    
    this.browser = await Camoufox.launch({
      headless: this.config.headless,
      viewport: this.config.viewport,
      locale: this.config.locale,
      // Camoufox 特有配置
      geoip: true,
      fonts: this.getChineseFonts(),
      firefox_user_prefs: this.getFirefoxPrefs()
    });

    // 设置默认上下文
    const defaultContext = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent
    });
    
    this.contexts.set('default', defaultContext);
  }

  async newContext(config?: ContextConfig): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    const context = await this.browser.newContext({
      ...this.config,
      ...config
    });
    
    const contextId = generateId();
    this.contexts.set(contextId, context);
    
    return context;
  }

  async newPage(contextId: string = 'default'): Promise<Page> {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    
    const page = await context.newPage();
    const pageId = generateId();
    this.pages.set(pageId, page);
    
    // 设置页面事件监听
    this.setupPageEventListeners(page);
    
    return page;
  }

  async getCDPSession(page: Page): Promise<CDPSession> {
    const pageId = this.getPageId(page);
    if (this.cdpSessions.has(pageId)) {
      return this.cdpSessions.get(pageId)!;
    }
    
    const session = await page.context().newCDPSession(page);
    this.cdpSessions.set(pageId, session);
    
    return session;
  }

  async getAccessibilityTree(page: Page): Promise<AccessibilityNode> {
    const session = await this.getCDPSession(page);
    const result = await session.send('Accessibility.getFullAXTree');
    return this.parseAccessibilityTree(result);
  }

  private parseAccessibilityTree(tree: any): AccessibilityNode {
    // 解析 Chrome DevTools Protocol 的 Accessibility Tree
    // 转换为内部统一的节点格式
    return transformAXTree(tree);
  }

  private getChineseFonts(): string[] {
    const platform = process.platform;
    if (platform === 'darwin') {
      return ['PingFang SC', 'Hiragino Sans GB', 'STSong', 'STHeiti'];
    } else if (platform === 'win32') {
      return ['Microsoft YaHei', 'SimSun', 'Microsoft JhengHei'];
    } else {
      return ['Noto Sans CJK SC', 'Source Han Sans', 'WenQuanYi Micro Hei'];
    }
  }

  private getFirefoxPrefs(): Record<string, any> {
    return {
      // 中文本地化
      'intl.accept_languages': 'zh-CN,zh,en-US,en',
      'intl.charset.default': 'UTF-8',
      
      // 隐私保护
      'privacy.resistFingerprinting': false, // Camoufox 会处理这个
      'webgl.disabled': false,
      
      // 性能优化
      'dom.ipc.processCount': 8,
      'browser.cache.disk.enable': true,
      
      // 开发者工具
      'devtools.chrome.enabled': true,
      'devtools.debugger.remote-enabled': true
    };
  }
}
```

### 2.3 PageObserver (页面观察器)

```typescript
// src/observers/PageObserver.ts
export class PageObserver {
  private config: ObservationConfig;
  private elementCache: Map<string, ObservedElement> = new Map();
  private aiAnalyzer?: AIAnalyzer;

  constructor(config: ObservationConfig = {}) {
    this.config = {
      enableAI: false,
      confidenceThreshold: 0.7,
      cacheResults: true,
      ...config
    };

    if (this.config.enableAI) {
      this.aiAnalyzer = new AIAnalyzer();
    }
  }

  async observe(page: Page, options: ObserveOptions = {}): Promise<ObserveResult> {
    const validatedOptions = ObserveOptionsSchema.parse(options);
    
    // 1. 获取页面基础信息
    const url = page.url();
    const title = await page.title();
    
    // 2. 获取 Accessibility Tree
    const accessibilityTree = await this.getAccessibilityTree(page);
    
    // 3. 分析页面结构
    let elements: ObservedElement[];
    
    if (this.config.enableAI && this.aiAnalyzer) {
      // AI 驱动的元素识别
      elements = await this.aiAnalyzer.identifyElements(accessibilityTree, validatedOptions);
    } else {
      // 基于规则的元素识别
      elements = await this.ruleBasedElementIdentification(accessibilityTree);
    }
    
    // 4. 过滤和排序
    elements = this.filterAndSortElements(elements, validatedOptions);
    
    // 5. 缓存结果
    if (this.config.cacheResults) {
      this.cacheElements(url, elements);
    }
    
    // 6. 绘制覆盖层（如果启用）
    if (validatedOptions.drawOverlay) {
      await this.drawOverlay(page, elements);
    }
    
    return {
      elements,
      timestamp: new Date().toISOString(),
      url,
      metadata: await this.getPageMetadata(page)
    };
  }

  async analyzePage(page: Page): Promise<PageAnalysis> {
    const observeResult = await this.observe(page);
    
    let pageType: PageAnalysis['type'] = 'unknown';
    let mainContent: PageAnalysis['mainContent'] | undefined;
    let suggestedOperations: OperationSuggestion[] = [];
    
    if (this.aiAnalyzer) {
      const analysis = await this.aiAnalyzer.analyzePageStructure(
        JSON.stringify(observeResult.elements)
      );
      
      pageType = analysis.type;
      mainContent = analysis.mainContent;
      suggestedOperations = analysis.suggestedOperations;
    } else {
      // 基于规则的页面类型识别
      pageType = this.identifyPageTypeByRules(observeResult);
      mainContent = this.findMainContentByRules(observeResult.elements);
      suggestedOperations = this.suggestOperationsByRules(observeResult);
    }
    
    return {
      url: observeResult.url,
      title: await page.title(),
      type: pageType,
      mainContent,
      keyElements: observeResult.elements,
      suggestedOperations,
      metadata: {
        loadTime: await this.getLoadTime(page),
        elementCount: observeResult.elements.length,
        interactiveElements: observeResult.elements.filter(e => 
          ['click', 'type', 'select'].includes(e.method)
        ).length
      }
    };
  }

  private async getAccessibilityTree(page: Page): Promise<string> {
    const session = await page.context().newCDPSession(page);
    const result = await session.send('Accessibility.getFullAXTree');
    return JSON.stringify(result);
  }

  private ruleBasedElementIdentification(accessibilityTree: string): Promise<ObservedElement[]> {
    // 实现基于规则的元素识别逻辑
    // 分析 Accessibility Tree，识别按钮、链接、输入框等
    const tree = JSON.parse(accessibilityTree);
    const elements: ObservedElement[] = [];
    
    this.traverseAccessibilityTree(tree, (node) => {
      if (this.isInteractiveElement(node)) {
        elements.push(this.createObservedElement(node));
      }
    });
    
    return Promise.resolve(elements);
  }

  private traverseAccessibilityTree(tree: any, callback: (node: any) => void): void {
    if (!tree) return;
    
    const nodes = tree.nodes || [tree];
    for (const node of nodes) {
      callback(node);
      if (node.children) {
        for (const child of node.children) {
          this.traverseAccessibilityTree(child, callback);
        }
      }
    }
  }

  private isInteractiveElement(node: any): boolean {
    const interactiveRoles = [
      'button', 'link', 'textbox', 'combobox', 'listbox', 
      'menuitem', 'checkbox', 'radio', 'slider', 'spinbutton'
    ];
    
    return interactiveRoles.includes(node.role) || 
           node.name?.includes('button') ||
           node.name?.includes('link') ||
           node.name?.includes('input');
  }

  private createObservedElement(node: any): ObservedElement {
    const selector = this.generateSelector(node);
    const method = this.determineInteractionMethod(node);
    const description = this.generateDescription(node);
    
    return {
      selector,
      description,
      method,
      arguments: [],
      elementId: node.nodeId || generateId(),
      confidence: this.calculateConfidence(node),
      metadata: {
        role: node.role,
        name: node.name,
        value: node.value,
        description: node.description
      }
    };
  }

  private generateSelector(node: any): string {
    // 基于 Accessibility Tree 生成 CSS 选择器或 XPath
    if (node.backendDOMNodeId) {
      // 如果有 backendDOMNodeId，可以生成更精确的选择器
      return `xpath=//*[@backend-dom-node-id="${node.backendDOMNodeId}"]`;
    }
    
    // 否则基于节点属性生成选择器
    if (node.name && node.role) {
      const roleSelector = node.role !== 'generic' ? `[role="${node.role}"]` : '';
      const nameSelector = node.name ? `[aria-label*="${node.name}"]` : '';
      return `${roleSelector}${nameSelector}`.trim() || '*';
    }
    
    return '*';
  }

  private determineInteractionMethod(node: any): string {
    const methodMap: Record<string, string> = {
      'button': 'click',
      'link': 'click',
      'textbox': 'type',
      'combobox': 'select',
      'checkbox': 'click',
      'radio': 'click',
      'listbox': 'select'
    };
    
    return methodMap[node.role] || 'click';
  }

  private generateDescription(node: any): string {
    const parts = [];
    
    if (node.role && node.role !== 'generic') {
      parts.push(node.role);
    }
    
    if (node.name) {
      parts.push(`"${node.name}"`);
    }
    
    if (node.description) {
      parts.push(`(${node.description})`);
    }
    
    return parts.join(' ') || 'interactive element';
  }

  private calculateConfidence(node: any): number {
    let confidence = 0.5; // 基础置信度
    
    // 有明确名称的元素置信度更高
    if (node.name) confidence += 0.2;
    
    // 有描述的元素置信度更高
    if (node.description) confidence += 0.1;
    
    // 常见交互角色置信度更高
    const highConfidenceRoles = ['button', 'link', 'textbox'];
    if (highConfidenceRoles.includes(node.role)) confidence += 0.2;
    
    return Math.min(confidence, 1.0);
  }
}
```

## 3. AI 分析器实现

### 3.1 AIAnalyzer (AI 页面分析器)

```typescript
// src/observers/AIAnalyzer.ts
export class AIAnalyzer {
  private llmClient?: LLMClient;
  private analysisCache: Map<string, PageAnalysis> = new Map();

  constructor() {
    // 尝试初始化 LLM 客户端
    this.initializeLLMClient();
  }

  async identifyElements(
    accessibilityTree: string, 
    options: ObserveOptions
  ): Promise<ObservedElement[]> {
    const cacheKey = this.generateCacheKey(accessibilityTree, options);
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!.keyElements;
    }

    if (!this.llmClient) {
      // 如果没有 LLM，回退到基于规则的方法
      throw new Error('LLM client not available');
    }

    const prompt = this.buildElementIdentificationPrompt(accessibilityTree, options);
    
    try {
      const response = await this.llmClient.complete(prompt);
      const elements = this.parseElementIdentificationResponse(response);
      
      // 缓存结果
      this.analysisCache.set(cacheKey, {
        url: '',
        title: '',
        type: 'unknown',
        keyElements: elements,
        suggestedOperations: [],
        metadata: { loadTime: 0, elementCount: elements.length, interactiveElements: 0 }
      });
      
      return elements;
    } catch (error) {
      console.warn('AI analysis failed, falling back to rule-based:', error);
      // 回退到基于规则的方法
      return this.ruleBasedFallback(accessibilityTree);
    }
  }

  async analyzePageStructure(accessibilityTree: string): Promise<{
    type: PageAnalysis['type'];
    mainContent?: PageAnalysis['mainContent'];
    suggestedOperations: OperationSuggestion[];
  }> {
    if (!this.llmClient) {
      return {
        type: 'unknown',
        suggestedOperations: []
      };
    }

    const prompt = this.buildPageAnalysisPrompt(accessibilityTree);
    
    try {
      const response = await this.llmClient.complete(prompt);
      return this.parsePageAnalysisResponse(response);
    } catch (error) {
      console.warn('Page analysis failed:', error);
      return {
        type: 'unknown',
        suggestedOperations: []
      };
    }
  }

  private buildElementIdentificationPrompt(
    accessibilityTree: string, 
    options: ObserveOptions
  ): string {
    return `
You are an expert web page analyst. Analyze the following accessibility tree and identify interactive elements.

Accessibility Tree:
${accessibilityTree}

Instructions:
${options.instruction || 'Identify all interactive elements that can be used for automation.'}

Requirements:
1. Identify buttons, links, input fields, dropdowns, and other interactive elements
2. For each element, provide:
   - A CSS selector or XPath that can locate the element
   - A clear description of what the element does
   - The interaction method (click, type, select, etc.)
   - Any required arguments
   - A confidence score (0-1)

Response format (JSON):
{
  "elements": [
    {
      "selector": "CSS selector or XPath",
      "description": "Element description",
      "method": "click|type|select",
      "arguments": [],
      "elementId": "unique_id",
      "confidence": 0.8
    }
  ]
}

Only return the JSON response, no additional text.
    `.trim();
  }

  private buildPageAnalysisPrompt(accessibilityTree: string): string {
    return `
You are an expert web page analyst. Analyze the following accessibility tree and determine the page type and main content area.

Accessibility Tree:
${accessibilityTree}

Tasks:
1. Determine the page type: article, product, form, navigation, search, or unknown
2. Identify the main content area (if applicable)
3. Suggest useful operations for this page type

Response format (JSON):
{
  "type": "article|product|form|navigation|search|unknown",
  "mainContent": {
    "selector": "CSS selector for main content",
    "description": "Description of main content area"
  },
  "suggestedOperations": [
    {
      "operation": "extractText|extractLinks|screenshot",
      "confidence": 0.8,
      "reasoning": "Why this operation is useful",
      "parameters": {}
    }
  ]
}

Only return the JSON response, no additional text.
    `.trim();
  }

  private parseElementIdentificationResponse(response: string): ObservedElement[] {
    try {
      const data = JSON.parse(response);
      if (!data.elements || !Array.isArray(data.elements)) {
        throw new Error('Invalid response format');
      }
      
      return data.elements.map((element: any) => ({
        selector: element.selector,
        description: element.description,
        method: element.method,
        arguments: element.arguments || [],
        elementId: element.elementId || generateId(),
        confidence: element.confidence || 0.5,
        metadata: element.metadata || {}
      }));
    } catch (error) {
      console.error('Failed to parse element identification response:', error);
      return [];
    }
  }

  private parsePageAnalysisResponse(response: string): {
    type: PageAnalysis['type'];
    mainContent?: PageAnalysis['mainContent'];
    suggestedOperations: OperationSuggestion[];
  } {
    try {
      const data = JSON.parse(response);
      return {
        type: data.type || 'unknown',
        mainContent: data.mainContent,
        suggestedOperations: data.suggestedOperations || []
      };
    } catch (error) {
      console.error('Failed to parse page analysis response:', error);
      return {
        type: 'unknown',
        suggestedOperations: []
      };
    }
  }

  private ruleBasedFallback(accessibilityTree: string): ObservedElement[] {
    // 实现基于规则的回退逻辑
    // 这里可以调用 PageObserver 的规则基础方法
    return [];
  }

  private generateCacheKey(accessibilityTree: string, options: ObserveOptions): string {
    return `${accessibilityTree.slice(0, 100)}_${JSON.stringify(options)}`;
  }

  private async initializeLLMClient(): Promise<void> {
    try {
      // 尝试使用现有的 OpenAI Compatible Providers
      const { LLMProvider } = await import('@webauto/openai-compatible-providers');
      this.llmClient = new LLMProvider().getClient('gpt-4o-mini', {
        apiKey: process.env.OPENAI_API_KEY
      });
    } catch (error) {
      console.warn('Failed to initialize LLM client:', error);
      this.llmClient = undefined;
    }
  }
}
```

## 4. 操作引擎实现

### 4.1 OperationEngine (操作引擎)

```typescript
// src/operations/OperationEngine.ts
export class OperationEngine {
  private operations: Map<string, PageOperation> = new Map();
  private executionHistory: ExecutionRecord[] = [];
  private config: OperationConfig;

  constructor(config: OperationConfig = {}) {
    this.config = {
      enableSmartRecovery: true,
      maxRetries: 3,
      timeout: 30000,
      ...config
    };

    this.registerBuiltinOperations();
  }

  async execute(operationName: string, params: Record<string, unknown>): Promise<unknown> {
    const operation = this.operations.get(operationName);
    if (!operation) {
      throw new Error(`Operation '${operationName}' not found`);
    }

    const executionRecord: ExecutionRecord = {
      id: generateId(),
      operation: operationName,
      params,
      startTime: new Date(),
      status: 'running'
    };

    this.executionHistory.push(executionRecord);

    try {
      // 验证参数
      const validatedParams = this.validateParameters(operation, params);
      
      // 执行操作（带重试机制）
      const result = await this.executeWithRetry(operation, validatedParams);
      
      executionRecord.endTime = new Date();
      executionRecord.status = 'completed';
      executionRecord.result = result;
      
      return result;
    } catch (error) {
      executionRecord.endTime = new Date();
      executionRecord.status = 'failed';
      executionRecord.error = error instanceof Error ? error.message : String(error);
      
      if (this.config.enableSmartRecovery) {
        return this.handleSmartRecovery(operationName, params, error);
      }
      
      throw error;
    }
  }

  private async executeWithRetry(
    operation: PageOperation, 
    params: Record<string, unknown>
  ): Promise<unknown> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await Promise.race([
          operation.execute(params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout)
          )
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries) {
          console.warn(`Operation failed (attempt ${attempt}/${this.config.maxRetries}):`, error);
          await this.delay(1000 * attempt); // 指数退避
        }
      }
    }
    
    throw lastError || new Error('Operation failed after all retries');
  }

  private registerBuiltinOperations(): void {
    // 导航操作
    this.registerOperation('navigate', {
      id: 'navigate',
      name: 'Navigate to URL',
      description: 'Navigate to a specified URL',
      parameters: [
        {
          name: 'url',
          type: 'string',
          description: 'Target URL to navigate to',
          required: true
        },
        {
          name: 'waitUntil',
          type: 'string',
          description: 'When to consider navigation complete',
          required: false,
          defaultValue: 'load'
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        await page.goto(params.url as string, {
          waitUntil: params.waitUntil as 'load' | 'domcontentloaded' | 'networkidle'
        });
        return { success: true, url: page.url() };
      }
    });

    // 点击操作
    this.registerOperation('click', {
      id: 'click',
      name: 'Click Element',
      description: 'Click on an element matching the selector',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          description: 'CSS selector or XPath for the element',
          required: true
        },
        {
          name: 'timeout',
          type: 'number',
          description: 'Maximum time to wait for element',
          required: false,
          defaultValue: 5000
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        const element = await page.waitForSelector(params.selector as string, {
          timeout: params.timeout as number
        });
        await element.click();
        return { success: true, selector: params.selector };
      }
    });

    // 输入操作
    this.registerOperation('type', {
      id: 'type',
      name: 'Type Text',
      description: 'Type text into an input field',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          description: 'CSS selector or XPath for the input field',
          required: true
        },
        {
          name: 'text',
          type: 'string',
          description: 'Text to type',
          required: true
        },
        {
          name: 'delay',
          type: 'number',
          description: 'Delay between keystrokes (ms)',
          required: false,
          defaultValue: 50
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        const element = await page.waitForSelector(params.selector as string);
        await element.fill(params.text as string, { delay: params.delay as number });
        return { success: true, selector: params.selector, text: params.text };
      }
    });

    // 智能点击操作
    this.registerOperation('smartClick', {
      id: 'smartClick',
      name: 'Smart Click',
      description: 'Intelligently find and click an element based on description',
      parameters: [
        {
          name: 'description',
          type: 'string',
          description: 'Description of the element to click',
          required: true
        },
        {
          name: 'page',
          type: 'object',
          description: 'Page object (injected by engine)',
          required: true
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        const description = params.description as string;
        
        // 使用页面观察找到匹配的元素
        // 这里需要访问 PageObserver 实例
        // 为了简化，我们使用一个基础的实现
        
        const selectors = [
          `text=${description}`,
          `[aria-label*="${description}"]`,
          `[title*="${description}"]`,
          `button:has-text("${description}")`,
          `a:has-text("${description}")`
        ];
        
        for (const selector of selectors) {
          try {
            const element = await page.waitForSelector(selector, { timeout: 2000 });
            await element.click();
            return { success: true, selector, description };
          } catch {
            continue;
          }
        }
        
        throw new Error(`Could not find element matching: ${description}`);
      }
    });

    // 提取文本操作
    this.registerOperation('extractText', {
      id: 'extractText',
      name: 'Extract Text',
      description: 'Extract text content from elements',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          description: 'CSS selector for elements to extract from',
          required: false,
          defaultValue: 'body'
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        const elements = await page.$$(params.selector as string || 'body');
        const texts = await Promise.all(
          elements.map(element => element.textContent())
        );
        return texts.filter(text => text && text.trim());
      }
    });

    // 截图操作
    this.registerOperation('screenshot', {
      id: 'screenshot',
      name: 'Take Screenshot',
      description: 'Take a screenshot of the page or element',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          description: 'CSS selector for element to screenshot (optional)',
          required: false
        },
        {
          name: 'fullPage',
          type: 'boolean',
          description: 'Whether to capture full page',
          required: false,
          defaultValue: false
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        const options: any = {
          fullPage: params.fullPage as boolean
        };
        
        if (params.selector) {
          const element = await page.$(params.selector as string);
          if (!element) {
            throw new Error(`Element not found: ${params.selector}`);
          }
          options.clip = await element.boundingBox();
        }
        
        return await page.screenshot(options);
      }
    });

    // 页面分析操作
    this.registerOperation('analyzePage', {
      id: 'analyzePage',
      name: 'Analyze Page',
      description: 'Perform comprehensive page analysis',
      parameters: [
        {
          name: 'page',
          type: 'object',
          description: 'Page object (injected by engine)',
          required: true
        }
      ],
      execute: async (params) => {
        const page = params.page as Page;
        
        // 获取页面基本信息
        const url = page.url();
        const title = await page.title();
        
        // 获取页面性能指标
        const metrics = await page.metrics();
        const timing = await page.evaluate(() => ({
          loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
          domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
        }));
        
        return {
          url,
          title,
          metrics,
          timing,
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  private validateParameters(operation: PageOperation, params: Record<string, unknown>): Record<string, unknown> {
    const validated: Record<string, unknown> = {};
    
    for (const param of operation.parameters) {
      const value = params[param.name];
      
      if (param.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter '${param.name}' is missing`);
      }
      
      if (value !== undefined) {
        // 类型验证（简化版）
        if (param.type === 'string' && typeof value !== 'string') {
          throw new Error(`Parameter '${param.name}' must be a string`);
        }
        if (param.type === 'number' && typeof value !== 'number') {
          throw new Error(`Parameter '${param.name}' must be a number`);
        }
        if (param.type === 'boolean' && typeof value !== 'boolean') {
          throw new Error(`Parameter '${param.name}' must be a boolean`);
        }
        
        validated[param.name] = value;
      } else if (param.defaultValue !== undefined) {
        validated[param.name] = param.defaultValue;
      }
    }
    
    return validated;
  }

  private async handleSmartRecovery(
    operationName: string, 
    params: Record<string, unknown>, 
    error: Error
  ): Promise<unknown> {
    console.log('Attempting smart recovery for failed operation:', operationName);
    
    // 根据操作类型尝试不同的恢复策略
    switch (operationName) {
      case 'click':
        return this.handleClickRecovery(params, error);
      case 'type':
        return this.handleTypeRecovery(params, error);
      case 'navigate':
        return this.handleNavigateRecovery(params, error);
      default:
        throw error; // 对于不支持恢复的操作，直接抛出错误
    }
  }

  private async handleClickRecovery(params: Record<string, unknown>, error: Error): Promise<unknown> {
    const page = params.page as Page;
    const selector = params.selector as string;
    
    // 尝试等待页面稳定
    await page.waitForLoadState('networkidle');
    
    // 尝试滚动到元素
    try {
      const element = await page.$(selector);
      if (element) {
        await element.scrollIntoViewIfNeeded();
        await element.click();
        return { success: true, selector, recovered: true };
      }
    } catch {
      // 忽略滚动错误，继续尝试其他方法
    }
    
    // 尝试使用 JavaScript 点击
    try {
      await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.click();
          return true;
        }
        return false;
      }, selector);
      return { success: true, selector, recovered: true, method: 'javascript' };
    } catch {
      throw error; // 所有恢复方法都失败了
    }
  }

  private async handleTypeRecovery(params: Record<string, unknown>, error: Error): Promise<unknown> {
    const page = params.page as Page;
    const selector = params.selector as string;
    const text = params.text as string;
    
    // 先清空字段
    try {
      await page.fill(selector, '');
      await page.fill(selector, text);
      return { success: true, selector, text, recovered: true };
    } catch {
      throw error;
    }
  }

  private async handleNavigateRecovery(params: Record<string, unknown>, error: Error): Promise<unknown> {
    const page = params.page as Page;
    const url = params.url as string;
    
    // 尝试重新加载页面
    await page.reload();
    
    // 等待页面完全加载
    await page.waitForLoadState('networkidle');
    
    // 再次尝试导航
    await page.goto(url, { waitUntil: 'networkidle' });
    
    return { success: true, url, recovered: true };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public registerOperation(name: string, operation: PageOperation): void {
    this.operations.set(name, operation);
  }

  public getExecutionHistory(): ExecutionRecord[] {
    return [...this.executionHistory];
  }
}
```

## 5. Cookie 管理器实现

### 5.1 CookieManager (Cookie 管理器)

```typescript
// src/core/CookieManager.ts
export class CookieManager {
  private cookieStore: Map<string, CookieDomain> = new Map();
  private storagePath: string;
  private autoSave: boolean;
  private encryptionKey?: string;

  constructor(config: CookieConfig = {}) {
    this.storagePath = config.storagePath || path.join(os.tmpdir(), 'browser-assistant-cookies');
    this.autoSave = config.autoSave || false;
    this.encryptionKey = config.encryptionKey;
    
    // 确保存储目录存在
    fs.ensureDirSync(this.storagePath);
    
    // 加载已保存的 cookies
    this.loadSavedCookies();
  }

  async saveCookies(domain: string, cookies: Cookie[]): Promise<void> {
    const cookieDomain: CookieDomain = {
      domain,
      cookies: cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        expires: cookie.expires,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite as 'Strict' | 'Lax' | 'None'
      })),
      lastAccessed: new Date().toISOString()
    };

    // 如果需要加密
    if (this.encryptionKey) {
      cookieDomain.cookies = await this.encryptCookies(cookieDomain.cookies);
    }

    this.cookieStore.set(domain, cookieDomain);
    
    // 保存到文件
    await this.persistCookies();
  }

  async loadCookies(domain: string): Promise<Cookie[]> {
    const cookieDomain = this.cookieStore.get(domain);
    if (!cookieDomain) {
      return [];
    }

    // 如果需要解密
    let cookies = cookieDomain.cookies;
    if (this.encryptionKey && this.isEncrypted(cookies)) {
      cookies = await this.decryptCookies(cookies);
    }

    // 更新访问时间
    cookieDomain.lastAccessed = new Date().toISOString();

    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || domain,
      path: cookie.path || '/',
      expires: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite
    }));
  }

  async autoSaveOnNavigation(page: Page): Promise<void> {
    if (!this.autoSave) return;

    const url = new URL(page.url());
    const domain = url.hostname;
    
    try {
      const cookies = await page.context().cookies([url.origin]);
      await this.saveCookies(domain, cookies);
    } catch (error) {
      console.warn(`Failed to auto-save cookies for ${domain}:`, error);
    }
  }

  async exportCookies(): Promise<CookieExport[]> {
    const exports: CookieExport[] = [];
    
    for (const [domain, cookieDomain] of this.cookieStore) {
      exports.push({
        domain,
        cookies: cookieDomain.cookies,
        lastAccessed: cookieDomain.lastAccessed,
        exportedAt: new Date().toISOString()
      });
    }
    
    return exports;
  }

  async importCookies(cookies: CookieExport[]): Promise<void> {
    for (const cookieExport of cookies) {
      this.cookieStore.set(cookieExport.domain, {
        domain: cookieExport.domain,
        cookies: cookieExport.cookies,
        lastAccessed: cookieExport.lastAccessed
      });
    }
    
    await this.persistCookies();
  }

  private async persistCookies(): Promise<void> {
    const filePath = path.join(this.storagePath, 'cookies.json');
    
    try {
      const data = Object.fromEntries(this.cookieStore);
      await fs.writeJSON(filePath, data, { spaces: 2 });
    } catch (error) {
      console.error('Failed to persist cookies:', error);
    }
  }

  private loadSavedCookies(): void {
    const filePath = path.join(this.storagePath, 'cookies.json');
    
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readJSONSync(filePath);
        this.cookieStore = new Map(Object.entries(data));
        
        // 清理过期的 cookies
        this.cleanupExpiredCookies();
      }
    } catch (error) {
      console.warn('Failed to load saved cookies:', error);
    }
  }

  private cleanupExpiredCookies(): void {
    const now = Date.now();
    
    for (const [domain, cookieDomain] of this.cookieStore) {
      const validCookies = cookieDomain.cookies.filter(cookie => {
        if (!cookie.expires) return true; // 会话 cookie
        return cookie.expires * 1000 > now; // 检查是否过期
      });
      
      if (validCookies.length === 0) {
        this.cookieStore.delete(domain);
      } else {
        cookieDomain.cookies = validCookies;
      }
    }
  }

  private async encryptCookies(cookies: any[]): Promise<any[]> {
    // 简化的加密实现（实际项目中应该使用更安全的加密方法）
    if (!this.encryptionKey) return cookies;
    
    return cookies.map(cookie => ({
      ...cookie,
      value: this.encrypt(cookie.value, this.encryptionKey),
      name: this.encrypt(cookie.name, this.encryptionKey)
    }));
  }

  private async decryptCookies(cookies: any[]): Promise<any[]> {
    if (!this.encryptionKey) return cookies;
    
    return cookies.map(cookie => ({
      ...cookie,
      value: this.decrypt(cookie.value, this.encryptionKey),
      name: this.decrypt(cookie.name, this.encryptionKey)
    }));
  }

  private isEncrypted(cookies: any[]): boolean {
    return cookies.some(cookie => 
      typeof cookie.value === 'string' && cookie.value.includes(':')
    );
  }

  private encrypt(text: string, key: string): string {
    // 简化的加密（实际项目中应该使用 crypto 等安全库）
    return Buffer.from(`${key}:${text}`).toString('base64');
  }

  private decrypt(encrypted: string, key: string): string {
    try {
      const decoded = Buffer.from(encrypted, 'base64').toString();
      if (decoded.startsWith(`${key}:`)) {
        return decoded.substring(key.length + 1);
      }
      return encrypted;
    } catch {
      return encrypted;
    }
  }
}
```

## 6. WebSocket 服务器实现

### 6.1 WebSocketServer (WebSocket 服务器)

```typescript
// src/websocket/WebSocketServer.ts
export class WebSocketServer {
  private server?: WebSocket.Server;
  private clients: Map<string, WebSocket> = new Map();
  private handlers: Map<string, MessageHandler> = new Map();
  private browserAssistant: BrowserAssistant;
  private config: WebSocketConfig;

  constructor(config: WebSocketConfig, browserAssistant: BrowserAssistant) {
    this.config = config;
    this.browserAssistant = browserAssistant;
    
    this.registerDefaultHandlers();
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = new WebSocket.Server({ 
        port,
        cors: this.config.cors 
      });

      this.server.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const clientId = generateClientId();
        this.clients.set(clientId, ws);
        
        console.log(`Client connected: ${clientId}`);
        
        // 发送欢迎消息
        this.sendToClient(clientId, {
          type: 'event',
          id: generateId(),
          payload: {
            event: 'connected',
            clientId,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });

        ws.on('message', async (data: WebSocket.RawData) => {
          try {
            const message = JSON.parse(data.toString());
            await this.handleMessage(clientId, message);
          } catch (error) {
            console.error('Error handling message:', error);
            this.sendToClient(clientId, {
              type: 'error',
              id: generateId(),
              payload: {
                error: 'Invalid message format',
                details: error instanceof Error ? error.message : String(error)
              },
              timestamp: new Date().toISOString()
            });
          }
        });

        ws.on('close', () => {
          this.clients.delete(clientId);
          console.log(`Client disconnected: ${clientId}`);
        });

        ws.on('error', (error) => {
          console.error(`WebSocket error for client ${clientId}:`, error);
          this.clients.delete(clientId);
        });
      });

      this.server.on('error', reject);
      this.server.on('listening', () => {
        console.log(`WebSocket server started on port ${port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('WebSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    const handler = this.handlers.get(message.type);
    
    if (!handler) {
      this.sendToClient(clientId, {
        type: 'error',
        id: generateId(),
        payload: {
          error: `Unknown message type: ${message.type}`
        },
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const response = await handler(clientId, message.payload);
      
      this.sendToClient(clientId, {
        type: 'response',
        id: message.id,
        payload: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        id: message.id,
        payload: {
          error: error instanceof Error ? error.message : String(error)
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  private registerDefaultHandlers(): void {
    // 页面导航处理器
    this.registerHandler('navigate', async (clientId, payload) => {
      const { url, options } = payload as { url: string; options?: any };
      
      const page = await this.browserAssistant.getBrowserManager().newPage();
      await page.goto(url, options);
      
      return {
        success: true,
        url: page.url(),
        title: await page.title()
      };
    });

    // 页面观察处理器
    this.registerHandler('observe', async (clientId, payload) => {
      const { url, options } = payload as { url: string; options?: ObserveOptions };
      
      const result = await this.browserAssistant.observePage(url, options);
      return result;
    });

    // 页面分析处理器
    this.registerHandler('analyze', async (clientId, payload) => {
      const { url } = payload as { url: string };
      
      const analysis = await this.browserAssistant.analyzePage(url);
      return analysis;
    });

    // 操作执行处理器
    this.registerHandler('execute', async (clientId, payload) => {
      const { operation, params } = payload as { operation: string; params: Record<string, unknown> };
      
      const result = await this.browserAssistant.executeOperation(operation, params);
      return { success: true, result };
    });

    // 截图处理器
    this.registerHandler('screenshot', async (clientId, payload) => {
      const { url, options } = payload as { url: string; options?: any };
      
      const page = await this.browserAssistant.getBrowserManager().newPage();
      await page.goto(url);
      
      const screenshot = await page.screenshot(options);
      
      // 转换为 base64
      const base64 = screenshot.toString('base64');
      return {
        success: true,
        image: `data:image/png;base64,${base64}`
      };
    });

    // 获取页面信息处理器
    this.registerHandler('getInfo', async (clientId, payload) => {
      const { url } = payload as { url: string };
      
      const page = await this.browserAssistant.getBrowserManager().newPage();
      await page.goto(url);
      
      const title = await page.title();
      const metrics = await page.metrics();
      
      return {
        url,
        title,
        metrics,
        timestamp: new Date().toISOString()
      };
    });

    // Cookie 管理处理器
    this.registerHandler('cookies', async (clientId, payload) => {
      const { action, domain, cookies } = payload as { 
        action: 'save' | 'load' | 'export' | 'import'; 
        domain?: string; 
        cookies?: any[] 
      };
      
      switch (action) {
        case 'save':
          if (!domain || !cookies) throw new Error('Domain and cookies required for save action');
          await this.browserAssistant.getCookieManager().saveCookies(domain, cookies);
          return { success: true };
          
        case 'load':
          if (!domain) throw new Error('Domain required for load action');
          const loadedCookies = await this.browserAssistant.getCookieManager().loadCookies(domain);
          return { success: true, cookies: loadedCookies };
          
        case 'export':
          const exportedCookies = await this.browserAssistant.getCookieManager().exportCookies();
          return { success: true, cookies: exportedCookies };
          
        case 'import':
          if (!cookies) throw new Error('Cookies required for import action');
          await this.browserAssistant.getCookieManager().importCookies(cookies);
          return { success: true };
          
        default:
          throw new Error(`Unknown cookie action: ${action}`);
      }
    });
  }

  public registerHandler(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  public broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    for (const [clientId, client] of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  }
}
```

## 7. 使用示例

### 7.1 基本使用示例

```typescript
// examples/basic-usage.ts
import { BrowserAssistant } from '../src';

async function basicExample() {
  const assistant = new BrowserAssistant({
    browser: {
      headless: false,
      viewport: { width: 1280, height: 720 }
    },
    observation: {
      enableAI: true,
      confidenceThreshold: 0.8
    },
    websocket: {
      enabled: true,
      port: 8080
    }
  });

  await assistant.initialize();

  try {
    // 1. 页面观察
    console.log('=== 页面观察示例 ===');
    const observeResult = await assistant.observePage('https://example.com', {
      instruction: 'Find all navigation links and buttons',
      drawOverlay: true
    });
    
    console.log(`发现 ${observeResult.elements.length} 个可操作元素:`);
    observeResult.elements.forEach(element => {
      console.log(`- ${element.description}: ${element.selector}`);
    });

    // 2. 页面分析
    console.log('\n=== 页面分析示例 ===');
    const analysis = await assistant.analyzePage('https://example.com');
    console.log(`页面类型: ${analysis.type}`);
    console.log(`标题: ${analysis.title}`);
    console.log(`元素数量: ${analysis.metadata.elementCount}`);

    // 3. 执行操作
    console.log('\n=== 操作执行示例 ===');
    await assistant.executeOperation('navigate', {
      url: 'https://example.com',
      page: await assistant.getBrowserManager().newPage()
    });

    // 4. 智能操作
    console.log('\n=== 智能操作示例 ===');
    await assistant.executeOperation('smartClick', {
      description: 'click on the more information link',
      page: await assistant.getBrowserManager().newPage()
    });

    // 5. 截图
    console.log('\n=== 截图示例 ===');
    const screenshot = await assistant.executeOperation('screenshot', {
      fullPage: true,
      page: await assistant.getBrowserManager().newPage()
    });
    console.log('截图已保存');

  } finally {
    await assistant.close();
  }
}

basicExample().catch(console.error);
```

### 7.2 高级使用示例

```typescript
// examples/advanced-usage.ts
import { BrowserAssistant } from '../src';

async function advancedExample() {
  const assistant = new BrowserAssistant({
    browser: {
      headless: false,
      viewport: { width: 1920, height: 1080 },
      cookies: [
        {
          name: 'session_id',
          value: 'example_session',
          domain: '.example.com'
        }
      ]
    },
    observation: {
      enableAI: true,
      confidenceThreshold: 0.7,
      cacheResults: true
    },
    operations: {
      enableSmartRecovery: true,
      maxRetries: 3,
      timeout: 30000
    },
    cookies: {
      autoSave: true,
      storagePath: './cookies'
    },
    websocket: {
      enabled: true,
      port: 8080,
      cors: true
    }
  });

  await assistant.initialize();

  try {
    // 1. 自动化表单填写
    console.log('=== 表单填写示例 ===');
    await assistant.executeOperation('navigate', {
      url: 'https://example.com/login',
      page: await assistant.getBrowserManager().newPage()
    });

    await assistant.executeOperation('type', {
      selector: '#username',
      text: 'testuser@example.com',
      page: await assistant.getBrowserManager().newPage()
    });

    await assistant.executeOperation('type', {
      selector: '#password',
      text: 'password123',
      page: await assistant.getBrowserManager().newPage()
    });

    await assistant.executeOperation('click', {
      selector: '#login-button',
      page: await assistant.getBrowserManager().newPage()
    });

    // 2. 数据抓取
    console.log('\n=== 数据抓取示例 ===');
    await assistant.executeOperation('navigate', {
      url: 'https://example.com/products',
      page: await assistant.getBrowserManager().newPage()
    });

    const products = await assistant.executeOperation('extractText', {
      selector: '.product-title',
      page: await assistant.getBrowserManager().newPage()
    });

    console.log(`找到 ${products.length} 个产品:`);
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product}`);
    });

    // 3. 页面监控
    console.log('\n=== 页面监控示例 ===');
    const analysis = await assistant.analyzePage('https://example.com/dashboard');
    
    if (analysis.type === 'dashboard') {
      console.log('检测到仪表板页面');
      
      // 提取关键指标
      const metrics = await assistant.executeOperation('extractText', {
        selector: '.metric-value',
        page: await assistant.getBrowserManager().newPage()
      });
      
      console.log('页面指标:', metrics);
    }

  } finally {
    await assistant.close();
  }
}

advancedExample().catch(console.error);
```

## 8. 页面分析和内容提取功能设计

### 8.1 页面类型分析功能

根据用户的具体需求，我们设计了专门的页面类型分析功能：

```typescript
// src/core/PageAnalyzer.ts
export class PageAnalyzer {
  /**
   * 页面布局类型检测
   * - 单列无限循环 (SINGLE_COLUMN_INFINITE)
   * - 单列分页 (SINGLE_COLUMN_PAGINATED) 
   * - 网格无限循环 (GRID_INFINITE)
   * - 网格分页 (GRID_PAGINATED)
   */
  async detectLayoutType(): Promise<PageLayoutType> {
    // 基于CSS布局分析和元素排列模式检测
    const hasGridLayout = await this.detectGridLayout();
    const hasPagination = await this.detectPaginationElements();
    
    if (hasGridLayout) {
      return hasPagination ? PageLayoutType.GRID_PAGINATED : PageLayoutType.GRID_INFINITE;
    }
    return hasPagination ? PageLayoutType.SINGLE_COLUMN_PAGINATED : PageLayoutType.SINGLE_COLUMN_INFINITE;
  }

  /**
   * 分页类型检测
   * - 无分页 (NONE)
   * - 加载更多按钮 (LOAD_MORE)
   * - 无限滚动 (INFINITE_SCROLL)
   * - 数字分页 (NUMBERED_PAGES)
   * - 上一页/下一页 (NEXT_PREVIOUS)
   */
  async detectPaginationType(): Promise<PaginationType> {
    // 检测各种分页元素和滚动行为
  }

  /**
   * 主内容区域识别
   */
  async findMainContentSelector(): Promise<string> {
    // 基于面积、子元素数量、语义化标签等识别主要内容
  }

  /**
   * 帖子列表容器识别
   */
  async findPostListSelector(): Promise<string> {
    // 在主内容区域内识别包含重复相似元素的容器
  }

  /**
   * 单个帖子选择器识别
   */
  async findPostItemSelector(): Promise<string> {
    // 分析容器内最相似的一级子元素组
  }
}
```

### 8.2 列表分析功能

```typescript
// src/core/ListAnalyzer.ts
export class ListAnalyzer {
  /**
   * 分析列表结构，回答用户的三个核心问题：
   * 1. 重复最多的元素selector是什么？
   * 2. 滚动后哪些元素会变化？
   * 3. 最大面积数量最多的元素是什么？
   */
  async analyzeListStructure(): Promise<ListAnalysisResult> {
    return {
      mainContainer: string,           // 主容器选择器
      postListContainer: string,       // 帖子列表容器
      postItemSelector: string,        // 单个帖子选择器
      repeatingElements: [             // 重复元素分析
        {
          selector: string,
          count: number,
          type: string,
          avgWidth: number,
          avgHeight: number
        }
      ],
      changingElements: [              // 变化元素分析
        {
          selector: string,
          changeType: 'content' | 'visibility' | 'position',
          confidence: number
        }
      ],
      largestVisibleElement: {          // 最大面积元素
        selector: string,
        area: number,
        elementCount: number
      },
      detectedPatterns: string[]       // 检测到的布局模式
    };
  }

  /**
   * 滚动变化分析
   */
  async analyzeScrollChanges(): Promise<ScrollAnalysisResult> {
    // 对比滚动前后的页面状态，识别动态加载的内容
  }
}
```

### 8.3 帖子内容提取功能

```typescript
// src/core/ContentExtractor.ts
export class ContentExtractor {
  /**
   * 提取帖子完整信息，包括：
   * - 标题、内容、作者信息
   * - 链接、图片、发布时间
   * - 交互数据（点赞、评论、分享）
   * - 评论列表和回复
   */
  async extractPosts(structure: PageStructureAnalysis): Promise<PostData[]> {
    return [{
      id: string,
      selector: string,
      title?: string,
      content?: string,
      author?: {
        name: string,
        link?: string,
        avatar?: string
      },
      link?: string,
      images?: string[],
      date?: string,
      interactions?: {
        likes?: number,
        comments?: number,
        shares?: number
      },
      metadata: {
        position: number,
        visibleArea: number,
        hasFullContent: boolean
      }
    }];
  }

  /**
   * 提取评论数据
   */
  async extractComments(postSelector: string): Promise<CommentData[]> {
    return [{
      id: string,
      author: {
        name: string,
        link?: string,
        avatar?: string
      },
      content: string,
      date?: string,
      replies?: CommentData[],  // 支持嵌套回复
      metadata: {
        position: number,
        isReply: boolean,
        depth: number
      }
    }];
  }
}
```

### 8.4 智能页面分析集成

```typescript
// src/intelligence/PageIntelligence.ts
export class PageIntelligence {
  private pageAnalyzer: PageAnalyzer;
  private listAnalyzer: ListAnalyzer;
  private contentExtractor: ContentExtractor;
  private aiAnalyzer?: AIAnalyzer;

  /**
   * 综合页面分析
   */
  async comprehensiveAnalysis(url: string): Promise<ComprehensiveAnalysis> {
    // 1. 基础页面结构分析
    const structure = await this.pageAnalyzer.analyzePageStructure();
    
    // 2. 列表结构分析
    const listAnalysis = await this.listAnalyzer.analyzeListStructure();
    
    // 3. 滚动行为分析
    const scrollAnalysis = await this.listAnalyzer.analyzeScrollChanges();
    
    // 4. 内容提取
    const content = await this.contentExtractor.extractContent(structure);
    
    // 5. AI增强分析（如果可用）
    let aiInsights: AIInsights | undefined;
    if (this.aiAnalyzer) {
      aiInsights = await this.aiAnalyzer.generatePageInsights({
        structure,
        listAnalysis,
        scrollAnalysis,
        content
      });
    }

    return {
      url,
      structure,
      listAnalysis,
      scrollAnalysis,
      content,
      aiInsights,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 针对社交媒体/论坛页面的专门分析
   */
  async analyzeSocialMediaPage(url: string): Promise<SocialMediaAnalysis> {
    const analysis = await this.comprehensiveAnalysis(url);
    
    // 专门针对社交媒体的额外分析
    return {
      ...analysis,
      socialFeatures: {
        hasUserProfiles: this.detectUserProfiles(analysis.content.posts),
        hasMediaContent: this.detectMediaContent(analysis.content.posts),
        hasInteractions: this.detectInteractions(analysis.content.posts),
        engagementLevel: this.calculateEngagementLevel(analysis.content.posts)
      }
    };
  }
}
```

### 8.5 使用示例

```typescript
// examples/page-analysis-example.ts
async function pageAnalysisExample() {
  const assistant = new BrowserAssistant({
    observation: { enableAI: true }
  });

  await assistant.initialize();

  // 1. 页面类型分析
  console.log('=== 页面类型分析 ===');
  const structure = await assistant.getPageAnalyzer().analyzePageStructure();
  console.log(`布局类型: ${structure.layoutType}`);
  console.log(`分页类型: ${structure.paginationType}`);
  console.log(`主内容: ${structure.mainContentSelector}`);
  console.log(`帖子列表: ${structure.postListSelector}`);
  console.log(`单个帖子: ${structure.postItemSelector}`);

  // 2. 列表结构分析
  console.log('\n=== 列表结构分析 ===');
  const listAnalysis = await assistant.getListAnalyzer().analyzeListStructure();
  console.log('重复最多的元素:', listAnalysis.repeatingElements[0]);
  console.log('最大面积元素:', listAnalysis.largestVisibleElement);
  console.log('变化元素:', listAnalysis.changingElements);

  // 3. 滚动变化分析
  console.log('\n=== 滚动变化分析 ===');
  const scrollAnalysis = await assistant.getListAnalyzer().analyzeScrollChanges();
  console.log(`动态元素数量: ${scrollAnalysis.dynamicElements.length}`);
  console.log(`无限滚动检测: ${scrollAnalysis.infiniteScrollDetected}`);
  console.log(`分页检测: ${scrollAnalysis.paginationDetected}`);

  // 4. 内容提取
  console.log('\n=== 内容提取 ===');
  const content = await assistant.getContentExtractor().extractContent(structure);
  console.log(`提取帖子数量: ${content.posts.length}`);
  
  content.posts.slice(0, 3).forEach((post, index) => {
    console.log(`\n帖子 ${index + 1}:`);
    console.log(`  标题: ${post.title || '无标题'}`);
    console.log(`  作者: ${post.author?.name || '未知'}`);
    console.log(`  内容长度: ${post.content?.length || 0}`);
    console.log(`  图片数量: ${post.images?.length || 0}`);
    if (post.comments) {
      console.log(`  评论数量: ${post.comments.length}`);
    }
  });

  await assistant.close();
}
```

## 9. 完整的实现计划

这个增强的详细设计现在包含了完整的页面分析和内容提取功能：

### 9.1 核心功能模块
1. **页面类型分析**: 智能识别单列/网格、无限/分页布局
2. **列表结构分析**: 识别重复元素、变化元素、最大面积元素
3. **内容提取**: 提取帖子标题、内容、作者、图片、评论等
4. **滚动行为分析**: 检测动态加载和分页机制
5. **AI增强分析**: 结合LLM提供智能页面理解

### 9.2 技术优势
1. **基于Accessibility Tree**: 更准确的页面结构理解
2. **多层级分析**: 从布局到内容的完整分析链路
3. **智能元素识别**: 基于规则和AI的混合方法
4. **性能优化**: 缓存机制和增量分析
5. **扩展性**: 支持自定义分析规则和提取器

### 9.3 应用场景
1. **社交媒体监控**: 自动提取帖子、评论、用户信息
2. **论坛内容分析**: 识别帖子结构、提取讨论内容
3. **电商页面分析**: 产品信息提取、价格监控
4. **新闻网站抓取**: 文章内容、发布时间、作者信息
5. **数据挖掘**: 大规模网页内容结构化提取

这个实现将为你提供一个强大而智能的浏览器自动化工具，能够准确分析各种类型的网页，特别是社交媒体和论坛页面，并提取结构化的内容数据。