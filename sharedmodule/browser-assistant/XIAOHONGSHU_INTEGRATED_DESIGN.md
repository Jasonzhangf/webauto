# 小红书MCP集成设计与实现文档

## 📋 项目概述

基于对xiaohongshu-mcp项目的深入分析，结合stagehand的智能观察模式和Camoufox的浏览器自动化能力，我们将创建一个功能强大、智能化的浏览器自动化助手模块。该模块将支持复杂的社交媒体自动化操作，特别是小红书等平台的内容交互。

## 🎯 核心设计理念

### 1. **智能自动化模式**
- **Stagehand模式**: 基于可访问性树的智能元素识别
- **xiaohongshu-mcp模式**: 针对特定平台的优化交互策略
- **Camoufox优势**: 反指纹检测和完整Playwright API支持

### 2. **模块化架构**
- 每个操作独立封装，易于扩展和维护
- 支持多种浏览器自动化策略
- 提供统一的接口和错误处理机制

### 3. **AI驱动分析**
- 集成LLM进行页面理解和操作建议
- 智能元素识别和分类
- 动态内容处理和状态管理

## 🏗️ 整体架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Assistant Module                  │
├─────────────────────────────────────────────────────────────┤
│  🎯 Application Layer                                       │
│  ├── XiaohongshuActions (小红书专用操作)                    │
│  ├── SocialMediaActions (通用社交媒体操作)                  │
│  └── UniversalActions (通用浏览器操作)                       │
├─────────────────────────────────────────────────────────────┤
│  🧠 Intelligence Layer                                      │
│  ├── PageAnalyzer (页面分析器)                             │
│  ├── AIAssistant (AI操作建议)                              │
│  └── ContentExtractor (智能内容提取)                        │
├─────────────────────────────────────────────────────────────┤
│  🎮 Operations Layer                                        │
│  ├── PageOperationCenter (页面操作中心)                      │
│  ├── ElementSelector (智能元素选择器)                       │
│  └── InteractionEngine (交互引擎)                          │
├─────────────────────────────────────────────────────────────┤
│  🌐 Browser Management Layer                                │
│  ├── CamoufoxManager (Camoufox浏览器管理)                   │
│  ├── CookieManager (Cookie管理器)                           │
│  └── WebSocketServer (实时控制接口)                         │
├─────────────────────────────────────────────────────────────┤
│  🔧 Infrastructure Layer                                     │
│  ├── BaseModule (RCC基础模块)                              │
│  ├── ErrorHandler (错误处理器)                              │
│  └── UnderConstruction (未完成功能管理)                     │
└─────────────────────────────────────────────────────────────┘
```

## 📋 详细组件设计

### 1. **Application Layer - 应用层**

#### 1.1 XiaohongshuActions (小红书专用操作)

```typescript
// src/actions/XiaohongshuActions.ts
export class XiaohongshuActions extends BaseSocialMediaActions {
  private readonly baseUrl = 'https://www.xiaohongshu.com';
  
  constructor(
    browserManager: CamoufoxManager,
    operationCenter: PageOperationCenter,
    aiAssistant: AIAssistant
  ) {
    super(browserManager, operationCenter, aiAssistant);
  }

  /**
   * 检查登录状态 - 基于xiaohongshu-mcp模式
   */
  async checkLoginStatus(): Promise<LoginStatus> {
    const page = await this.browserManager.getCurrentPage();
    
    // 智能检测多种登录状态指示器
    const loginSelectors = [
      '.main-container .user .link-wrapper .channel',
      '.user-info .avatar',
      '.header .user-menu'
    ];

    for (const selector of loginSelectors) {
      const exists = await page.$(selector);
      if (exists) {
        return { isLoggedIn: true, indicator: selector };
      }
    }

    return { isLoggedIn: false };
  }

  /**
   * 登录操作 - 多策略实现
   */
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const page = await this.browserManager.getCurrentPage();
    
