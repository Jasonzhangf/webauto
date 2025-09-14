// 原子操作执行引擎
// 基于原子操作子组合的轻量级执行系统

import { IExecutionContext } from '../../interfaces/core';
import { SystemStateCenter } from '../../core/system-state-center';

// 原子操作子定义
export interface AtomicOperation {
  id: string;
  name: string;
  description: string;
  category: 'find' | 'extract' | 'interact' | 'navigate' | 'validate';
  version: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: any;
    description: string;
  }>;
  execute: (context: IExecutionContext, params: any) => Promise<any>;
  timeout?: number;
}

// 网站页面配置
export interface WebsitePageConfig {
  website: string;
  page: string;
  description: string;
  urlPattern?: string;
  operations: Array<{
    name: string;
    atomicOperation: string;
    selector?: string;
    parameters?: any;
    outputKey?: string;
    condition?: string;
    continueOnError?: boolean;
  }>;
  workflows?: Array<{
    name: string;
    description: string;
    steps: Array<{
      operationName: string;
      parameters?: any;
      condition?: string;
      continueOnError?: boolean;
    }>;
  }>;
}

// 原子操作引擎
export class AtomicOperationEngine {
  private stateCenter: SystemStateCenter;
  private atomicOperations: Map<string, AtomicOperation> = new Map();
  private websiteConfigs: Map<string, WebsitePageConfig> = new Map();

  constructor(stateCenter: SystemStateCenter) {
    this.stateCenter = stateCenter;
    this.initializeAtomicOperations();
  }

  // 注册原子操作子
  registerAtomicOperation(operation: AtomicOperation): void {
    this.atomicOperations.set(operation.id, operation);
    this.logInfo(`已注册原子操作: ${operation.id}`);
  }

  // 注册网站配置
  registerWebsiteConfig(config: WebsitePageConfig): void {
    const key = `${config.website}.${config.page}`;
    this.websiteConfigs.set(key, config);
    this.logInfo(`已注册网站配置: ${key}`);
  }

  // 执行单个原子操作
  async executeAtomicOperation(
    operationId: string,
    context: IExecutionContext,
    params: any = {}
  ): Promise<any> {
    const operation = this.atomicOperations.get(operationId);
    if (!operation) {
      throw new Error(`原子操作未找到: ${operationId}`);
    }

    const startTime = Date.now();
    this.logInfo(`执行原子操作: ${operationId}`);

    try {
      const result = await operation.execute(context, params);
      
      return {
        success: true,
        data: result,
        operationId,
        executionTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      this.error(`原子操作失败: ${operationId}`, { error });
      throw error;
    }
  }

  // 执行网站页面操作
  async executeWebsiteOperation(
    website: string,
    page: string,
    context: IExecutionContext,
    customParams?: any
  ): Promise<any> {
    const configKey = `${website}.${page}`;
    const config = this.websiteConfigs.get(configKey);
    
    if (!config) {
      throw new Error(`网站配置未找到: ${configKey}`);
    }

    this.logInfo(`执行网站操作: ${configKey}`);
    
    const results: any = {};
    
    for (const op of config.operations) {
      try {
        // 检查条件
        if (op.condition && !this.evaluateCondition(op.condition, { ...results, ...customParams })) {
          this.logInfo(`跳过操作: ${op.name} (条件不满足)`);
          continue;
        }

        // 合并参数
        const operationParams = {
          selector: op.selector,
          ...op.parameters,
          ...customParams
        };

        // 执行原子操作
        const result = await this.executeAtomicOperation(op.atomicOperation, context, operationParams);
        
        if (op.outputKey) {
          results[op.outputKey] = result;
        }

        this.logInfo(`操作执行成功: ${op.name}`);
        
      } catch (error) {
        if (op.continueOnError) {
          this.logWarn(`操作失败但继续: ${op.name}`, { error });
          if (op.outputKey) {
            results[op.outputKey] = { error: error instanceof Error ? error.message : String(error) };
          }
        } else {
          throw error;
        }
      }
    }

    return {
      success: true,
      data: results,
      website,
      page,
      executionTime: Date.now(),
      timestamp: new Date()
    };
  }

  // 执行工作流
  async executeWorkflow(
    website: string,
    page: string,
    workflowName: string,
    context: IExecutionContext,
    params?: any
  ): Promise<any> {
    const configKey = `${website}.${page}`;
    const config = this.websiteConfigs.get(configKey);
    
    if (!config || !config.workflows) {
      throw new Error(`工作流配置未找到: ${configKey}.${workflowName}`);
    }

    const workflow = config.workflows.find(w => w.name === workflowName);
    if (!workflow) {
      throw new Error(`工作流未找到: ${workflowName}`);
    }

    this.logInfo(`执行工作流: ${workflowName}`);
    
    const results: any[] = [];
    const contextData: any = {};

    for (const step of workflow.steps) {
      try {
        if (step.condition && !this.evaluateCondition(step.condition, contextData)) {
          this.logInfo(`跳过步骤: ${step.operationName} (条件不满足)`);
          continue;
        }

        const stepParams = { ...step.parameters, ...params };
        const result = await this.executeWebsiteOperation(website, page, context, stepParams);
        
        results.push({
          step: step.operationName,
          success: true,
          result
        });

        contextData.lastResult = result;
        
      } catch (error) {
        results.push({
          step: step.operationName,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });

        if (!step.continueOnError) {
          break;
        }
      }
    }

    return {
      workflowName,
      success: results.every(r => r.success),
      results,
      timestamp: new Date()
    };
  }

  // 获取所有原子操作
  getAtomicOperations(): AtomicOperation[] {
    return Array.from(this.atomicOperations.values());
  }

  // 获取所有网站配置
  getWebsiteConfigs(): WebsitePageConfig[] {
    return Array.from(this.websiteConfigs.values());
  }

  // 搜索原子操作
  searchAtomicOperations(query: string): AtomicOperation[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.atomicOperations.values()).filter(op =>
      op.name.toLowerCase().includes(lowerQuery) ||
      op.description.toLowerCase().includes(lowerQuery) ||
      op.category.toLowerCase().includes(lowerQuery)
    );
  }

