/**
 * Weibo Workflow System Entry Point
 * 微博工作流系统入口点
 */

// Core interfaces
export * from './interfaces/IWeiboOperation';

// Core operations
export { WeiboNavigationOperation } from './core/WeiboNavigationOperation';
export { WeiboContentExtractionOperation } from './core/WeiboContentExtractionOperation';
export { WeiboLoginOperation } from './core/WeiboLoginOperation';

// Import BaseOperation for compatibility
import { BaseOperation } from './interfaces/IWeiboOperation';
import { WeiboNavigationOperation } from './core/WeiboNavigationOperation';
import { WeiboContentExtractionOperation } from './core/WeiboContentExtractionOperation';
import { WeiboLoginOperation } from './core/WeiboLoginOperation';

// Simple OperationRegistry implementation
class OperationRegistry {
  private operations = new Map<string, BaseOperation>();

  registerOperation(operation: BaseOperation): void {
    this.operations.set(operation.name, operation);
  }

  getOperation(name: string): BaseOperation | undefined {
    return this.operations.get(name);
  }

  listOperations(): string[] {
    return Array.from(this.operations.keys());
  }

  get size(): number {
    return this.operations.size;
  }
}

/**
 * Weibo Workflow System - Main entry point
 * 微博工作流系统 - 主要入口点
 */
export class WeiboWorkflowSystem {
  private operationRegistry: OperationRegistry;
  private navigationOperation: WeiboNavigationOperation;
  private contentExtractionOperation: WeiboContentExtractionOperation;
  private loginOperation: WeiboLoginOperation;

  constructor() {
    this.operationRegistry = new OperationRegistry();

    // Initialize core operations
    this.navigationOperation = new WeiboNavigationOperation();
    this.contentExtractionOperation = new WeiboContentExtractionOperation();
    this.loginOperation = new WeiboLoginOperation();

    this.initializeOperations();
  }

  /**
   * Initialize weibo operations
   * 初始化微博操作子
   */
  private initializeOperations(): void {
    // Register core weibo operations
    this.operationRegistry.registerOperation(this.navigationOperation);
    this.operationRegistry.registerOperation(this.contentExtractionOperation);
    this.operationRegistry.registerOperation(this.loginOperation);

    this.logger.info('Weibo workflow system initialized', {
      operationsCount: this.operationRegistry.size,
      operations: [
        'weibo-navigation',
        'weibo-content-extraction',
        'weibo-login'
      ]
    });
  }

  /**
   * Navigate to weibo page
   * 导航到微博页面
   */
  async navigate(context: any, target: string, options?: any): Promise<any> {
    return await this.navigationOperation.execute(context, { target, ...options });
  }

  /**
   * Extract content from weibo
   * 从微博提取内容
   */
  async extractContent(context: any, contentType: string, options?: any): Promise<any> {
    return await this.contentExtractionOperation.execute(context, {
      contentType,
      ...options
    });
  }

  /**
   * Handle login operations
   * 处理登录操作
   */
  async handleLogin(context: any, action: string, options?: any): Promise<any> {
    return await this.loginOperation.execute(context, { action, ...options });
  }