    // 导航到登录页面
    await page.goto(`${this.baseUrl}/login`);
    
    // 智能等待登录表单加载
    await this.waitForLoginForm(page);
    
    // 多策略登录表单处理
    const loginStrategies = [
      () => this.loginWithUsernamePassword(page, credentials),
      () => this.loginWithQRCode(page),
      () => this.loginWithMobile(page, credentials)
    ];

    for (const strategy of loginStrategies) {
      try {
        const result = await strategy();
        if (result.success) {
          return result;
        }
      } catch (error) {
        this.logger.warn(`Login strategy failed: ${error.message}`);
      }
    }

    throw new Error('All login strategies failed');
  }

  /**
   * 发布内容 - 基于xiaohongshu-mcp的完整实现
   */
  async publishContent(content: PublishContent): Promise<PublishResult> {
    const page = await this.browserManager.getCurrentPage();
    
    // 1. 导航到发布页面
    await page.goto(`${this.baseUrl}/publisher`);
    await this.waitForPublisherReady(page);
    
    // 2. 智能内容输入 - 支持多种编辑器类型
    await this.inputContent(page, content);
    
    // 3. 图片上传 - 多种上传策略
    if (content.images?.length) {
      await this.uploadImages(page, content.images);
    }
    
    // 4. 标签处理
    if (content.tags?.length) {
      await this.addTags(page, content.tags);
    }
    
    // 5. 发布操作
    return await this.submitPublish(page);
  }

  /**
   * 获取笔记列表 - 智能内容提取
   */
  async getNotesList(options: NotesListOptions): Promise<NotesListResult> {
    const page = await this.browserManager.getCurrentPage();
    
    // 构建搜索或主页URL
    const url = this.buildNotesListUrl(options);
    await page.goto(url);
    
    // 等待页面加载完成
    await this.waitForNotesLoaded(page);
    
    // 智能提取笔记数据
    return await this.extractNotesData(page, options);
  }

  /**
   * 提取单篇笔记详情
   */
  async extractNoteDetails(noteUrl: string): Promise<NoteDetails> {
    const page = await this.browserManager.getCurrentPage();
    await page.goto(noteUrl);
    
    // 等待笔记详情页面加载
    await this.waitForNoteDetails(page);
    
    // 多层次内容提取
    return {
      basicInfo: await this.extractBasicInfo(page),
      content: await this.extractNoteContent(page),
      author: await this.extractAuthorInfo(page),
      images: await this.extractImages(page),
      comments: await this.extractComments(page),
      relatedNotes: await this.extractRelatedNotes(page)
    };
  }

  // 私有方法实现...
}
```

#### 1.2 SocialMediaActions (通用社交媒体操作)

```typescript
// src/actions/SocialMediaActions.ts
export abstract class SocialMediaActions extends BaseBrowserModule {
  protected browserManager: CamoufoxManager;
  protected operationCenter: PageOperationCenter;
  protected aiAssistant: AIAssistant;

  constructor(
    browserManager: CamoufoxManager,
    operationCenter: PageOperationCenter,
    aiAssistant: AIAssistant
  ) {
    super('SocialMediaActions');
    this.browserManager = browserManager;
    this.operationCenter = operationCenter;
    this.aiAssistant = aiAssistant;
  }

  /**
   * 通用页面类型分析
   */
  async analyzePageType(): Promise<PageAnalysisResult> {
    const page = await this.browserManager.getCurrentPage();
    
    // 使用AI分析器进行页面类型识别
    const analysis = await this.aiAssistant.analyzePageStructure(page);
    
    // 验证和补充分析结果
    const validated = await this.validatePageAnalysis(analysis);
    
    return validated;
  }

