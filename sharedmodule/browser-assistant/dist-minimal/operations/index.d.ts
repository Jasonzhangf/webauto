export * from './interfaces/IBrowserOperation';
export * from './core/BrowserContextManager';
export * from './core/BrowserWorkflowEngine';
export * from './browser/BrowserLaunchOperationSimple';
import { BrowserOperationConfig } from './core/BrowserContextManager';
export declare class OperationBasedBrowserAssistant {
    private operationRegistry;
    private contextManager;
    private workflowEngine;
    private config;
    constructor(config?: Partial<BrowserOperationConfig>);
    private mergeConfig;
    private initializeOperations;
    executeWorkflow(workflow: any, contextId?: string): Promise<any>;
    navigateToUrl(url: string, contextId?: string): Promise<any>;
    loginToWeibo(username: string, password: string, contextId?: string): Promise<any>;
    createContext(sessionId: string): any;
    getContext(sessionId: string): any;
    removeContext(sessionId: string): boolean;
    registerOperation(operation: any): void;
    getOperation(name: string): any;
    listOperations(): string[];
    updateConfig(config: Partial<BrowserOperationConfig>): void;
    getConfig(): BrowserOperationConfig;
    getHealthStatus(): Promise<any>;
}
