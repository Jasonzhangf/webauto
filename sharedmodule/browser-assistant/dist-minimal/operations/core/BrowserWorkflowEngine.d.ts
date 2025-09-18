import { BrowserOperationRegistry } from './BrowserOperationRegistry';
import { BrowserContextManager } from './BrowserContextManager';
import { BrowserOperationConfig } from '../interfaces/IBrowserOperation';
export interface BrowserWorkflowStep {
    operation: string;
    parameters?: any;
    required?: boolean;
    retryCount?: number;
    timeout?: number;
}
export interface BrowserWorkflow {
    name: string;
    description: string;
    steps: BrowserWorkflowStep[];
    config?: Partial<BrowserOperationConfig>;
}
export interface WorkflowResult {
    success: boolean;
    results: any[];
    errors?: string[];
    executionTime: number;
    contextId: string;
}
export declare class BrowserWorkflowEngine {
    private operationRegistry;
    private contextManager;
    constructor(operationRegistry: BrowserOperationRegistry, contextManager: BrowserContextManager);
    executeWorkflow(workflow: BrowserWorkflow, contextId?: string): Promise<WorkflowResult>;
    private executeWithTimeout;
    static createBasicNavigationWorkflow(url: string): BrowserWorkflow;
    static createWeiboLoginWorkflow(username: string, password: string): BrowserWorkflow;
}
