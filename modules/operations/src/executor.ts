export interface OperationContext {
  containerId?: string;
  node?: any;
  page: {
    evaluate(fn: (...args: any[]) => any, ...args: any[]): Promise<any>;
    keyboard?: {
      type(text: string, options?: { delay?: number; submit?: boolean }): Promise<void>;
      press?(key: string, options?: { delay?: number }): Promise<void>;
    };
  };
  logger?: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  systemInput?: {
    mouseMove: (x: number, y: number, steps?: number) => Promise<any>;
    mouseClick: (x: number, y: number, button?: string, clicks?: number) => Promise<any>;
    mouseWheel?: (deltaX: number, deltaY: number) => Promise<any>;
  };
}

export interface OperationDefinition<TConfig = any> {
  id: string;
  description?: string;
  requiredCapabilities?: string[];
  run: (ctx: OperationContext, config: TConfig) => Promise<any>;
}

export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
}
import { highlightOperation } from './operations/highlight.js';
import { scrollOperation } from './operations/scroll.js';
import { mouseMoveOperation, mouseClickOperation } from './system/mouse.js';
import { extractOperation } from './operations/extract.js';
import { clickOperation } from './operations/click.js';
import { findChildOperation } from './operations/find-child.js';
import { typeOperation } from './operations/type.js';
import { navigateOperation } from './operations/navigate.js';
import { keyOperation } from './operations/key.js';
import { ContainerRegistry } from '../../container-registry/src/index.js';

export class ContainerExecutor {
  private operations = new Map<string, OperationDefinition>();
  private registry = new ContainerRegistry();

  constructor() {
    this.initializeBuiltinOperations();
  }

  private initializeBuiltinOperations() {
    this.registerOperation(highlightOperation);
    this.registerOperation(scrollOperation);
    this.registerOperation(mouseMoveOperation);
    this.registerOperation(mouseClickOperation);
    this.registerOperation(extractOperation);
    this.registerOperation(clickOperation);
    this.registerOperation(findChildOperation);
    this.registerOperation(typeOperation);
    this.registerOperation(keyOperation);
    this.registerOperation(navigateOperation);
  }

  registerOperation(config: OperationDefinition) {
    this.operations.set(config.id, config);
  }

  async execute(
    containerId: string,
    operationId: string,
    config: Record<string, any>,
    context: OperationContext
  ): Promise<OperationResult> {
    const operation = this.operations.get(operationId);

    if (!operation) {
      return {
        success: false,
        error: `Unknown operation: ${operationId}`
      };
    }

    // 合并容器定义中的默认 operation config（调用方 config 优先）
    config = await this.mergeContainerOperationConfig(containerId, operationId, config, context);

    // 统一默认使用系统级点击，避免 DOM click 触发风控
    if (operationId === 'click' && typeof config.useSystemMouse !== 'boolean') {
      config = { ...config, useSystemMouse: true };
    }

    // 如果操作需要 selector，则从容器定义中补齐
    if (this.requiresSelector(operation) && !config.selector) {
      const selector = await this.getSelectorForContainer(containerId, context);
      if (!selector) {
        return {
          success: false,
          error: `Cannot find selector for container: ${containerId}`
        };
      }
      config = { ...config, selector };
    }

    try {
      return await operation.run(context, config);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error)
      };
    }
  }

  private requiresSelector(operation: OperationDefinition): boolean {
    return ['highlight', 'click', 'extract', 'type', 'input', 'scroll', 'key'].includes(operation.id);
  }

  private async mergeContainerOperationConfig(
    containerId: string,
    operationId: string,
    config: Record<string, any>,
    context: OperationContext
  ) {
    const { url, container } = await this.getContainerForContext(containerId, context);
    if (!url || !container) return config;
    const ops = Array.isArray((container as any).operations) ? (container as any).operations : [];
    const defaultOp = ops.find((op: any) => (op?.type || op?.id) === operationId);
    const baseConfig = defaultOp?.config && typeof defaultOp.config === 'object' ? defaultOp.config : null;
    if (!baseConfig) return config;
    return { ...baseConfig, ...config };
  }

  private async getSelectorForContainer(containerId: string, context: OperationContext): Promise<string | null> {
    const { container } = await this.getContainerForContext(containerId, context);
    if (!container || !container.selectors || !container.selectors.length) {
      return null;
    }
    const primary = container.selectors.find((s: any) => s.variant === 'primary') || container.selectors[0];
    return primary?.css || null;
  }

  private async getContainerForContext(containerId: string, context: OperationContext) {
    const url = await context.page.evaluate(() => window.location.href);
    if (!url) {
      return { url: null as string | null, container: null as any };
    }
    await this.registry.load();
    const containers = this.registry.getContainersForUrl(url);
    return { url, container: containers[containerId] || null };
  }
}

// Singleton instance
let executorInstance: ContainerExecutor | null = null;

export function getContainerExecutor(): ContainerExecutor {
  if (!executorInstance) {
    executorInstance = new ContainerExecutor();
  }
  return executorInstance;
}
