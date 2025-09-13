# Browser Assistant Architecture Design

## 概述

Browser Assistant 是一个基于 Camoufox 的智能浏览器自动化工具，结合了 stagehand 的页面观察理念和 AI 智能分析能力，提供页面结构分析和抽象操作生成功能。

## 核心设计理念

### 1. 智能页面观察 (Inspired by Stagehand)
- 基于 Accessibility Tree 进行页面结构分析
- AI 驱动的元素识别和语义理解
- 生成可执行的抽象操作
- 支持自然语言指令到操作的转换

### 2. Camoufox 增强
- 利用 Camoufox 的反指纹识别能力
- 基于 Firefox 的轻量级自动化
- 完整的 Playwright API 兼容性
- DevTools Protocol 支持

### 3. 抽象操作层
- 将复杂的浏览器操作抽象为语义化的操作
- 支持操作的重放和缓存
- 智能参数推导和验证
- 错误处理和自愈机制

## 架构组件

### 1. BrowserManager (浏览器管理器)
**职责**: 管理 Camoufox 浏览器实例的生命周期

```typescript
class BrowserManager {
  private browser: CamoufoxBrowser;
  private contexts: Map<string, BrowserContext>;
  private cookieManager: CookieManager;
  
  // 核心功能
  async launch(config: BrowserConfig): Promise<BrowserManager>
  async newContext(config?: ContextConfig): Promise<BrowserContext>
  async close(): Promise<void>
  async getCDPSession(page: Page): Promise<CDPSession>
}
```

**关键特性**:
- 支持多实例管理
- 自动 Cookie 按域名加载
- CDP 会话管理
- 资源清理和错误恢复

### 2. PageObserver (页面观察器)
**职责**: 智能分析页面结构，识别可操作元素

```typescript
class PageObserver {
  private accessibilityTree: AccessibilityTreeParser;
  private aiAnalyzer: AIElementAnalyzer;
  private elementCache: Map<string, ObservedElement>;
  
  // 核心功能
  async observe(page: Page, options: ObserveOptions): Promise<ObserveResult>
  async analyzePage(page: Page): Promise<PageAnalysis>
  async getAccessibilityTree(page: Page): Promise<AccessibilityNode>
  async suggestOperations(elements: ObservedElement[]): Promise<OperationSuggestion[]>
}
```

**关键特性**:
- 基于 Accessibility Tree 的页面解析
- AI 驱动的元素识别和分类
- 语义化操作建议生成
- 智能置信度评估

### 3. OperationEngine (操作引擎)
**职责**: 执行抽象操作，提供错误处理和自愈

```typescript
class OperationEngine {
  private operations: Map<string, PageOperation>;
  private executionHistory: ExecutionHistory[];
  
  // 核心功能
  async execute(operation: string, params: Record<string, unknown>): Promise<unknown>
  async executeBatch(operations: Operation[]): Promise<ExecutionResult[]>
  async replay(historyId: string): Promise<void>
  registerOperation(name: string, operation: PageOperation): void
}
```

**内置操作类型**:
- **导航操作**: `navigate`, `back`, `forward`, `refresh`
- **交互操作**: `click`, `type`, `select`, `hover`, `scroll`
- **内容操作**: `extractText`, `extractLinks`, `extractImages`, `screenshot`
- **表单操作**: `fillForm`, `submitForm`, `uploadFile`
- **智能操作**: `smartClick`, `smartFill`, `findAndClick`

### 4. CookieManager (智能 Cookie 管理)
**职责**: 按域名自动管理和加载 Cookie

```typescript
class CookieManager {
  private cookieStore: Map<string, CookieDomain>;
  private autoSave: boolean;
  
  // 核心功能
  async saveCookies(domain: string, cookies: Cookie[]): Promise<void>
  async loadCookies(domain: string): Promise<Cookie[]>
  async autoSaveOnNavigation(page: Page): Promise<void>
  async exportCookies(): Promise<CookieExport[]>
  async importCookies(cookies: CookieExport[]): Promise<void>
}
```

**智能特性**:
- 按域名自动分类存储
- 会话恢复和持久化
- 自动过期清理
- 跨域 Cookie 管理

### 5. WebSocketServer (实时控制接口)
**职责**: 提供实时的浏览器控制接口

```typescript
class WebSocketServer {
  private server: WebSocket.Server;
  private clients: Set<WebSocket>;
  private messageHandler: MessageHandler;
  
  // 核心功能
  async start(port: number): Promise<void>
  broadcast(message: WebSocketMessage): void
  sendToClient(clientId: string, message: WebSocketMessage): void
  registerHandler(type: string, handler: MessageHandler): void
}
```

**支持的消息类型**:
- **控制消息**: 浏览器控制、页面导航
- **查询消息**: 元素查询、页面信息
- **执行消息**: 操作执行、脚本注入
- **事件消息**: 页面事件、状态更新

