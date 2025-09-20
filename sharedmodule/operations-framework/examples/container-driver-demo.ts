/**
 * 容器系统驱动演示
 * 展示如何使用容器系统进行微博链接获取的完整流程
 */

import { chromium, Browser, Page } from 'playwright';
import {
  WeiboPageContainer,
  WeiboLinkContainer,
  WeiboScrollContainer,
  WeiboPaginationContainer,
  containerRegistry
} from '../src/containers/index.js';
import { containerConfigManager } from './container-integration-configs.js';

// ==================== 容器驱动器类 ====================

export class ContainerDriver {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private pageContainer: WeiboPageContainer | null = null;
  private sharedSpace: any;
  private executionLog: string[] = [];

  constructor() {
    this.sharedSpace = this.createSharedSpace();
    this.log('🚀 容器驱动器已创建');
  }

  // ==================== 核心驱动方法 ====================

  async initialize(): Promise<void> {
    this.log('🔧 开始初始化容器系统...');

    // 1. 启动浏览器
    this.browser = await chromium.launch({
      headless: false, // 设为false可以看到浏览器操作
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

    // 2. 设置页面事件监听
    this.setupPageEventListeners();

    this.log('✅ 浏览器环境初始化完成');
  }

  async executeLinkCapture(configType: string, targetUrl?: string): Promise<ExecutionResult> {
    this.log(`🎯 开始执行链接获取任务 [${configType}]...`);

    if (!this.page) {
      throw new Error('页面未初始化');
    }

    const startTime = Date.now();

    try {
      // 1. 获取配置
      const config = containerConfigManager.getConfig(configType);
      if (!config) {
        throw new Error(`配置 ${configType} 不存在`);
      }

      this.log(`📋 使用配置: ${config.name}`);

      // 2. 创建页面容器
      this.pageContainer = new WeiboPageContainer(config.pageConfig);

      // 3. 初始化页面容器
      await this.pageContainer.initialize(this.page, this.sharedSpace);

      // 4. 设置容器事件监听
      this.setupContainerEventListeners();

      // 5. 导航到目标页面
      if (targetUrl) {
        await this.navigateTo(targetUrl);
      }

      // 6. 执行容器任务
      const result = await this.runContainerTask(config);

      // 7. 生成执行报告
      const executionTime = Date.now() - startTime;
      const report = this.generateExecutionReport(result, executionTime, configType);

      this.log(`✅ 链接获取任务完成! 用时: ${executionTime / 1000}秒`);

      return {
        success: true,
        executionTime,
        result,
        report,
        configType,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.log(`❌ 链接获取任务失败: ${error.message}`);

      return {
        success: false,
        executionTime,
        error: error.message,
        configType,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async runContainerTask(config: any): Promise<ContainerTaskResult> {
    this.log('🔄 开始容器任务执行...');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('容器任务执行超时'));
      }, config.execution.timeout);

      // 监听任务完成事件
      this.pageContainer!.on('task:completed', (result) => {
        clearTimeout(timeout);
        this.log('🎉 容器任务完成');
        resolve(result);
      });

      // 监听错误事件
      this.pageContainer!.on('error', (error) => {
        clearTimeout(timeout);
        this.log(`💥 容器错误: ${error}`);
        reject(new Error(`容器错误: ${error}`));
      });

      // 启动容器
      this.pageContainer!.refresh({
        type: 'initialization',
        timestamp: Date.now()
      }).catch(reject);
    });
  }

  // ==================== 事件监听器设置 ====================

  private setupPageEventListeners(): void {
    if (!this.page) return;

    this.page.on('load', () => {
      this.log('📄 页面加载完成');
    });

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.log(`⚠️ 页面错误: ${msg.text()}`);
      }
    });

    this.page.on('response', (response) => {
      if (response.status() >= 400) {
        this.log(`🌐 HTTP错误: ${response.status()} ${response.url()}`);
      }
    });
  }

  private setupContainerEventListeners(): void {
    if (!this.pageContainer) return;

    // 页面级事件
    this.pageContainer.on('page:loaded', (data) => {
      this.log(`📄 页面加载: ${data.url}`);
    });

    this.pageContainer.on('navigation:completed', (data) => {
      this.log(`🧭 导航完成: ${data.fromUrl} → ${data.toUrl}`);
    });

    this.pageContainer.on('container:state_changed', (data) => {
      this.log(`🔧 容器状态 [${data.containerId}]: ${data.state}`);
    });

    // 链接发现事件
    this.pageContainer.on('page:links_updated', (data) => {
      const linkCount = data.data.links?.length || 0;
      this.log(`🔗 发现新链接: ${linkCount} 个`);
    });

    // 子容器事件
    const linkContainer = this.pageContainer.getChildContainer('linkContainer') as WeiboLinkContainer;
    if (linkContainer) {
      linkContainer.on('links:discovered', (data) => {
        this.log(`🆕 批量发现链接: ${data.links.length} 条, 总计: ${data.totalCount} 条`);
      });

      linkContainer.on('auto-operation:executed', (data) => {
        this.log(`🤖 自动操作: ${data.operationId} - ${data.success ? '成功' : '失败'}`);
      });

      linkContainer.on('pagination:completed', (data) => {
        this.log(`📄 分页完成: 第 ${data.page} 页`);
      });
    }

    // 滚动容器事件
    const scrollContainer = this.pageContainer.getChildContainer('scrollContainer') as WeiboScrollContainer;
    if (scrollContainer) {
      scrollContainer.on('scroll:completed', (data) => {
        this.log(`📜 滚动完成: ${data.scrollCount}次, 新内容${data.newContentLoaded ? '是' : '否'}`);
      });

      scrollContainer.on('scroll:stopped', (reason) => {
        this.log(`📜 滚动停止: ${reason}`);
      });
    }
  }

  // ==================== 导航和页面操作 ====================

  private async navigateTo(url: string): Promise<void> {
    this.log(`🧭 导航到: ${url}`);

    await this.page!.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // 等待页面稳定
    await this.page!.waitForTimeout(2000);
  }

  // ==================== 结果报告生成 ====================

  private generateExecutionReport(taskResult: ContainerTaskResult, executionTime: number, configType: string): ExecutionReport {
    const pageContainer = this.pageContainer!;
    const pageStats = pageContainer.getContainerStats();
    const allLinks = pageContainer.getAllLinks();

    // 统计链接类型
    const linkTypeStats = allLinks.reduce((acc, link) => {
      acc[link.containerType] = (acc[link.containerType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 统计域名
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
        type: configType,
        name: containerConfigManager.getConfig(configType)?.name || configType
      },
      performance: {
        executionTime,
        success: true
      },
      results: {
        totalLinks: allLinks.length,
        uniqueDomains: domainStats.size,
        linkTypeDistribution: linkTypeStats,
        linkSample: allLinks.slice(0, 10).map(link => ({
          url: link.href,
          type: link.containerType,
          author: link.author
        }))
      },
      containers: pageStats,
      system: {
        activeContainers: pageStats.activeContainers,
        totalContainers: pageStats.totalContainers,
        pageHealth: pageStats.pageHealth
      },
      executionLog: [...this.executionLog],
      timestamp: new Date().toISOString()
    };
  }

  // ==================== 辅助方法 ====================

  private createSharedSpace(): any {
    return {
      fileHandler: {
        saveFile: async (data: any, path: string) => {
          this.log(`💾 保存文件: ${path} (${data.length || 0} 字节)`);
        },
        readFile: async (path: string) => {
          this.log(`📖 读取文件: ${path}`);
          return null;
        },
        deleteFile: async (path: string) => {
          this.log(`🗑️ 删除文件: ${path}`);
        }
      },
      dataStore: new Map(),
      config: {
        timeout: 300000,
        logLevel: 'info',
        outputDir: './output'
      },
      monitoring: {
        startTime: Date.now(),
        events: [],
        metrics: new Map()
      }
    };
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    this.executionLog.push(logEntry);
    console.log(logEntry);
  }

  // ==================== 公共接口 ====================

  public getCurrentLinks(): any[] {
    return this.pageContainer?.getAllLinks() || [];
  }

  public getContainerStats(): any {
    return this.pageContainer?.getContainerStats() || {};
  }

  public getExecutionLog(): string[] {
    return [...this.executionLog];
  }

  // ==================== 清理方法 ====================

  async cleanup(): Promise<void> {
    this.log('🧹 开始清理资源...');

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
      this.executionLog = [];

      this.log('✅ 资源清理完成');

    } catch (error) {
      this.log(`⚠️ 清理资源时出错: ${error.message}`);
    }
  }
}