  /**
   * 智能滚动和内容加载
   */
  async smartScrollForContent(options: SmartScrollOptions): Promise<ScrollResult> {
    const page = await this.browserManager.getCurrentPage();
    
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxAttempts = options.maxAttempts || 10;
    let loadedItems: any[] = [];

    while (scrollAttempts < maxAttempts) {
      // 滚动页面
      await this.operationCenter.scroll(page, {
        amount: options.scrollAmount || 1000,
        direction: 'down',
        smooth: true
      });

      // 等待新内容加载
      await this.sleep(options.waitTime || 2000);

      // 检查页面高度变化
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === previousHeight) {
        // 页面高度未变化，检查是否有新内容
        const newItems = await this.detectNewContent(page, loadedItems);
        if (newItems.length === 0) {
          break; // 没有新内容，结束滚动
        }
        loadedItems = [...loadedItems, ...newItems];
      } else {
        previousHeight = currentHeight;
      }

      scrollAttempts++;
    }

    return {
      scrollCount: scrollAttempts,
      totalItems: loadedItems.length,
      hasMoreContent: scrollAttempts < maxAttempts
    };
  }

  /**
   * 智能内容提取 - 基于页面类型
   */
  async extractContentByPageType(pageType: PageType): Promise<ContentExtractionResult> {
    const page = await this.browserManager.getCurrentPage();
    
    switch (pageType) {
      case 'single-column-infinite':
        return await this.extractSingleColumnContent(page);
      case 'single-column-paginated':
        return await this.extractPaginatedContent(page);
      case 'grid-infinite':
        return await this.extractGridContent(page);
      case 'grid-paginated':
        return await this.extractGridPaginatedContent(page);
      default:
        return await this.extractGenericContent(page);
    }
  }

  // 抽象方法，子类需要实现
  abstract checkLoginStatus(): Promise<any>;
  abstract login(credentials: any): Promise<any>;
  abstract publishContent(content: any): Promise<any>;
}
```

### 2. **Intelligence Layer - 智能层**

#### 2.1 AIAssistant (AI操作建议)

```typescript
// src/intelligence/AIAssistant.ts
export class AIAssistant extends BaseBrowserModule {
  private llmClient: any; // LLM客户端
  private promptTemplates: Map<string, string>;

  constructor(llmClient?: any) {
    super('AIAssistant');
    this.llmClient = llmClient;
    this.initializePromptTemplates();
  }

  /**
   * 页面结构分析
   */
  async analyzePageStructure(page: Page): Promise<PageAnalysis> {
    // 获取页面可访问性树
    const accessibilityTree = await page.accessibility.snapshot();
    
    // 获取页面DOM结构
    const domStructure = await this.extractDOMStructure(page);
    
    // 构建分析提示
    const prompt = this.buildAnalysisPrompt(accessibilityTree, domStructure);
    
    // 调用AI进行分析
    const analysis = await this.callLLM(prompt, {
      schema: PageAnalysisSchema
    });
    
    return analysis;
  }

  /**
   * 智能元素识别
   */
  async identifyElements(page: Page, context: ElementContext): Promise<ElementIdentification[]> {
    const screenshot = await page.screenshot();
    const accessibilityTree = await page.accessibility.snapshot();
    
    const prompt = this.buildElementIdentificationPrompt(
      screenshot, accessibilityTree, context
    );
    
    return await this.callLLM(prompt, {
      schema: ElementIdentificationSchema
    });
  }

  /**
   * 操作建议生成
   */
  async suggestOperations(page: Page, goal: string): Promise<OperationSuggestion[]> {
    const currentState = await this.getCurrentPageState(page);
    
    const prompt = this.buildOperationSuggestionPrompt(currentState, goal);
    
    return await this.callLLM(prompt, {
      schema: OperationSuggestionSchema
    });
  }

  // 私有方法...
}
```

#### 2.2 PageAnalyzer (页面分析器)

```typescript
// src/intelligence/PageAnalyzer.ts
export class PageAnalyzer extends BaseBrowserModule {
  private aiAssistant: AIAssistant;

