export * from './interfaces/IBrowserOperation';
export * from './core/BrowserContextManager';
export * from './core/BrowserWorkflowEngine';
export * from './browser/BrowserLaunchOperationSimple';

// Main BrowserAssistant class for operation-based architecture
import { BrowserOperationRegistry } from './core/BrowserOperationRegistry';
import { BrowserContextManager, BrowserOperationConfig } from './core/BrowserContextManager';
import { BrowserWorkflowEngine } from './core/BrowserWorkflowEngine';
import { BrowserLaunchOperation } from './browser/BrowserLaunchOperationSimple';

export class OperationBasedBrowserAssistant {
  private operationRegistry: BrowserOperationRegistry;
  private contextManager: BrowserContextManager;
  private workflowEngine: BrowserWorkflowEngine;
  private config: BrowserOperationConfig;

  constructor(config: Partial<BrowserOperationConfig> = {}) {
    this.config = this.mergeConfig(config);
    this.operationRegistry = new BrowserOperationRegistry();
    this.contextManager = new BrowserContextManager(this.config);
    this.workflowEngine = new BrowserWorkflowEngine(this.operationRegistry, this.contextManager);

    this.initializeOperations();
  }

  private mergeConfig(userConfig: Partial<BrowserOperationConfig>): BrowserOperationConfig {
    const defaultConfig: BrowserOperationConfig = {
      browser: {
        type: 'camoufox',
        headless: false,
        viewport: { width: 1280, height: 720 }
      },
      cookies: {
        storagePath: './cookies',
        autoSave: true,
        domains: ['weibo.com', 's.weibo.com']
      },
      operations: {
        timeout: 30000,
        retryAttempts: 3,
        parallelLimit: 5
      },
      containers: {
        enabled: false
      }
    };

    return { ...defaultConfig, ...userConfig };
  }

  private initializeOperations(): void {
    // Register all browser operations
    this.operationRegistry.registerOperation(new BrowserLaunchOperation());
  }

  // Core workflow execution methods
  async executeWorkflow(workflow: any, contextId?: string): Promise<any> {
    return await this.workflowEngine.executeWorkflow(workflow, contextId);
  }

  async navigateToUrl(url: string, contextId?: string): Promise<any> {
    const workflow = BrowserWorkflowEngine.createBasicNavigationWorkflow(url);
    return await this.workflowEngine.executeWorkflow(workflow, contextId);
  }

  async loginToWeibo(username: string, password: string, contextId?: string): Promise<any> {
    const workflow = BrowserWorkflowEngine.createWeiboLoginWorkflow(username, password);
    return await this.workflowEngine.executeWorkflow(workflow, contextId);
  }

  // Context management
  createContext(sessionId: string): any {
    return this.contextManager.createContext(sessionId);
  }

  getContext(sessionId: string): any {
    return this.contextManager.getContext(sessionId);
  }

  removeContext(sessionId: string): boolean {
    return this.contextManager.removeContext(sessionId);
  }

  // Operation management
  registerOperation(operation: any): void {
    this.operationRegistry.registerOperation(operation);
  }

  getOperation(name: string): any {
    return this.operationRegistry.getOperation(name);
  }

  listOperations(): string[] {
    return this.operationRegistry.listOperations();
  }

  // Configuration
  updateConfig(config: Partial<BrowserOperationConfig>): void {
    this.config = this.mergeConfig(config);
  }

  getConfig(): BrowserOperationConfig {
    return this.config;
  }

  // Health check
  async getHealthStatus(): Promise<any> {
    return {
      name: 'OperationBasedBrowserAssistant',
      version: '1.0.0',
      operationCount: this.operationRegistry.size,
      contextCount: this.contextManager.listContexts().length,
      config: this.config,
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  }
}