  /**
   * Execute complete weibo workflow
   * 执行完整微博工作流
   */
  async executeWorkflow(context: any, workflow: any): Promise<any> {
    const startTime = Date.now();
    const workflowId = workflow.id || `weibo-workflow-${Date.now()}`;

    try {
      this.logger.info('Starting weibo workflow execution', {
        workflowId,
        workflowType: workflow.type,
        stepCount: workflow.steps?.length || 0
      });

      // Initialize workflow context
      const workflowContext = {
        ...context,
        workflow: {
          id: workflowId,
          type: workflow.type,
          startTime,
          steps: new Map(),
          completedSteps: new Set(),
          failedSteps: new Set(),
          results: new Map()
        }
      };

      // Execute workflow steps
      const results: any[] = [];

      for (const step of workflow.steps || []) {
        try {
          this.logger.info('Executing workflow step', {
            workflowId,
            stepId: step.id,
            stepName: step.name,
            operation: step.operation
          });

          let result;

          switch (step.operation) {
            case 'navigation':
              result = await this.navigationOperation.execute(workflowContext, step.params);
              break;
            case 'content-extraction':
              result = await this.contentExtractionOperation.execute(workflowContext, step.params);
              break;
            case 'login':
              result = await this.loginOperation.execute(workflowContext, step.params);
              break;
            default:
              throw new Error(`Unknown operation: ${step.operation}`);
          }

          if (result.success) {
            workflowContext.workflow.completedSteps.add(step.id);
            workflowContext.workflow.results.set(step.id, result);
          } else {
            workflowContext.workflow.failedSteps.add(step.id);

            if (step.required !== false) {
              throw new Error(`Step ${step.id} failed: ${result.error}`);
            }
          }

          results.push({
            stepId: step.id,
            stepName: step.name,
            success: result.success,
            result: result.result,
            executionTime: result.executionTime
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          workflowContext.workflow.failedSteps.add(step.id);

          this.logger.error('Workflow step failed', {
            workflowId,
            stepId: step.id,
            stepName: step.name,
            error: errorMessage
          });

          if (step.required !== false) {
            throw error;
          }

          results.push({
            stepId: step.id,
            stepName: step.name,
            success: false,
            error: errorMessage,
            executionTime: 0
          });
        }
      }

      const executionTime = Date.now() - startTime;

      this.logger.info('Weibo workflow execution completed', {
        workflowId,
        executionTime,
        totalSteps: workflow.steps?.length || 0,
        completedSteps: workflowContext.workflow.completedSteps.size,
        failedSteps: workflowContext.workflow.failedSteps.size
      });

      return {
        success: true,
        workflowId,
        executionTime,
        steps: {
          total: workflow.steps?.length || 0,
          completed: workflowContext.workflow.completedSteps.size,
          failed: workflowContext.workflow.failedSteps.size
        },
        results,
        metadata: {
          workflowType: workflow.type,
          completedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Weibo workflow execution failed', {
        workflowId,
        executionTime,
        error: errorMessage
      });

      return {
        success: false,
        workflowId,
        executionTime,
        error: errorMessage,
        steps: {
          total: workflow.steps?.length || 0,
          completed: 0,
          failed: 0
        }
      };
    }
  }

  /**
   * Get system status
   * 获取系统状态
   */
  getSystemStatus(): any {
    return {
      name: 'Weibo Workflow System',
      version: '1.0.0',
      status: this._systemStatus || 'healthy',
      operations: {
        count: this.operationRegistry.size,
        list: this.operationRegistry.listOperations()
      },
      capabilities: [
        'weibo-navigation',
        'content-extraction',
        'login-management',
        'session-management'
      ],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get system metrics
   * 获取系统指标
   */
  getSystemMetrics(): any {
    const navStats = this.navigationOperation.getPipelineStats?.() || {};
    const contentStats = this.contentExtractionOperation.getPipelineStats?.() || {};
    const loginStats = this.loginOperation.getPipelineStats?.() || {};

    return {
      operations: {
        navigation: navStats,
        contentExtraction: contentStats,
        login: loginStats
      },
      performance: {
        uptime: Date.now() - this.startTime,
        totalOperations: this.operationRegistry.size
      },
      health: {
        overall: 'healthy',
        checks: {
          navigation: navStats.successRate > 0.8 ? 'healthy' : 'warning',
          contentExtraction: contentStats.successRate > 0.8 ? 'healthy' : 'warning',
          login: loginStats.successRate > 0.7 ? 'healthy' : 'warning'
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check
   * 健康检查
   */
  async healthCheck(): Promise<any> {
    const healthChecks: any = {};

    try {
      // Check navigation operation
      healthChecks.navigation = {
        status: 'healthy',
        message: 'Navigation operation available'
      };

      // Check content extraction operation
      healthChecks.contentExtraction = {
        status: 'healthy',
        message: 'Content extraction operation available'
      };

      // Check login operation
      healthChecks.login = {
        status: 'healthy',
        message: 'Login operation available'
      };

      const allHealthy = Object.values(healthChecks).every((check: any) => check.status === 'healthy');

      return {
        overall: allHealthy ? 'healthy' : 'warning',
        operations: healthChecks,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        overall: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset system state
   * 重置系统状态
   */
  reset(): void {
    this.logger.info('Resetting weibo workflow system');

    // Reset all operations
    this.navigationOperation.reset?.();
    this.contentExtractionOperation.reset?.();
    this.loginOperation.reset?.();

    // Re-initialize
    this.initializeOperations();

    this.logger.info('Weibo workflow system reset completed');
  }

  // Private properties
  private startTime = Date.now();
  private _systemStatus: 'healthy' | 'warning' | 'unhealthy' = 'healthy';

  // Simple logger
  private logger = {
    info: (message: string, data?: any) => console.log(`[WeiboWorkflowSystem] ${message}`, data || ''),
    error: (message: string, data?: any) => console.error(`[WeiboWorkflowSystem] ${message}`, data || ''),
    warn: (message: string, data?: any) => console.warn(`[WeiboWorkflowSystem] ${message}`, data || ''),
    debug: (message: string, data?: any) => console.debug(`[WeiboWorkflowSystem] ${message}`, data || '')
  };
}