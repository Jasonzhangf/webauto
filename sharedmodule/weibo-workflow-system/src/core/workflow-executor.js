/**
 * 通用工作流执行器
 * 支持多种工作流类型的统一执行接口
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 工作流执行器基类
 */
class BaseWorkflowExecutor {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.results = null;
    this.isInitialized = false;
  }

  /**
   * 初始化工作流执行器
   */
  async initialize(options = {}) {
    try {
      console.log('🚀 初始化工作流执行器...');

      // 创建必要的目录
      await this.createDirectories();

      // 启动浏览器
      this.browser = await chromium.launch({
        headless: options.headless || false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      // 创建浏览器上下文
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      });

      // 创建页面
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.workflow?.timeout || 30000);

      this.isInitialized = true;
      console.log('✅ 工作流执行器初始化完成');

      return true;

    } catch (error) {
      console.error('❌ 工作流执行器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建必要的目录
   */
  async createDirectories() {
    const directories = [
      './results',
      './logs',
      './screenshots',
      './cookies'
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  /**
   * 执行工作流 - 抽象方法，需要子类实现
   */
  async execute(options = {}) {
    throw new Error('execute method must be implemented by subclass');
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      
      if (this.context) {
        await this.context.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }

      console.log('🧹 工作流执行器资源清理完成');

    } catch (error) {
      console.error('❌ 清理资源失败:', error);
    }
  }

  /**
   * 加载Cookie
   */
  async loadCookies(cookieFile) {
    try {
      if (!cookieFile || !this.context) {
        return;
      }

      console.log('🍪 加载Cookie文件:', cookieFile);

      const cookieData = await fs.readFile(cookieFile, 'utf8');
      const cookies = JSON.parse(cookieData);

      await this.context.addCookies(cookies);
      console.log('✅ Cookie加载完成，共加载', cookies.length, '个Cookie');

    } catch (error) {
      console.error('❌ Cookie加载失败:', error);
    }
  }

  /**
   * 保存Cookie
   */
  async saveCookies(cookieFile) {
    try {
      if (!cookieFile || !this.context) {
        return;
      }

      console.log('💾 保存Cookie到文件:', cookieFile);

      const cookies = await this.context.cookies();
      await fs.writeFile(cookieFile, JSON.stringify(cookies, null, 2));
      console.log('✅ Cookie保存完成，共保存', cookies.length, '个Cookie');

    } catch (error) {
      console.error('❌ Cookie保存失败:', error);
    }
  }

  /**
   * 截图
   */
  async takeScreenshot(name = 'screenshot') {
    try {
      if (!this.page) return null;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      const filepath = path.join('./screenshots', filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      console.log('📸 截图已保存:', filepath);
      return filepath;

    } catch (error) {
      console.error('❌ 截图失败:', error);
      return null;
    }
  }

  /**
   * 保存结果
   */
  async saveResults(results, filename = null) {
    try {
      const outputFile = filename || this.config.output?.filename || 'workflow-results.json';
      const outputPath = path.join('./results', outputFile);

      await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
      console.log('📁 结果已保存到:', outputPath);
      return outputPath;

    } catch (error) {
      console.error('❌ 保存结果失败:', error);
      return null;
    }
  }
}

/**
 * 工作流管理器
 * 统一管理各种类型的工作流
 */
class WorkflowManager {
  constructor() {
    this.workflows = new Map();
    this.executors = new Map();
  }

  /**
   * 注册工作流
   */
  registerWorkflow(name, workflowConfig, executorClass, workflowExecutorClass = null) {
    this.workflows.set(name, {
      config: workflowConfig,
      executorClass: executorClass,
      workflowExecutorClass: workflowExecutorClass
    });
    console.log(`✅ 工作流已注册: ${name}`);
  }

  /**
   * 创建工作流执行器
   */
  createExecutor(workflowName, options = {}) {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`工作流未找到: ${workflowName}`);
    }

    const executor = new workflow.executorClass(workflow.config, workflow.workflowExecutorClass);
    this.executors.set(workflowName, executor);
    
    return executor;
  }

  /**
   * 执行工作流
   */
  async execute(workflowName, options = {}) {
    try {
      console.log(`🔧 开始执行工作流: ${workflowName}`);

      // 创建执行器
      const executor = this.createExecutor(workflowName, options);

      // 初始化
      await executor.initialize(options);

      // 加载Cookie（如果指定）
      if (options.cookieFile) {
        await executor.loadCookies(options.cookieFile);
      }

      // 执行工作流
      const results = await executor.execute(options);

      // 保存结果
      if (results.success && options.saveResults !== false) {
        await executor.saveResults(results, options.outputFile);
      }

      // 保存Cookie（如果指定）
      if (options.saveCookieFile) {
        await executor.saveCookies(options.saveCookieFile);
      }

      console.log(`✅ 工作流执行完成: ${workflowName}`);
      return results;

    } catch (error) {
      console.error(`❌ 工作流执行失败: ${workflowName}`, error);
      return {
        success: false,
        error: error.message,
        workflowName: workflowName
      };
    } finally {
      // 清理资源
      const executor = this.executors.get(workflowName);
      if (executor) {
        await executor.cleanup();
        this.executors.delete(workflowName);
      }
    }
  }

  /**
   * 批量执行工作流
   */
  async executeBatch(workflowConfigs, options = {}) {
    const results = [];

    for (const config of workflowConfigs) {
      try {
        console.log(`🔄 执行工作流: ${config.name}`);
        
        const result = await this.execute(config.name, {
          ...options,
          ...config.options
        });

        results.push({
          workflowName: config.name,
          success: result.success,
          results: result,
          timestamp: new Date().toISOString()
        });

        // 工作流间隔
        if (options.delayBetweenWorkflows) {
          await new Promise(resolve => setTimeout(resolve, options.delayBetweenWorkflows));
        }

      } catch (error) {
        console.error(`❌ 工作流执行失败: ${config.name}`, error);
        results.push({
          workflowName: config.name,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return results;
  }

  /**
   * 获取工作流列表
   */
  getWorkflowList() {
    return Array.from(this.workflows.keys());
  }

  /**
   * 获取工作流配置
   */
  getWorkflowConfig(workflowName) {
    const workflow = this.workflows.get(workflowName);
    return workflow ? workflow.config : null;
  }
}

/**
 * 工作流执行器适配器
 * 将现有工作流适配为统一接口
 */
class WorkflowExecutorAdapter extends BaseWorkflowExecutor {
  constructor(workflowConfig, workflowExecutorClass) {
    super(workflowConfig);
    this.workflowExecutorClass = workflowExecutorClass;
    this.workflowExecutor = null;
  }

  /**
   * 初始化工作流执行器
   */
  async initialize(options = {}) {
    await super.initialize(options);
    
    // 创建特定的工作流执行器
    this.workflowExecutor = new this.workflowExecutorClass(this.config);
    await this.workflowExecutor.initialize();
    
    return true;
  }

  /**
   * 执行工作流
   */
  async execute(options = {}) {
    try {
      console.log('🔧 执行适配的工作流...');

      // 导航到目标URL
      const targetUrl = this.config.workflow?.targetUrl || options.targetUrl;
      if (targetUrl) {
        console.log('🌐 导航到目标URL:', targetUrl);
        await this.page.goto(targetUrl, { 
          waitUntil: 'networkidle',
          timeout: this.config.workflow?.timeout || 30000 
        });
      }

      // 执行具体的工作流
      const results = await this.workflowExecutor.execute(this.page, options);

      // 合并结果
      this.results = results;

      return results;

    } catch (error) {
      console.error('❌ 工作流执行失败:', error);
      return {
        success: false,
        error: error.message,
        workflowName: this.config.workflow?.name
      };
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.workflowExecutor) {
      // 调用特定工作流的清理方法
      if (typeof this.workflowExecutor.cleanup === 'function') {
        await this.workflowExecutor.cleanup();
      }
    }
    
    await super.cleanup();
  }
}

/**
 * 快速执行函数
 * 便捷的工作流执行接口
 */
async function executeWorkflow(workflowName, options = {}) {
  const workflowManager = new WorkflowManager();
  
  // 注册默认的工作流
  await registerDefaultWorkflows(workflowManager);
  
  // 执行工作流
  return await workflowManager.execute(workflowName, options);
}

/**
 * 注册默认工作流
 */
async function registerDefaultWorkflows(workflowManager) {
  try {
    // 动态导入工作流配置
    const { WeiboHomepagePostsExtractionWorkflow } = require('../workflows/weibo-homepage-posts-extraction-workflow');
    const { WeiboHomepagePostsExtractionWorkflowExecutor } = require('../workflows/weibo-homepage-posts-extraction-workflow');

    // 注册微博主页帖子提取工作流
    workflowManager.registerWorkflow(
      'weibo-homepage-posts-extraction',
      WeiboHomepagePostsExtractionWorkflow,
      WorkflowExecutorAdapter,
      WeiboHomepagePostsExtractionWorkflowExecutor
    );

    console.log('✅ 默认工作流注册完成');

  } catch (error) {
    console.error('❌ 注册默认工作流失败:', error);
  }
}

/**
 * 工作流执行工具函数
 */
const WorkflowUtils = {
  /**
   * 创建工作流执行器
   */
  createExecutor(workflowConfig, executorClass = WorkflowExecutorAdapter) {
    return new executorClass(workflowConfig, executorClass);
  },

  /**
   * 验证工作流配置
   */
  validateWorkflowConfig(config) {
    const required = ['workflow'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`工作流配置缺少必需字段: ${missing.join(', ')}`);
    }

    const workflowRequired = ['name', 'targetUrl'];
    const workflowMissing = workflowRequired.filter(field => !config.workflow[field]);
    
    if (workflowMissing.length > 0) {
      throw new Error(`工作流配置缺少必需字段: ${workflowMissing.join(', ')}`);
    }

    return true;
  },

  /**
   * 格式化工作流结果
   */
  formatResults(results) {
    return {
      success: results.success,
      workflowName: results.workflowName,
      timestamp: new Date().toISOString(),
      data: results.posts || results.results || [],
      metadata: results.metadata || {},
      error: results.error || null
    };
  },

  /**
   * 生成工作流报告
   */
  generateReport(results) {
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalWorkflows: Array.isArray(results) ? results.length : 1,
        successfulWorkflows: Array.isArray(results) ? 
          results.filter(r => r.success).length : 
          (results.success ? 1 : 0),
        failedWorkflows: Array.isArray(results) ? 
          results.filter(r => !r.success).length : 
          (results.success ? 0 : 1)
      },
      results: Array.isArray(results) ? results : [results]
    };
  }
};

module.exports = {
  BaseWorkflowExecutor,
  WorkflowManager,
  WorkflowExecutorAdapter,
  WorkflowUtils,
  executeWorkflow,
  registerDefaultWorkflows
};