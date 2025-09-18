/**
 * WebAuto Operations Framework 主入口文件
 * 基于操作对象的分类架构和自动扫描注册
 */

import BaseOperation from './src/BaseOperation.js';
import BrowserOperation from './src/browser/BrowserOperation.js';
import FileOperation from './src/file/FileOperation.js';
import AIOperation from './src/ai/AIOperation.js';
import CommunicationOperation from './src/communication/CommunicationOperation.js';
import OperationRegistry from './src/OperationRegistry.js';
import WorkflowEngine from './src/WorkflowEngine.js';
import { globalRegistry } from './src/OperationRegistry.js';

// 导入抽象步骤匹配系统
import { AbstractStepMatcher } from './src/abstraction/AbstractStepMatcher.js';
import { OperationMatcher } from './src/abstraction/OperationMatcher.js';
import { NestedOrchestrator } from './src/execution/NestedOrchestrator.js';
import { AbstractStepRegistry } from './src/abstraction/AbstractStepRegistry.js';

// 导出基础类
export {
  BaseOperation,
  BrowserOperation,
  FileOperation,
  AIOperation,
  CommunicationOperation,
  OperationRegistry,
  WorkflowEngine,
  // 抽象步骤匹配系统
  AbstractStepMatcher,
  OperationMatcher,
  NestedOrchestrator,
  AbstractStepRegistry
};

// 导出全局注册表实例
export { globalRegistry };

// 导出常用工具函数
export const utils = {
  /**
   * 自动发现并注册操作子
   */
  async autoRegisterOperations(directories, options = {}) {
    const scanResults = await globalRegistry.autoScan(directories, options);
    return scanResults;
  },

  /**
   * 创建工作流引擎
   */
  createWorkflowEngine(config = {}) {
    return new WorkflowEngine(config);
  },

  /**
   * 快速创建工作流
   */
  createWorkflow(steps, options = {}) {
    return {
      name: options.name || 'quick-workflow',
      description: options.description || 'Quick workflow',
      steps: Array.isArray(steps) ? steps : [steps],
      config: options.config || {}
    };
  },

  /**
   * 获取操作子统计信息
   */
  getOperationStats() {
    return globalRegistry.getStatistics();
  },

  /**
   * 创建抽象步骤匹配器
   */
  createAbstractStepMatcher(config = {}) {
    return new AbstractStepMatcher({
      operationRegistry: globalRegistry,
      ...config
    });
  },

  /**
   * 创建嵌套执行编排器
   */
  createNestedOrchestrator(config = {}) {
    return new NestedOrchestrator({
      operationRegistry: globalRegistry,
      ...config
    });
  },

  /**
   * 创建抽象步骤注册表
   */
  createAbstractStepRegistry(config = {}) {
    return new AbstractStepRegistry(config);
  }
};

// 默认配置
export const defaultConfig = {
  framework: {
    autoScan: true,
    scanDirectories: [
      './src/operations',
      './src/browser',
      './src/file', 
      './src/ai',
      './src/communication'
    ],
    enableMetrics: true,
    maxConcurrency: 3,
    defaultTimeout: 30000
  },
  categories: {
    browser: {
      enabled: true,
      defaultConfig: {
        headless: false,
        timeout: 30000
      }
    },
    file: {
      enabled: true,
      defaultConfig: {
        encoding: 'utf8',
        autoCreateDirs: true
      }
    },
    ai: {
      enabled: true,
      defaultConfig: {
        modelProvider: 'openai',
        maxTokens: 4000,
        temperature: 0.7
      }
    },
    communication: {
      enabled: true,
      defaultConfig: {
        timeout: 10000,
        retryAttempts: 3
      }
    }
  }
};

// 框架主类
export class WebAutoOperationsFramework {
  constructor(config = {}) {
    this.config = this.mergeConfig(config);
    this.registry = globalRegistry;
    this.workflowEngine = new WorkflowEngine(this.config.framework);
    this.initialized = false;
    this.logger = {
      info: (message, data = {}) => console.log(`[WebAutoFramework] INFO: ${message}`, data),
      warn: (message, data = {}) => console.warn(`[WebAutoFramework] WARN: ${message}`, data),
      error: (message, data = {}) => console.error(`[WebAutoFramework] ERROR: ${message}`, data),
      debug: (message, data = {}) => console.debug(`[WebAutoFramework] DEBUG: ${message}`, data)
    };
  }

  /**
   * 合并配置
   */
  mergeConfig(userConfig) {
    return {
      framework: { ...defaultConfig.framework, ...userConfig.framework },
      categories: { ...defaultConfig.categories, ...userConfig.categories }
    };
  }