// ==================== 演示场景 ====================

export async function runHomepageDemo(): Promise<void> {
  console.log('🎯 演示场景1: 微博主页链接获取');
  console.log('========================================');

  const driver = new ContainerDriver();

  try {
    // 初始化
    await driver.initialize();

    // 执行主页链接获取
    const result = await driver.executeLinkCapture('homepage', 'https://weibo.com');

    if (result.success) {
      console.log('\n✅ 演示成功!');
      console.log('📊 执行结果:');
      console.log(`   - 执行时间: ${result.executionTime / 1000}秒`);
      console.log(`   - 获取链接数: ${result.report.results.totalLinks}`);
      console.log(`   - 唯一域名数: ${result.report.results.uniqueDomains}`);
      console.log(`   - 链接类型分布: ${JSON.stringify(result.report.results.linkTypeDistribution)}`);

      // 显示链接示例
      const linkSample = result.report.results.linkSample.slice(0, 5);
      console.log('\n🔗 链接示例:');
      linkSample.forEach((link, index) => {
        console.log(`   ${index + 1}. [${link.type}] ${link.url}`);
      });

      // 显示容器统计
      console.log('\n📦 容器统计:');
      console.log(`   - 活跃容器数: ${result.report.system.activeContainers}`);
      console.log(`   - 总容器数: ${result.report.system.totalContainers}`);
      console.log(`   - 页面健康状态: ${result.report.system.pageHealth}`);

    } else {
      console.error('❌ 演示失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 演示过程中出错:', error);
  } finally {
    await driver.cleanup();
  }
}

export async function runSearchDemo(): Promise<void> {
  console.log('\n🎯 演示场景2: 微博搜索链接获取');
  console.log('========================================');

  const driver = new ContainerDriver();

  try {
    // 初始化
    await driver.initialize();

    // 执行搜索链接获取
    const keyword = '技术';
    const searchUrl = `https://weibo.com/search?q=${encodeURIComponent(keyword)}`;
    const result = await driver.executeLinkCapture('search', searchUrl);

    if (result.success) {
      console.log('\n✅ 搜索演示成功!');
      console.log('📊 执行结果:');
      console.log(`   - 搜索关键词: ${keyword}`);
      console.log(`   - 执行时间: ${result.executionTime / 1000}秒`);
      console.log(`   - 获取链接数: ${result.report.results.totalLinks}`);
      console.log(`   - 唯一域名数: ${result.report.results.uniqueDomains}`);

      // 显示链接示例
      const linkSample = result.report.results.linkSample.slice(0, 5);
      console.log('\n🔗 搜索结果示例:');
      linkSample.forEach((link, index) => {
        console.log(`   ${index + 1}. [${link.type}] ${link.url}`);
      });

    } else {
      console.error('❌ 搜索演示失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 搜索演示过程中出错:', error);
  } finally {
    await driver.cleanup();
  }
}

export async function runCustomDemo(): Promise<void> {
  console.log('\n🎯 演示场景3: 自定义配置演示');
  console.log('========================================');

  const driver = new ContainerDriver();

  try {
    // 初始化
    await driver.initialize();

    // 创建自定义配置（混合模式）
    const customConfig = containerConfigManager.createCustomConfig('hybrid', {
      name: '自定义混合模式演示',
      description: '展示滚动和分页混合使用的自定义配置',
      pageConfig: {
        containerConfigs: {
          linkContainer: {
            maxLinks: 50, // 减少链接数量用于演示
            enableAutoScroll: true,
            enableAutoPagination: true
          }
        }
      },
      execution: {
        timeout: 300000, // 5分钟
        logLevel: 'debug'
      }
    });

    // 手动设置配置到管理器
    containerConfigManager.registerConfig('custom-demo', customConfig);

    // 执行自定义链接获取
    const result = await driver.executeLinkCapture('custom-demo', 'https://weibo.com');

    if (result.success) {
      console.log('\n✅ 自定义演示成功!');
      console.log('📊 执行结果:');
      console.log(`   - 配置名称: ${result.report.config.name}`);
      console.log(`   - 执行时间: ${result.executionTime / 1000}秒`);
      console.log(`   - 获取链接数: ${result.report.results.totalLinks}`);

      // 显示执行日志的最后几条
      console.log('\n📋 执行日志:');
      const logs = driver.getExecutionLog().slice(-10);
      logs.forEach(log => {
        console.log(`   ${log}`);
      });

    } else {
      console.error('❌ 自定义演示失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 自定义演示过程中出错:', error);
  } finally {
    await driver.cleanup();
  }
}

// ==================== 主程序入口 ====================

export async function runContainerDriverDemo(): Promise<void> {
  console.log('🚀 容器系统驱动演示');
  console.log('===================');
  console.log('本演示将展示如何使用容器系统进行微博链接获取');
  console.log('包括主页获取、搜索获取和自定义配置三种场景\n');

  try {
    // 演示1: 主页链接获取
    await runHomepageDemo();

    // 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 演示2: 搜索链接获取
    await runSearchDemo();

    // 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 演示3: 自定义配置
    await runCustomDemo();

    console.log('\n🎉 所有演示完成!');
    console.log('================');
    console.log('📚 演示总结:');
    console.log('1. 容器系统提供了灵活的配置管理');
    console.log('2. 支持多种链接获取策略（滚动、分页、混合）');
    console.log('3. 实现了完整的事件监控和错误处理');
    console.log('4. 提供了详细的执行日志和统计信息');
    console.log('5. 可以轻松扩展新的容器类型');

  } catch (error) {
    console.error('❌ 演示过程中出错:', error);
  }
}

// ==================== 类型定义 ====================

export interface ExecutionResult {
  success: boolean;
  executionTime: number;
  result?: ContainerTaskResult;
  report?: ExecutionReport;
  error?: string;
  configType: string;
  timestamp: string;
}

export interface ContainerTaskResult {
  completed: boolean;
  message: string;
  data?: any;
}

export interface ExecutionReport {
  config: {
    type: string;
    name: string;
  };
  performance: {
    executionTime: number;
    success: boolean;
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
  };
  executionLog: string[];
  timestamp: string;
}

// 如果直接运行此文件，执行演示
if (require.main === module) {
  runContainerDriverDemo().catch(console.error);
}