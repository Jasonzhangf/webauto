/**
 * 容器系统集成使用示例
 * 展示如何使用新的容器系统进行微博链接获取
 */

import { chromium, Browser, Page } from 'playwright';
import {
  WeiboPageContainer,
  WeiboLinkContainer,
  WeiboScrollContainer,
  WeiboPaginationContainer
} from '../src/containers/index.js';
import {
  containerConfigManager,
  ContainerSystemConfig
} from './container-integration-configs.js';

// ==================== 容器系统集成器 ====================

export class ContainerSystemIntegrator {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private pageContainer: WeiboPageContainer | null = null;
  private config: ContainerSystemConfig;
  private sharedSpace: any;

  constructor(config: ContainerSystemConfig) {
    this.config = config;
    this.sharedSpace = this.createSharedSpace();
  }

  // ==================== 初始化方法 ====================

  async initialize(): Promise<void> {
    console.log('🚀 初始化容器系统...');

    // 1. 启动浏览器
    this.browser = await chromium.launch({
      headless: false,
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

    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1920, height: 1080 });

    // 2. 创建页面容器
    this.pageContainer = new WeiboPageContainer(this.config.pageConfig);

    // 3. 初始化页面容器
    await this.pageContainer.initialize(this.page, this.sharedSpace);

    console.log('✅ 容器系统初始化完成');
  }

  // ==================== 执行方法 ====================

  async execute(targetUrl?: string): Promise<ContainerExecutionResult> {
    if (!this.pageContainer || !this.page) {
      throw new Error('容器系统未初始化');
    }

    console.log('🎯 开始执行链接获取任务...');
    const startTime = Date.now();

    try {
      // 1. 导航到目标页面
      if (targetUrl) {
        await this.page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
      }

      // 2. 设置事件监听器
      this.setupEventListeners();

      // 3. 执行容器任务
      const result = await this.runContainerTask();

      // 4. 生成执行报告
      const executionTime = Date.now() - startTime;
      const report = this.generateExecutionReport(result, executionTime);

      return {
        success: true,
        executionTime,
        result,
        report,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ 容器系统执行失败:', error);
      return {
        success: false,
        executionTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async runContainerTask(): Promise<ContainerTaskResult> {
    const pageContainer = this.pageContainer!;

    // 等待容器完成所有任务
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('容器任务执行超时'));
      }, this.config.execution.timeout);

      // 监听任务完成事件
      pageContainer.on('task:completed', (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      // 监听错误事件
      pageContainer.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`容器错误: ${error}`));
      });