### 6. AIAnalyzer (AI 页面分析器)
**职责**: 提供智能页面分析和操作建议

```typescript
class AIAnalyzer {
  private llmClient: LLMClient;
  private analysisCache: Map<string, PageAnalysis>;
  
  // 核心功能
  async analyzePageStructure(accessibilityTree: string): Promise<PageAnalysis>
  async generateOperationSuggestion(context: AnalysisContext): Promise<OperationSuggestion[]>
  async understandUserIntent(instruction: string, pageContext: PageContext): Promise<IntentAnalysis>
  async optimizeOperationSequence(operations: Operation[]): Promise<Operation[]>
}
```

**AI 能力**:
- 页面类型识别 (文章、商品、表单等)
- 主要内容区域定位
- 用户意图理解
- 操作序列优化

## 数据流设计

### 1. 页面观察流程
```
页面加载 → 获取 Accessibility Tree → AI 元素识别 → 生成观察结果 → 缓存元素
```

### 2. 操作执行流程
```
用户指令 → 意图分析 → 元素匹配 → 操作生成 → 执行验证 → 结果返回
```

### 3. 智能分析流程
```
页面内容 → 结构分析 → 语义理解 → 类型识别 → 操作建议 → 置信度评估
```

## 关键技术实现

### 1. Accessibility Tree 处理
```typescript
// 基于 Camoufox + Playwright 的 Accessibility API
async function getAccessibilityTree(page: Page): Promise<AccessibilityNode> {
  const cdpSession = await page.context().newCDPSession(page);
  const tree = await cdpSession.send('Accessibility.getFullAXTree');
  return parseAccessibilityTree(tree);
}
```

### 2. 智能元素识别
```typescript
// 使用 AI 模型进行元素语义识别
async function identifyElements(tree: AccessibilityNode): Promise<ObservedElement[]> {
  const prompt = buildElementIdentificationPrompt(tree);
  const response = await llmClient.complete(prompt);
  return parseElementResponse(response);
}
```

### 3. 抽象操作生成
```typescript
// 将用户意图转换为可执行操作
async function generateOperation(
  intent: string, 
  context: PageContext
): Promise<OperationSuggestion> {
  const analysis = await understandUserIntent(intent, context);
  const elements = await findRelevantElements(analysis);
  return createOperationSuggestion(analysis, elements);
}
```

## 配置和扩展

### 1. 支持的配置选项
```typescript
interface BrowserAssistantConfig {
  browser: BrowserConfig;
  observation: {
    enableAI: boolean;
    confidenceThreshold: number;
    cacheResults: boolean;
  };
  operations: {
    enableSmartRecovery: boolean;
    maxRetries: number;
    timeout: number;
  };
  cookies: {
    autoSave: boolean;
    storagePath: string;
    encryptionKey?: string;
  };
  websocket: {
    enabled: boolean;
    port: number;
    cors: boolean;
  };
}
```

### 2. 扩展点设计
- **自定义操作**: 通过注册机制添加新的操作类型
- **自定义分析器**: 支持第三方的页面分析算法
- **自定义工具**: 可注入的页面工具和脚本
- **事件处理**: 可扩展的事件监听和处理机制

## 性能优化

### 1. 缓存策略
- **元素缓存**: 避免重复的页面分析
- **操作缓存**: 缓存常用操作序列
- **AI 分析缓存**: 缓存相似页面的分析结果

### 2. 并发控制
- **多实例管理**: 支持多个浏览器实例并行运行
- **操作队列**: 智能调度操作执行顺序
- **资源限制**: 控制内存和 CPU 使用

### 3. 错误处理
- **重试机制**: 智能重试失败的操- **降级策略**: 在 AI 不可用时使用传统方法
- **健康检查**: 实时监控浏览器状态

## 安全考虑

### 1. 数据安全
- **Cookie 加密**: 敏感 Cookie 数据加密存储
- **会话隔离**: 不同域名的会话完全隔离
- **权限控制**: 细粒度的操作权限管理

### 2. 隐私保护
- **反检测**: 利用 Camoufox 的反指纹识别能力
- **数据清理**: 操作完成后自动清理敏感数据
- **匿名模式**: 支持完全匿名的浏览模式

## 使用场景

### 1. 智能网页自动化
- 自动化表单填写
- 智能数据抓取
- 页面内容监控

### 2. 页面分析和理解
- 页面结构分析
- 主要内容提取
- 用户界面理解

### 3. 测试和质量保证
- 自动化测试
- 页面兼容性检查
- 性能监控

### 4. 辅助功能
- 页面无障碍检查
- 内容可访问性验证
- 语义化结构分析

这个设计结合了 stagehand 的智能观察理念和 Camoufox 的技术优势，提供了一个强大而灵活的浏览器自动化解决方案。