  constructor(aiAssistant: AIAssistant) {
    super('PageAnalyzer');
    this.aiAssistant = aiAssistant;
  }

  /**
   * 页面布局类型分析
   */
  async analyzeLayoutType(page: Page): Promise<LayoutAnalysis> {
    // 获取页面主要容器
    const containers = await this.extractMainContainers(page);
    
    // 分析布局模式
    const layoutPattern = await this.analyzeLayoutPattern(containers);
    
    // 判断是否为无限滚动或分页
    const scrollType = await this.detectScrollType(page);
    
    // 分析网格或单列布局
    const gridType = await this.analyzeGridType(containers);
    
    return {
      layout: layoutPattern,
      scrollType,
      gridType,
      containers: containers.map(c => ({
        selector: c.selector,
        elementCount: c.elementCount,
        repeatPattern: c.repeatPattern
      }))
    };
  }

  /**
   * 主帖子列表分析
   */
  async analyzePostListStructure(page: Page): Promise<PostListAnalysis> {
    // 使用AI分析帖子列表结构
    const aiAnalysis = await this.aiAssistant.analyzePageStructure(page);
    
    // 验证和提取帖子容器
    const postContainer = await this.findPostContainer(page, aiAnalysis);
    
    // 分析帖子元素模式
    const postPattern = await this.analyzePostElements(page, postContainer);
    
    return {
      containerSelector: postContainer.selector,
      postSelector: postPattern.selector,
      postElements: postPattern.elements,
      repeatPattern: postPattern.repeatPattern
    };
  }

  /**
   * 可视元素分析
   */
  async analyzeVisibleElements(page: Page): Promise<VisibleElementsAnalysis> {
    // 获取可视区域内的元素
    const visibleElements = await this.getVisibleElements(page);
    
    // 分析重复模式
    const repeatedElements = await this.analyzeRepeatingElements(visibleElements);
    
    // 找出最大面积的元素
    const largestElements = await this.findLargestElements(visibleElements);
    
    return {
      totalElements: visibleElements.length,
      mostRepeated: repeatedElements,
      largestByArea: largestElements,
      patterns: await this.analyzeElementPatterns(visibleElements)
    };
  }
}
```

### 3. **Operations Layer - 操作层**

我们已经实现了完整的PageOperationCenter，现在需要添加智能元素选择器。

#### 3.1 SmartElementSelector (智能元素选择器)

```typescript
// src/operations/SmartElementSelector.ts
export class SmartElementSelector extends BaseBrowserModule {
  private aiAssistant: AIAssistant;
  private fallbackStrategies: Map<string, SelectorStrategy[]>;

  constructor(aiAssistant: AIAssistant) {
    super('SmartElementSelector');
    this.aiAssistant = aiAssistant;
    this.initializeFallbackStrategies();
  }

  /**
   * 智能元素选择 - 多策略实现
   */
  async selectElement(page: Page, context: ElementContext): Promise<ElementSelection> {
    // 策略1: AI智能识别
    try {
      const aiSelection = await this.selectWithAI(page, context);
      if (aiSelection.confidence > 0.8) {
        return aiSelection;
      }
    } catch (error) {
      this.logger.warn('AI selection failed, trying fallback strategies');
    }

    // 策略2: 传统CSS选择器
    const cssSelection = await this.selectWithCSS(page, context);
    if (cssSelection.found) {
      return cssSelection;
    }

    // 策略3: 属性选择器
    const attrSelection = await this.selectWithAttributes(page, context);
    if (attrSelection.found) {
      return attrSelection;
    }

    // 策略4: 文本内容匹配
    const textSelection = await this.selectWithText(page, context);
    if (textSelection.found) {
      return textSelection;
    }

    throw new ElementNotFoundError(`Cannot find element for context: ${JSON.stringify(context)}`);
  }