  // 获取统计信息
  getStats(): any {
    const atomicOps = Array.from(this.atomicOperations.values());
    const websiteConfigs = Array.from(this.websiteConfigs.values());
    
    return {
      atomicOperations: {
        total: atomicOps.length,
        byCategory: this.groupBy(atomicOps, 'category')
      },
      websiteConfigs: {
        total: websiteConfigs.length,
        byWebsite: this.groupBy(websiteConfigs, 'website')
      },
      timestamp: new Date()
    };
  }

  // 私有方法实现

  private initializeAtomicOperations(): void {
    // 注册内置原子操作子
    this.registerAtomicOperation(this.createFindElementOperation());
    this.registerAtomicOperation(this.createExtractTextOperation());
    this.registerAtomicOperation(this.createExtractAttributeOperation());
    this.registerAtomicOperation(this.createClickElementOperation());
    this.registerAtomicOperation(this.createInputTextOperation());
    this.registerAtomicOperation(this.createWaitElementOperation());
    this.registerAtomicOperation(this.createNavigateToOperation());
    this.registerAtomicOperation(this.createValidateConditionOperation());
    
    // 扩展原子操作子库
    this.registerAtomicOperation(this.createWaitForTimeoutOperation());
    this.registerAtomicOperation(this.createScreenshotOperation());
    this.registerAtomicOperation(this.createGetPageTitleOperation());
    this.registerAtomicOperation(this.createGetPageUrlOperation());
    this.registerAtomicOperation(this.createScrollToElementOperation());
    this.registerAtomicOperation(this.createHoverElementOperation());
    this.registerAtomicOperation(this.createCheckElementExistsOperation());
    this.registerAtomicOperation(this.createGetElementCountOperation());
    this.registerAtomicOperation(this.createExtractHtmlOperation());
    this.registerAtomicOperation(this.createSwitchToFrameOperation());
    this.registerAtomicOperation(this.createSwitchToMainFrameOperation());
    this.registerAtomicOperation(this.createExecuteScriptOperation());
    this.registerAtomicOperation(this.createExtractTableDataOperation());
  }

