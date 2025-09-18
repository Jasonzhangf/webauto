import { BrowserOperationRegistry } from './BrowserOperationRegistry';
import { BrowserContextManager } from './BrowserContextManager';
import { IBrowserOperation, BrowserOperationContext } from '../interfaces/IBrowserOperation';
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

export class BrowserWorkflowEngine {
  private operationRegistry: BrowserOperationRegistry;
  private contextManager: BrowserContextManager;

  constructor(
    operationRegistry: BrowserOperationRegistry,
    contextManager: BrowserContextManager
  ) {
    this.operationRegistry = operationRegistry;
    this.contextManager = contextManager;
  }

  async executeWorkflow(
    workflow: BrowserWorkflow,
    contextId?: string
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const results: any[] = [];
    const errors: string[] = [];

    // Create or get context
    let context: BrowserOperationContext;
    if (contextId) {
      context = this.contextManager.getContext(contextId) ||
                 this.contextManager.createContext(contextId);
    } else {
      contextId = `workflow-${Date.now()}`;
      context = this.contextManager.createContext(contextId);
    }

    // Apply workflow-specific config if provided
    if (workflow.config) {
      const currentConfig = context.metadata.config || {};
      context.metadata.config = { ...currentConfig, ...workflow.config };
    }

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const stepStartTime = Date.now();

        try {
          const operation = this.operationRegistry.getOperation(step.operation);
          if (!operation) {
            throw new Error(`Operation not found: ${step.operation}`);
          }

          // Execute operation with timeout
          const timeout = step.timeout || 30000;
          const result = await this.executeWithTimeout(
            operation.execute(context, step.parameters),
            timeout
          );

          results.push(result);

          // Check if step failed and is required
          if (!result.success && step.required) {
            throw new Error(`Required operation failed: ${step.operation}`);
          }

          // Log step completion
          const stepTime = Date.now() - stepStartTime;
          console.log(`[Workflow] Step ${i + 1}/${workflow.steps.length} completed: ${step.operation} (${stepTime}ms)`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(errorMessage);

          // Handle retries
          const maxRetries = step.retryCount || 0;
          let retryCount = 0;
          let success = false;

          while (retryCount < maxRetries && !success) {
            retryCount++;
            console.log(`[Workflow] Retrying step ${i + 1} (${retryCount}/${maxRetries}): ${step.operation}`);

            try {
              const operation = this.operationRegistry.getOperation(step.operation);
              if (!operation) {
                throw new Error(`Operation not found: ${step.operation}`);
              }

              const result = await operation.execute(context, step.parameters);
              results.push(result);
              success = true;

              console.log(`[Workflow] Step ${i + 1} succeeded on retry ${retryCount}`);
            } catch (retryError) {
              const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError);
              errors.push(`Retry ${retryCount} failed: ${retryErrorMessage}`);
            }
          }

          if (!success && step.required) {
            throw new Error(`Required operation failed after ${maxRetries} retries: ${step.operation}`);
          }
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        success: errors.length === 0 || !errors.some(error => error.includes('required operation failed')),
        results,
        errors: errors.length > 0 ? errors : undefined,
        executionTime,
        contextId
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        results,
        errors: [...errors, errorMessage],
        executionTime,
        contextId
      };
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  // Helper method to create common workflows
  static createBasicNavigationWorkflow(url: string): BrowserWorkflow {
    return {
      name: 'basic-navigation',
      description: 'Navigate to a URL and initialize browser session',
      steps: [
        {
          operation: 'browser-launch',
          parameters: { headless: false },
          required: true
        },
        {
          operation: 'page-navigation',
          parameters: { url, waitUntil: 'networkidle' },
          required: true
        }
      ]
    };
  }

  static createWeiboLoginWorkflow(username: string, password: string): BrowserWorkflow {
    return {
      name: 'weibo-login',
      description: 'Login to Weibo with provided credentials',
      steps: [
        {
          operation: 'browser-launch',
          parameters: { headless: false },
          required: true
        },
        {
          operation: 'cookie-management',
          parameters: { action: 'load', domain: 'weibo.com' },
          required: false
        },
        {
          operation: 'page-navigation',
          parameters: { url: 'https://weibo.com/login.php', waitUntil: 'networkidle' },
          required: true
        },
        {
          operation: 'element-interaction',
          parameters: {
            action: 'type',
            selector: 'input[name="username"]',
            value: username
          },
          required: true
        },
        {
          operation: 'element-interaction',
          parameters: {
            action: 'type',
            selector: 'input[name="password"]',
            value: password
          },
          required: true
        },
        {
          operation: 'element-interaction',
          parameters: {
            action: 'click',
            selector: 'button[type="submit"]'
          },
          required: true
        },
        {
          operation: 'cookie-management',
          parameters: { action: 'save', domain: 'weibo.com' },
          required: true
        }
      ]
    };
  }
}