  /**
   * 基于AI的元素选择
   */
  private async selectWithAI(page: Page, context: ElementContext): Promise<ElementSelection> {
    const screenshot = await page.screenshot();
    const accessibilityTree = await page.accessibility.snapshot();
    
    const identifications = await this.aiAssistant.identifyElements(page, {
      screenshot,
      accessibilityTree,
      context
    });

    // 选择置信度最高的元素
    const bestMatch = identifications.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return {
      element: await page.$(bestMatch.selector),
      selector: bestMatch.selector,
      confidence: bestMatch.confidence,
      method: 'ai'
    };
  }

  /**
   * 竞争式元素选择 - 基于xiaohongshu-mcp模式
   */
  async raceElementSelection(page: Page, selectors: string[]): Promise<ElementSelection> {
    const timeout = 5000; // 5秒超时
    
    return Promise.race(
      selectors.map(async (selector) => {
        try {
          const element = await page.waitForSelector(selector, { timeout });
          return {
            element,
            selector,
            confidence: 0.9,
            method: 'race'
          };
        } catch {
          throw new Error(`Selector ${selector} not found`);
        }
      })
    );
  }
}
```

### 4. **Browser Management Layer - 浏览器管理层**

#### 4.1 CamoufoxManager (Camoufox浏览器管理器)

```typescript
// src/browser/CamoufoxManager.ts
export class CamoufoxManager extends BaseBrowserModule {
  private browser: CamoufoxBrowser | null = null;
  private context: CamoufoxContext | null = null;
  private page: Page | null = null;
  private cookieManager: CookieManager;
  private config: CamoufoxConfig;

  constructor(config: CamoufoxConfig = {}) {
    super('CamoufoxManager');
    this.config = { ...defaultConfig, ...config };
    this.cookieManager = new CookieManager();
  }

