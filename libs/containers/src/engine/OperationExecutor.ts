/**
 * OperationExecutor - 容器操作执行器
 * 
 * 连接 Container Engine 和 Operation 系统
 */

import type { OperationContext, OperationDefinition } from '../../../../modules/operations/src/registry.js';
import { getOperation } from '../../../../modules/operations/src/registry.js';

export interface ContainerHandle {
  sessionId: string;
  element?: any;  // Element handle from Playwright
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface ExecuteOptions {
  timeout?: number;
  beforeExecute?: (ctx: OperationContext) => Promise<void>;
  afterExecute?: (ctx: OperationContext, result: any) => Promise<void>;
}

export class OperationExecutor {
  constructor(
    private getPage: (sessionId: string) => any,  // 获取 Playwright Page
    private logger?: any
  ) {}

  /**
   * 创建 OperationContext
   */
  async createContext(containerId: string, handle: ContainerHandle): Promise<OperationContext> {
    const page = await this.getPage(handle.sessionId);
    
    return {
      containerId,
      node: handle,
      page: {
        evaluate: async (fn: (...args: any[]) => any, ...args: any[]) => {
          if (!page || typeof page.evaluate !== 'function') {
            throw new Error('Page not available for evaluation');
          }
          return page.evaluate(fn, ...args);
        },
      },
      logger: this.logger || console,
      systemInput: {
        mouseMove: async (x: number, y: number, steps?: number) => {
          if (!page || typeof page.mouse.move !== 'function') {
            this.logger?.warn?.('Page mouse not available for mouseMove');
            return { mock: true };
          }
          await page.mouse.move(x, y, { steps: steps || 1 });
          return { success: true };
        },
        mouseClick: async (x: number, y: number, button?: string, clicks?: number) => {
          if (!page || typeof page.mouse.click !== 'function') {
            this.logger?.warn?.('Page mouse not available for mouseClick');
            return { mock: true };
          }
          await page.mouse.click(x, y, { button: button || 'left', clickCount: clicks || 1 });
          return { success: true };
        }
      }
    };
  }

  /**
   * 执行操作
   */
  async execute(
    containerId: string,
    operationId: string,
    config: any = {},
    handle: ContainerHandle,
    options: ExecuteOptions = {}
  ): Promise<any> {
    const operation = getOperation(operationId);
    if (!operation) {
      throw new Error(`Unknown operation: ${operationId}`);
    }

    const ctx = await this.createContext(containerId, handle);

    if (options.beforeExecute) {
      await options.beforeExecute(ctx);
    }

    this.logger?.info?.(`Executing operation ${operationId} on container ${containerId}`);

    try {
      const result = await operation.run(ctx, config);

      if (options.afterExecute) {
        await options.afterExecute(ctx, result);
      }

      this.logger?.info?.(`Operation ${operationId} completed successfully`);
      return { success: true, data: result };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger?.error?.(`Operation ${operationId} failed:`, error.message);
      
      if (options.afterExecute) {
        await options.afterExecute(ctx, { error: error.message });
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量执行操作
   */
  async executeBatch(
    items: Array<{
      containerId: string;
      operationId: string;
      config?: any;
      handle: ContainerHandle;
    }>,
    options: ExecuteOptions = {}
  ): Promise<any[]> {
    const results = [];
    for (const item of items) {
      const result = await this.execute(
        item.containerId,
        item.operationId,
        item.config || {},
        item.handle,
        options
      );
      results.push(result);
    }
    return results;
  }
}

export default OperationExecutor;