      // 启动容器刷新
      pageContainer.refresh({
        type: 'initialization',
        timestamp: Date.now()
      }).catch(reject);
    });
  }

  // ==================== 事件监听器设置 ====================

  private setupEventListeners(): void {
    if (!this.pageContainer) return;

    // 页面级事件
    this.pageContainer.on('page:loaded', (data) => {
      console.log(`📄 页面加载完成: ${data.url}`);
    });

    this.pageContainer.on('page:error', (error) => {
      console.error(`📄 页面错误: ${error.message}`);
    });

    this.pageContainer.on('navigation:completed', (data) => {
      console.log(`🧭 导航完成: ${data.fromUrl} → ${data.toUrl}`);
    });

    // 容器状态事件
    this.pageContainer.on('container:state_changed', (data) => {
      console.log(`🔧 容器状态变化 [${data.containerId}]: ${data.state}`);
    });

    // 链接发现事件
    this.pageContainer.on('page:links_updated', (data) => {
      console.log(`🔗 链接更新 [${data.containerId}]: 发现 ${data.data.links?.length || 0} 个新链接`);
    });

    // 错误事件
    this.pageContainer.on('container:error', (data) => {
      console.error(`❌ 容器错误 [${data.containerId}]: ${data.error}`);
    });

    // 子容器特定事件
    const linkContainer = this.pageContainer.getChildContainer('linkContainer') as WeiboLinkContainer;
    if (linkContainer) {
      linkContainer.on('links:discovered', (data) => {
        console.log(`🆕 发现新链接: ${data.links.length} 条, 总计: ${data.totalCount} 条`);
      });

      linkContainer.on('auto-operation:executed', (data) => {
        console.log(`🤖 自动操作: ${data.operationId} - ${data.success ? '成功' : '失败'}`);
      });
    }
  }

  // ==================== 结果报告生成 ====================

  private generateExecutionReport(taskResult: ContainerTaskResult, executionTime: number): ExecutionReport {
    const pageContainer = this.pageContainer!;
    const pageStats = pageContainer.getContainerStats();
    const allLinks = pageContainer.getAllLinks();

    // 统计链接类型分布
    const linkTypeStats = allLinks.reduce((acc, link) => {
      acc[link.containerType] = (acc[link.containerType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 统计域名分布
    const domainStats = new Set<string>();
    allLinks.forEach(link => {
      try {
        const url = new URL(link.href);
        domainStats.add(url.hostname);
      } catch (error) {
        // 忽略无效URL
      }
    });

    return {
      config: {
        name: this.config.name,
        type: this.config.type,
        description: this.config.description
      },
      performance: {
        executionTime,
        timeout: this.config.execution.timeout,
        isTimeout: executionTime > this.config.execution.timeout,
        averageContainerResponse: this.calculateAverageResponseTime()
      },
      results: {
        totalLinks: allLinks.length,
        uniqueDomains: domainStats.size,
        linkTypeDistribution: linkTypeStats,
        linkSample: allLinks.slice(0, 5).map(link => ({
          url: link.href,
          type: link.containerType,
          author: link.author
        }))
      },
      containers: pageStats,
      system: {
        activeContainers: pageStats.activeContainers,
        totalContainers: pageStats.totalContainers,
        pageHealth: pageStats.pageHealth,
        navigationHistory: pageStats.navigationHistory,
        reloadAttempts: pageStats.reloadAttempts
      },
      timestamp: new Date().toISOString()
    };
  }

  private calculateAverageResponseTime(): number {
    // 这里可以添加容器响应时间统计逻辑
    return 0; // 占位符
  }

  // ==================== 清理方法 ====================

  async cleanup(): Promise<void> {
    console.log('🧹 清理容器系统...');

    try {
      // 清理容器
      if (this.pageContainer) {
        await this.pageContainer.cleanup();
        this.pageContainer = null;
      }

      // 关闭浏览器
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.page = null;

      console.log('✅ 容器系统清理完成');

    } catch (error) {
      console.error('❌ 清理容器系统时出错:', error);
    }
  }

  // ==================== 共享空间创建 ====================

  private createSharedSpace(): any {
    return {
      // 文件操作
      fileHandler: {
        saveFile: async (data: any, path: string) => {
          // 实现文件保存逻辑
          console.log(`💾 保存文件: ${path}`);
        },
        readFile: async (path: string) => {
          // 实现文件读取逻辑
          console.log(`📖 读取文件: ${path}`);
          return null;
        },
        deleteFile: async (path: string) => {
          // 实现文件删除逻辑
          console.log(`🗑️ 删除文件: ${path}`);
        }
      },

      // 数据存储
      dataStore: new Map(),

      // 配置参数
      config: {
        timeout: this.config.execution.timeout,
        logLevel: this.config.execution.logLevel,
        outputDir: './output'
      },

      // 监控数据
      monitoring: {
        startTime: Date.now(),
        events: [],
        metrics: new Map()
      }
    };
  }

  // ==================== 公共接口 ====================

  public getPageContainer(): WeiboPageContainer | null {
    return this.pageContainer;
  }

  public getAllLinks(): any[] {
    return this.pageContainer?.getAllLinks() || [];
  }

  public getContainerStats(): any {
    return this.pageContainer?.getContainerStats() || {};
  }
}

// ==================== 类型定义 ====================

export interface ContainerExecutionResult {
  success: boolean;
  executionTime: number;
  result?: ContainerTaskResult;
  report?: ExecutionReport;
  error?: string;
  timestamp: string;
}

export interface ContainerTaskResult {
  completed: boolean;
  message: string;
  data?: any;
}

export interface ExecutionReport {
  config: {
    name: string;
    type: string;
    description: string;
  };
  performance: {
    executionTime: number;
    timeout: number;
    isTimeout: boolean;
    averageContainerResponse: number;
  };
  results: {
    totalLinks: number;
    uniqueDomains: number;
    linkTypeDistribution: Record<string, number>;
    linkSample: Array<{
      url: string;
      type: string;
      author?: string;
    }>;
  };
  containers: any;
  system: {
    activeContainers: number;
    totalContainers: number;
    pageHealth: string;
    navigationHistory: number;
    reloadAttempts: number;
  };
  timestamp: string;
}

// ==================== 使用示例 ====================

export async function runHomepageLinkCapture(): Promise<void> {
  console.log('🎯 开始微博主页链接获取示例...');

  // 获取主页配置
  const config = containerConfigManager.getConfig('homepage');
  if (!config) {
    throw new Error('主页配置不存在');
  }

  // 显示配置摘要
  console.log(containerConfigManager.getConfigSummary('homepage'));

  // 创建集成器
  const integrator = new ContainerSystemIntegrator(config);

  try {
    // 初始化系统
    await integrator.initialize();

    // 执行任务
    const result = await integrator.execute('https://weibo.com');

    if (result.success) {
      console.log('✅ 链接获取任务完成!');
      console.log('📊 执行结果:', {
        executionTime: `${result.executionTime / 1000}秒`,
        totalLinks: result.report?.results.totalLinks,
        uniqueDomains: result.report?.results.uniqueDomains,
        linkTypes: result.report?.results.linkTypeDistribution
      });

      // 显示链接示例
      const linkSample = result.report?.results.linkSample || [];
      if (linkSample.length > 0) {
        console.log('🔗 链接示例:');
        linkSample.forEach((link, index) => {
          console.log(`  ${index + 1}. ${link.type}: ${link.url}`);
        });
      }
    } else {
      console.error('❌ 链接获取任务失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 执行过程中出错:', error);
  } finally {
    await integrator.cleanup();
  }
}

export async function runSearchLinkCapture(keyword: string): Promise<void> {
  console.log(`🎯 开始微博搜索链接获取示例 (关键词: ${keyword})...`);

  // 获取搜索配置
  const config = containerConfigManager.getConfig('search');
  if (!config) {
    throw new Error('搜索配置不存在');
  }

  // 修改URL模式以包含关键词
  const customConfig = containerConfigManager.createCustomConfig('search', {
    pageConfig: {
      ...config.pageConfig,
      containerConfigs: {
        ...config.pageConfig.containerConfigs,
        paginationContainer: {
          ...config.pageConfig.containerConfigs?.paginationContainer,
          urlPattern: `https://weibo.com/search?q=${keyword}&page={page}`
        }
      }
    },
    paginationConfig: {
      ...config.paginationConfig,
      urlPattern: `https://weibo.com/search?q=${keyword}&page={page}`
    }
  });

  // 创建集成器
  const integrator = new ContainerSystemIntegrator(customConfig);

  try {
    // 初始化系统
    await integrator.initialize();

    // 执行任务
    const result = await integrator.execute(`https://weibo.com/search?q=${encodeURIComponent(keyword)}`);

    if (result.success) {
      console.log('✅ 搜索链接获取任务完成!');
      console.log('📊 执行结果:', {
        executionTime: `${result.executionTime / 1000}秒`,
        totalLinks: result.report?.results.totalLinks,
        uniqueDomains: result.report?.results.uniqueDomains
      });
    } else {
      console.error('❌ 搜索链接获取任务失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 执行过程中出错:', error);
  } finally {
    await integrator.cleanup();
  }
}

// ==================== 主程序入口 ====================

export async function main(): Promise<void> {
  console.log('🚀 微博容器系统集成示例');
  console.log('==============================');

  // 示例1：主页链接获取
  console.log('\n📋 示例1: 微博主页链接获取');
  await runHomepageLinkCapture();

  // 等待一段时间
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 示例2：搜索链接获取
  console.log('\n📋 示例2: 微博搜索链接获取');
  await runSearchLinkCapture('技术');
}

// 如果直接运行此文件，执行主程序
if (require.main === module) {
  main().catch(console.error);
}