  /**
   * 初始化浏览器 - 基于xiaohongshu-mcp模式
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // 启动Camoufox浏览器
    this.browser = await camoufox.launch({
      headless: this.config.headless,
      args: this.config.browserArgs,
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: this.config.launchTimeout
    });

    // 创建浏览器上下文
    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      ignoreHTTPSErrors: true
    });

    // 创建新页面
    this.page = await this.context.newPage();
    
    // 设置页面超时
    this.page.setDefaultTimeout(this.config.defaultTimeout);
    
    // 加载Cookie
    await this.cookieManager.loadCookies(this.context);

    this.logger.info('Camoufox browser initialized successfully');
  }

  /**
   * 获取当前页面
   */
  async getCurrentPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }

  /**
   * 创建新页面实例 - 基于xiaohongshu-mcp的fresh instance模式
   */
  async createFreshPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }
    
    const newPage = await this.context.newPage();
    newPage.setDefaultTimeout(this.config.defaultTimeout);
    
    return newPage;
  }

  /**
   * 重启浏览器
   */
  async restart(): Promise<void> {
    await this.cleanup();
    await this.initialize();
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    await super.cleanup();
  }
}
```

#### 4.2 CookieManager (Cookie管理器)

```typescript
// src/browser/CookieManager.ts
export class CookieManager extends BaseBrowserModule {
  private cookieStorage: Map<string, CookieData[]>;
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    super('CookieManager');
    this.cookieStorage = new Map();
    this.encryptionKey = encryptionKey || 'default-key';
  }

  /**
   * 加载Cookie - 按域名
   */
  async loadCookies(context: CamoufoxContext, domain?: string): Promise<void> {
    if (domain) {
      const cookies = await this.loadDomainCookies(domain);
      if (cookies.length > 0) {
        await context.addCookies(cookies);
        this.logger.info(`Loaded ${cookies.length} cookies for domain: ${domain}`);
      }
    } else {
      // 加载所有Cookie
      for (const [domain, cookies] of this.cookieStorage) {
        if (cookies.length > 0) {
          await context.addCookies(cookies);
        }
      }
    }
  }

  /**
   * 保存Cookie - 按域名分类
   */
  async saveCookies(page: Page): Promise<void> {
    const cookies = await page.context().cookies();
    
    // 按域名分组
    const domainGroups = this.groupCookiesByDomain(cookies);
    
    // 加密并保存
    for (const [domain, domainCookies] of domainGroups) {
      const encrypted = await this.encryptCookies(domainCookies);
      this.cookieStorage.set(domain, encrypted);
      
      // 持久化到文件系统
      await this.persistCookies(domain, encrypted);
    }
    
    this.logger.info(`Saved cookies for ${domainGroups.size} domains`);
  }

  /**
   * 清除指定域名的Cookie
   */
  async clearDomainCookies(domain: string): Promise<void> {
    this.cookieStorage.delete(domain);
    await this.removePersistedCookies(domain);
    this.logger.info(`Cleared cookies for domain: ${domain}`);
  }
}
```

## 🎯 核心使用场景

### 1. **小红书自动化操作**

```typescript
// 使用示例
async function xiaohongshuAutomationExample() {
  // 1. 初始化组件
  const browserManager = new CamoufoxManager({ headless: false });
  const operationCenter = new PageOperationCenter();
  const aiAssistant = new AIAssistant();
  const xiaohongshuActions = new XiaohongshuActions(
    browserManager, 
    operationCenter, 
    aiAssistant
  );

  // 2. 初始化浏览器
  await browserManager.initialize();

  try {
    // 3. 检查登录状态
    const loginStatus = await xiaohongshuActions.checkLoginStatus();
    
    if (!loginStatus.isLoggedIn) {
      // 4. 执行登录
      const loginResult = await xiaohongshuActions.login({
        username: 'your_username',
        password: 'your_password'
      });
      console.log('Login result:', loginResult);
    }

    // 5. 发布内容
    const publishResult = await xiaohongshuActions.publishContent({
      title: '测试笔记标题',
      content: '这是一条测试笔记内容',
      images: ['/path/to/image1.jpg', '/path/to/image2.jpg'],
      tags: ['测试', '自动化']
    });

    console.log('Publish result:', publishResult);

    // 6. 获取笔记列表
    const notesList = await xiaohongshuActions.getNotesList({
      type: 'user_notes',
      limit: 20
    });

    console.log('Notes list:', notesList);

  } finally {
    // 7. 清理资源
    await browserManager.cleanup();
  }
}
```

### 2. **智能页面分析**

```typescript
// 智能页面分析示例
async function intelligentPageAnalysisExample() {
  const browserManager = new CamoufoxManager();
  const pageAnalyzer = new PageAnalyzer(new AIAssistant());
  
  await browserManager.initialize();
  const page = await browserManager.getCurrentPage();
  
  try {
    // 导航到目标页面
    await page.goto('https://www.xiaohongshu.com/explore');
    
    // 1. 分析页面布局类型
    const layoutAnalysis = await pageAnalyzer.analyzeLayoutType(page);
    console.log('Layout analysis:', layoutAnalysis);
    
    // 2. 分析帖子列表结构
    const postListAnalysis = await pageAnalyzer.analyzePostListStructure(page);
    console.log('Post list analysis:', postListAnalysis);
    
    // 3. 分析可视元素
    const visibleAnalysis = await pageAnalyzer.analyzeVisibleElements(page);
    console.log('Visible elements analysis:', visibleAnalysis);
    
    // 4. 智能滚动加载更多内容
    const scrollResult = await pageAnalyzer.smartScrollForContent({
      maxAttempts: 5,
      waitTime: 2000
    });
    console.log('Scroll result:', scrollResult);
    
  } finally {
    await browserManager.cleanup();
  }
}
```

### 3. **通用浏览器自动化**

```typescript
// 通用自动化示例
async function generalAutomationExample() {
  const browserManager = new CamoufoxManager();
  const operationCenter = new PageOperationCenter();
  const elementSelector = new SmartElementSelector(new AIAssistant());
  
  await browserManager.initialize();
  const page = await browserManager.getCurrentPage();
  
  try {
    // 1. 导航到网站
    await operationCenter.navigate(page, 'https://example.com');
    
    // 2. 智能点击登录按钮
    const loginButton = await elementSelector.selectElement(page, {
      type: 'button',
      text: '登录',
      context: 'login_page'
    });
    await operationCenter.click(page, loginButton.element);
    
    // 3. 智能填写表单
    const usernameField = await elementSelector.selectElement(page, {
      type: 'input',
      attributes: { type: 'text', name: 'username' }
    });
    await operationCenter.type(page, usernameField.element, 'testuser');
    
    // 4. 提取页面内容
    const content = await operationCenter.extractContent(page, {
      includeLinks: true,
      includeImages: true
    });
    console.log('Extracted content:', content);
    
  } finally {
    await browserManager.cleanup();
  }
}
```

## 🔧 配置和部署

### 1. **模块配置**

```typescript
// config/default.ts
export const defaultConfig = {
  // Camoufox配置
  camoufox: {
    headless: process.env.HEADLESS !== 'false',
    launchTimeout: 30000,
    defaultTimeout: 10000,
    viewport: { width: 1920, height: 1080 },
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  },
  
  // AI配置
  ai: {
    enabled: true,
    model: process.env.AI_MODEL || 'gpt-4',
    apiKey: process.env.AI_API_KEY,
    maxTokens: 2000,
    temperature: 0.1
  },
  
  // 操作配置
  operations: {
    defaultTimeout: 10000,
    retryCount: 3,
    waitAfterAction: 500,
    scrollDelay: 1000
  },
  
  // Cookie配置
  cookies: {
    encryptionKey: process.env.COOKIE_ENCRYPTION_KEY,
    storagePath: './cookies/',
    autoSave: true
  }
};
```

### 2. **环境变量**

```bash
# .env
# Camoufox配置
HEADLESS=false
CAMOUFOX_TIMEOUT=30000