  /**
   * 初始化框架
   */
  async initialize() {
    if (this.initialized) {
      this.logger.warn('Framework already initialized');
      return;
    }

    try {
      this.logger.info('Initializing WebAuto Operations Framework');

      // 自动扫描和注册操作子
      if (this.config.framework.autoScan) {
        const scanResults = await this.autoDiscoverOperations();
        this.logger.info('Auto-discovered operations', { count: scanResults.length });
      }

      // 注册内置工作流模板
      await this.registerBuiltInTemplates();

      this.initialized = true;
      this.logger.info('Framework initialized successfully', {
        operationsCount: this.registry.getAll().length,
        templatesCount: this.workflowEngine.workflowTemplates.size
      });

    } catch (error) {
      this.logger.error('Framework initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 自动发现操作子
   */
  async autoDiscoverOperations() {
    const directories = this.config.framework.scanDirectories;
    const scanOptions = {
      recursive: true,
      filePattern: /Operation\.js$/,
      classPattern: /class\s+(\w+Operation)\s+extends/,
      ignorePatterns: [/\.test\.js$/, /\.spec\.js$/, /node_modules/]
    };

    return await this.registry.autoScan(directories, scanOptions);
  }

  /**
   * 注册内置工作流模板
   */
  async registerBuiltInTemplates() {
    // 网页抓取工作流模板
    this.workflowEngine.registerTemplate('web-scraping', {
      name: 'Web Scraping Workflow',
      description: 'Standard web scraping workflow',
      steps: [
        {
          name: 'Navigate to page',
          operation: 'browser.navigation.PageNavigationOperation',
          params: {
            url: '${url}',
            waitUntil: 'domcontentloaded'
          }
        },
        {
          name: 'Extract content',
          operation: 'browser.content.ContentExtractionOperation',
          params: {
            selectors: '${selectors}'
          }
        },
        {
          name: 'Save results',
          operation: 'file.basic.FileWriteOperation',
          params: {
            filePath: '${outputPath}',
            format: '${format}'
          }
        }
      ]
    });

    // 文件处理工作流模板
    this.workflowEngine.registerTemplate('file-processing', {
      name: 'File Processing Workflow',
      description: 'Standard file processing workflow',
      steps: [
        {
          name: 'Read input file',
          operation: 'file.basic.FileReadOperation',
          params: {
            filePath: '${inputPath}'
          }
        },
        {
          name: 'Process content',
          operation: 'ai.processing.TextProcessingOperation',
          params: {
            processingType: '${processingType}'
          }
        },
        {
          name: 'Save processed file',
          operation: 'file.basic.FileWriteOperation',
          params: {
            filePath: '${outputPath}',
            format: '${format}'
          }
        }
      ]
    });

    // API调用工作流模板
    this.workflowEngine.registerTemplate('api-calls', {
      name: 'API Calls Workflow',
      description: 'Standard API calls workflow',
      steps: [
        {
          name: 'Make API request',
          operation: 'communication.http.HttpRequestOperation',
          params: {
            url: '${apiUrl}',
            method: '${method}',
            headers: '${headers}'
          }
        },
        {
          name: 'Process response',
          operation: 'ai.processing.TextProcessingOperation',
          params: {
            processingType: 'analyze'
          }
        }
      ]
    });
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(workflow, context = {}) {
    if (!this.initialized) {
      throw new Error('Framework not initialized. Call initialize() first.');
    }

    return await this.workflowEngine.execute(workflow, context);
  }

  /**
   * 获取框架状态
   */
  getStatus() {
    return {
      initialized: this.initialized,
      operations: this.registry.getStatistics(),
      workflows: this.workflowEngine.getMetrics(),
      activeWorkflows: this.workflowEngine.getActiveWorkflows(),
      config: this.config
    };
  }

  /**
   * 创建操作子实例
   */
  createOperation(operationName, config = {}) {
    return this.registry.createInstance(operationName, config);
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      this.workflowEngine.cleanup();
      this.registry.cleanup();
      this.initialized = false;
      this.logger.info('Framework cleaned up');
    } catch (error) {
      this.logger.error('Framework cleanup failed', { error: error.message });
    }
  }
}

// 创建默认框架实例
export const defaultFramework = new WebAutoOperationsFramework();

// 导出默认实例
export default defaultFramework;

// 如果在Node.js环境中，自动初始化
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  // 在实际使用时，用户需要手动调用 initialize()
  // defaultFramework.initialize().catch(console.error);
}