  private createFindElementOperation(): AtomicOperation {
    return {
      id: 'find_element',
      name: '查找元素',
      description: '根据CSS选择器查找页面元素',
      category: 'find',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: 'CSS选择器'
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          defaultValue: 5000,
          description: '等待超时时间(毫秒)'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const timeout = params.timeout || 5000;

        try {
          const element = await context.page.waitForSelector(selector, { timeout });
          return {
            found: true,
            selector,
            element: element.toString()
          };
        } catch (error) {
          return {
            found: false,
            selector,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createExtractTextOperation(): AtomicOperation {
    return {
      id: 'extract_text',
      name: '提取文本',
      description: '从元素中提取文本内容',
      category: 'extract',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: 'CSS选择器'
        },
        {
          name: 'multi',
          type: 'boolean',
          required: false,
          defaultValue: false,
          description: '是否提取多个元素'
        },
        {
          name: 'trim',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否去除空白字符'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const multi = params.multi || false;
        const trim = params.trim || true;

        try {
          if (multi) {
            const elements = await context.page.$$(selector);
            const texts = await Promise.all(
              elements.map(el => el.textContent())
            );
            return {
              selector,
              count: elements.length,
              texts: texts.map(text => trim ? text?.trim() : text)
            };
          } else {
            const element = await context.page.$(selector);
            const text = await element?.textContent();
            return {
              selector,
              text: trim ? text?.trim() : text
            };
          }
        } catch (error) {
          return {
            selector,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createExtractAttributeOperation(): AtomicOperation {
    return {
      id: 'extract_attribute',
      name: '提取属性',
      description: '从元素中提取指定属性',
      category: 'extract',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: 'CSS选择器'
        },
        {
          name: 'attribute',
          type: 'string',
          required: true,
          description: '属性名称'
        },
        {
          name: 'multi',
          type: 'boolean',
          required: false,
          defaultValue: false,
          description: '是否提取多个元素'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const attribute = params.attribute;
        const multi = params.multi || false;

        try {
          if (multi) {
            const elements = await context.page.$$(selector);
            const attributes = await Promise.all(
              elements.map(el => el.getAttribute(attribute))
            );
            return {
              selector,
              attribute,
              count: elements.length,
              values: attributes
            };
          } else {
            const element = await context.page.$(selector);
            const value = await element?.getAttribute(attribute);
            return {
              selector,
              attribute,
              value
            };
          }
        } catch (error) {
          return {
            selector,
            attribute,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createClickElementOperation(): AtomicOperation {
    return {
      id: 'click_element',
      name: '点击元素',
      description: '点击指定元素',
      category: 'interact',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: 'CSS选择器'
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          defaultValue: 5000,
          description: '等待超时时间'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const timeout = params.timeout || 5000;

        try {
          const element = await context.page.waitForSelector(selector, { timeout });
          await element.click();
          return {
            selector,
            clicked: true
          };
        } catch (error) {
          return {
            selector,
            clicked: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createInputTextOperation(): AtomicOperation {
    return {
      id: 'input_text',
      name: '输入文本',
      description: '在指定元素中输入文本',
      category: 'interact',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: 'CSS选择器'
        },
        {
          name: 'text',
          type: 'string',
          required: true,
          description: '要输入的文本'
        },
        {
          name: 'clear',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否清空原有内容'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const text = params.text;
        const clear = params.clear !== false;

        try {
          const element = await context.page.$(selector);
          if (!element) {
            throw new Error(`元素未找到: ${selector}`);
          }

          if (clear) {
            await element.fill('');
          }
          await element.fill(text);

          return {
            selector,
            text,
            input: true
          };
        } catch (error) {
          return {
            selector,
            text,
            input: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createWaitElementOperation(): AtomicOperation {
    return {
      id: 'wait_element',
      name: '等待元素',
      description: '等待元素出现',
      category: 'validate',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: 'CSS选择器'
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          defaultValue: 10000,
          description: '等待超时时间'
        },
        {
          name: 'state',
          type: 'string',
          required: false,
          defaultValue: 'visible',
          description: '等待状态 (visible/hidden/attached/detached)'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const timeout = params.timeout || 10000;
        const state = params.state || 'visible';

        try {
          await context.page.waitForSelector(selector, { state, timeout });
          return {
            selector,
            state,
            waited: true,
            timeout
          };
        } catch (error) {
          return {
            selector,
            state,
            waited: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createNavigateToOperation(): AtomicOperation {
    return {
      id: 'navigate_to',
      name: '页面导航',
      description: '导航到指定URL',
      category: 'navigate',
      version: '1.0.0',
      parameters: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: '目标URL'
        },
        {
          name: 'waitUntil',
          type: 'string',
          required: false,
          defaultValue: 'networkidle',
          description: '等待条件'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const url = params.url;
        const waitUntil = params.waitUntil || 'networkidle';

        try {
          await context.page.goto(url, { waitUntil });
          return {
            url,
            navigated: true,
            finalUrl: context.page.url()
          };
        } catch (error) {
          return {
            url,
            navigated: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createValidateConditionOperation(): AtomicOperation {
    return {
      id: 'validate_condition',
      name: '验证条件',
      description: '验证指定条件是否满足',
      category: 'validate',
      version: '1.0.0',
      parameters: [
        {
          name: 'condition',
          type: 'string',
          required: true,
          description: '验证条件 (JavaScript表达式)'
        },
        {
          name: 'context',
          type: 'object',
          required: false,
          defaultValue: {},
          description: '上下文数据'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        try {
          const result = this.evaluateCondition(params.condition, params.context);
          return {
            condition: params.condition,
            result,
            valid: result
          };
        } catch (error) {
          return {
            condition: params.condition,
            result: false,
            valid: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private evaluateCondition(condition: string, data: any): boolean {
    try {
      return new Function('data', `return ${condition}`)(data);
    } catch (error) {
      this.warn(`条件评估失败: ${condition}`, { error });
      return false;
    }
  }

  private groupBy(items: any[], key: string): { [key: string]: number } {
    return items.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {} as { [key: string]: number });
  }

  private logInfo(message: string, data?: any): void {
    console.log(`[AtomicOperationEngine] ${message}`, data || '');
  }

  private logWarn(message: string, data?: any): void {
    console.warn(`[AtomicOperationEngine] ${message}`, data || '');
  }

  private error(message: string, data?: any): void {
    console.error(`[AtomicOperationEngine] ${message}`, data || '');
  }

  // 新增原子操作子实现

  private createWaitForTimeoutOperation(): AtomicOperation {
    return {
      id: 'wait_for_timeout',
      name: '等待超时',
      description: '等待指定的时间',
      category: 'validate',
      version: '1.0.0',
      parameters: [
        {
          name: 'timeout',
          type: 'number',
          required: true,
          description: '等待时间(毫秒)'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        const timeout = params.timeout;
        
        try {
          await new Promise(resolve => setTimeout(resolve, timeout));
          return {
            timeout,
            waited: true,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            timeout,
            waited: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createScreenshotOperation(): AtomicOperation {
    return {
      id: 'screenshot',
      name: '页面截图',
      description: '对当前页面或指定元素进行截图',
      category: 'extract',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: false,
          description: '元素选择器，不指定则截取整个页面'
        },
        {
          name: 'filename',
          type: 'string',
          required: false,
          description: '截图文件名'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const filename = params.filename || `screenshot-${Date.now()}.png`;

        try {
          let screenshot: Buffer;
          if (selector) {
            const element = await context.page.$(selector);
            if (!element) {
              throw new Error(`元素未找到: ${selector}`);
            }
            screenshot = await element.screenshot();
          } else {
            screenshot = await context.page.screenshot();
          }

          return {
            filename,
            selector,
            screenshot: 'base64_encoded_data',
            size: screenshot.length,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            filename,
            selector,
            screenshot: null,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createGetPageTitleOperation(): AtomicOperation {
    return {
      id: 'get_page_title',
      name: '获取页面标题',
      description: '获取当前页面的标题',
      category: 'extract',
      version: '1.0.0',
      parameters: [],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        try {
          const title = await context.page.title();
          return {
            title,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            title: null,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createGetPageUrlOperation(): AtomicOperation {
    return {
      id: 'get_page_url',
      name: '获取页面URL',
      description: '获取当前页面的URL',
      category: 'extract',
      version: '1.0.0',
      parameters: [],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        try {
          const url = context.page.url();
          return {
            url,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            url: null,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createScrollToElementOperation(): AtomicOperation {
    return {
      id: 'scroll_to_element',
      name: '滚动到元素',
      description: '滚动页面到指定元素位置',
      category: 'interact',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: '元素选择器'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;

        try {
          const element = await context.page.$(selector);
          if (!element) {
            throw new Error(`元素未找到: ${selector}`);
          }

          await element.scrollIntoViewIfNeeded();
          
          return {
            selector,
            scrolled: true,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            selector,
            scrolled: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createHoverElementOperation(): AtomicOperation {
    return {
      id: 'hover_element',
      name: '悬停元素',
      description: '鼠标悬停在指定元素上',
      category: 'interact',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: '元素选择器'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;

        try {
          const element = await context.page.$(selector);
          if (!element) {
            throw new Error(`元素未找到: ${selector}`);
          }

          await element.hover();
          
          return {
            selector,
            hovered: true,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            selector,
            hovered: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createCheckElementExistsOperation(): AtomicOperation {
    return {
      id: 'check_element_exists',
      name: '检查元素存在',
      description: '检查指定元素是否存在',
      category: 'validate',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: '元素选择器'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;

        try {
          const element = await context.page.$(selector);
          return {
            selector,
            exists: element !== null,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            selector,
            exists: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createGetElementCountOperation(): AtomicOperation {
    return {
      id: 'get_element_count',
      name: '获取元素数量',
      description: '获取匹配选择器的元素数量',
      category: 'extract',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: '元素选择器'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;

        try {
          const elements = await context.page.$$(selector);
          return {
            selector,
            count: elements.length,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            selector,
            count: 0,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createExtractHtmlOperation(): AtomicOperation {
    return {
      id: 'extract_html',
      name: '提取HTML',
      description: '提取元素的HTML内容',
      category: 'extract',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: '元素选择器'
        },
        {
          name: 'multi',
          type: 'boolean',
          required: false,
          defaultValue: false,
          description: '是否提取多个元素'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;
        const multi = params.multi || false;

        try {
          if (multi) {
            const elements = await context.page.$$(selector);
            const htmlContents = await Promise.all(
              elements.map(el => el.innerHTML())
            );
            return {
              selector,
              count: elements.length,
              htmlContents,
              timestamp: new Date()
            };
          } else {
            const element = await context.page.$(selector);
            const html = await element?.innerHTML();
            return {
              selector,
              html,
              timestamp: new Date()
            };
          }
        } catch (error) {
          return {
            selector,
            html: null,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createSwitchToFrameOperation(): AtomicOperation {
    return {
      id: 'switch_to_frame',
      name: '切换到框架',
      description: '切换到指定的iframe或frame',
      category: 'navigate',
      version: '1.0.0',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          required: true,
          description: '框架元素选择器'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const selector = params.selector;

        try {
          const frame = await context.page.frameSelector(selector);
          if (!frame) {
            throw new Error(`框架未找到: ${selector}`);
          }

          // 注意：这里需要根据具体的Playwright API调整
          await context.page.frameLocator(selector).locator('body').waitFor();
          
          return {
            selector,
            switched: true,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            selector,
            switched: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createSwitchToMainFrameOperation(): AtomicOperation {
    return {
      id: 'switch_to_main_frame',
      name: '切换到主框架',
      description: '切换回主页面框架',
      category: 'navigate',
      version: '1.0.0',
      parameters: [],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        try {
          // 这里需要根据具体的Playwright API调整
          await context.page.mainFrame();
          
          return {
            switched: true,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            switched: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createExecuteScriptOperation(): AtomicOperation {
    return {
      id: 'execute_script',
      name: '执行脚本',
      description: '在页面中执行JavaScript脚本',
      category: 'interact',
      version: '1.0.0',
      parameters: [
        {
          name: 'script',
          type: 'string',
          required: true,
          description: '要执行的JavaScript代码'
        },
        {
          name: 'args',
          type: 'array',
          required: false,
          defaultValue: [],
          description: '传递给脚本的参数'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const script = params.script;
        const args = params.args || [];

        try {
          const result = await context.page.evaluate(script, ...args);
          
          return {
            script,
            result,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            script,
            result: null,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  private createExtractTableDataOperation(): AtomicOperation {
    return {
      id: 'extract_table_data',
      name: '提取表格数据',
      description: '提取表格中的数据',
      category: 'extract',
      version: '1.0.0',
      parameters: [
        {
          name: 'tableSelector',
          type: 'string',
          required: true,
          description: '表格选择器'
        },
        {
          name: 'includeHeaders',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否包含表头'
        }
      ],
      execute: async (context: IExecutionContext, params: any) => {
        if (!context.page) {
          throw new Error('页面对象不可用');
        }

        const tableSelector = params.tableSelector;
        const includeHeaders = params.includeHeaders !== false;

        try {
          const table = await context.page.$(tableSelector);
          if (!table) {
            throw new Error(`表格未找到: ${tableSelector}`);
          }

          // 提取表头
          let headers: string[] = [];
          if (includeHeaders) {
            const headerElements = await table.$$('thead th, thead td, tr:first-child th, tr:first-child td');
            headers = await Promise.all(
              headerElements.map(th => th.textContent().then(text => text?.trim() || ''))
            );
          }

          // 提取表格数据
          const rowElements = await table.$$('tr:not(:first-child)');
          const rows: string[][] = [];
          
          for (const row of rowElements) {
            const cellElements = await row.$$('td, th');
            const rowData = await Promise.all(
              cellElements.map(cell => cell.textContent().then(text => text?.trim() || ''))
            );
            rows.push(rowData);
          }

          return {
            tableSelector,
            headers,
            rows,
            rowCount: rows.length,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            tableSelector,
            headers: [],
            rows: [],
            rowCount: 0,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }
}

// 工厂函数
export function createAtomicOperationEngine(stateCenter: SystemStateCenter): AtomicOperationEngine {
  return new AtomicOperationEngine(stateCenter);
}