# AI配置
AI_MODEL=gpt-4
AI_API_KEY=your_ai_api_key

# 安全配置
COOKIE_ENCRYPTION_KEY=your_encryption_key

# 调试配置
DEBUG_LEVEL=info
LOG_FILE=./logs/browser-assistant.log
```

## 📈 性能优化和监控

### 1. **性能优化策略**

```typescript
// src/optimization/PerformanceOptimizer.ts
export class PerformanceOptimizer extends BaseBrowserModule {
  private metrics: PerformanceMetrics[] = [];
  
  async optimizePagePerformance(page: Page): Promise<void> {
    // 禁用不必要的功能
    await page.route('**/*.{png,jpg,jpeg,webp}', route => route.abort());
    await page.route('**/*.css', route => route.continue());
    await page.route('**/*.js', route => route.continue());
    
    // 启用缓存
    await page.setCacheEnabled(true);
    
    // 优化页面加载
    await page.evaluate(() => {
      // 禁用动画
      document.body.style.setProperty('transition', 'none', 'important');
      
      // 预加载关键资源
      const links = document.querySelectorAll('link[rel="preload"]');
      links.forEach(link => {
        if (link.getAttribute('as') === 'script') {
          const script = document.createElement('script');
          script.src = link.getAttribute('href');
          document.head.appendChild(script);
        }
      });
    });
  }
  
  async measureOperationPerformance(operation: string, startTime: number): Promise<void> {
    const duration = Date.now() - startTime;
    this.metrics.push({
      operation,
      duration,
      timestamp: new Date()
    });
    
    // 记录慢操作
    if (duration > 5000) {
      this.logger.warn(`Slow operation detected: ${operation} took ${duration}ms`);
    }
  }
}
```

### 2. **监控和日志**

```typescript
// src/monitoring/MonitoringService.ts
export class MonitoringService extends BaseBrowserModule {
  private operationMetrics: Map<string, OperationMetric> = new Map();
  
  async recordOperation(operation: string, success: boolean, duration: number): Promise<void> {
    const key = `${operation}_${success ? 'success' : 'failure'}`;
    const existing = this.operationMetrics.get(key) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0
    };
    
    existing.count++;
    existing.totalDuration += duration;
    existing.avgDuration = existing.totalDuration / existing.count;
    
    this.operationMetrics.set(key, existing);
    
    // 记录到日志
    this.logger.info(`Operation ${operation} ${success ? 'succeeded' : 'failed'} in ${duration}ms`);
  }
  
  async getPerformanceReport(): Promise<PerformanceReport> {
    const report: PerformanceReport = {
      totalOperations: 0,
      successRate: 0,
      averageDuration: 0,
      topSlowOperations: []
    };
    
    // 计算统计数据
    let totalOps = 0;
    let successOps = 0;
    let totalDuration = 0;
    
    for (const [key, metric] of this.operationMetrics) {
      totalOps += metric.count;
      totalDuration += metric.totalDuration;
      
      if (key.includes('success')) {
        successOps += metric.count;
      }
    }
    
    report.totalOperations = totalOps;
    report.successRate = totalOps > 0 ? successOps / totalOps : 0;
    report.averageDuration = totalOps > 0 ? totalDuration / totalOps : 0;
    
    // 找出最慢的操作
    const slowOps = Array.from(this.operationMetrics.entries())
      .sort(([, a], [, b]) => b.avgDuration - a.avgDuration)
      .slice(0, 5);
    
    report.topSlowOperations = slowOps.map(([key, metric]) => ({
      operation: key.replace('_success', '').replace('_failure', ''),
      averageDuration: metric.avgDuration,
      count: metric.count
    }));
    
    return report;
  }
}
```

## 🎯 实现计划

### Phase 1: 核心基础设施 (Week 1-2)
- [x] 完成架构设计和文档
- [x] 实现基础模块和接口定义
- [x] 完成PageOperationCenter
- [ ] 实现CamoufoxManager
- [ ] 实现CookieManager
- [ ] 实现SmartElementSelector

### Phase 2: 智能功能 (Week 3-4)
- [ ] 实现AIAssistant
- [ ] 实现PageAnalyzer
- [ ] 实现智能内容提取
- [ ] 实现页面类型分析
- [ ] 集成Stagehand的observe功能

### Phase 3: 应用层功能 (Week 5-6)
- [ ] 实现XiaohongshuActions
- [ ] 实现通用社交媒体操作
- [ ] 实现WebSocket控制接口
- [ ] 完善错误处理和恢复机制

### Phase 4: 测试和优化 (Week 7-8)
- [ ] 编写全面的测试用例
- [ ] 性能优化和监控
- [ ] 文档完善和示例
- [ ] 发布准备和CI/CD

## 🚀 快速开始

```typescript
// 快速开始示例
import { 
  CamoufoxManager, 
  PageOperationCenter, 
  XiaohongshuActions,
  AIAssistant 
} from '@webauto/browser-assistant';

async function quickStart() {
  // 初始化组件
  const browserManager = new CamoufoxManager();
  const operationCenter = new PageOperationCenter();
  const aiAssistant = new AIAssistant();
  const xiaohongshu = new XiaohongshuActions(
    browserManager, 
    operationCenter, 
    aiAssistant
  );

  // 启动浏览器
  await browserManager.initialize();

  try {
    // 执行操作
    const status = await xiaohongshu.checkLoginStatus();
    console.log('Login status:', status);
    
  } finally {
    // 清理资源
    await browserManager.cleanup();
  }
}

quickStart();
```

这个综合设计文档结合了stagehand的智能观察模式、xiaohongshu-mcp的实用操作模式和Camoufox的技术优势，提供了一个功能完整、架构清晰的浏览器自动化解决方案。