/**
 * 页面生命周期监控器
 * 负责监控浏览器页面的创建、刷新、关闭事件，并自动重新注入JavaScript连接协议
 */
import EventEmitter from 'events';

class PageLifecycleMonitor extends EventEmitter {
  constructor(browserService) {
    super();
    this.browserService = browserService;
    this.pageRegistry = new Map(); // 页面注册表: pageId -> pageInfo
    this.injectionQueue = new Set(); // 待注入队列
    this.monitoringInterval = 2000; // 监控间隔 2秒
    this.isMonitoring = false;
    this.monitoringTimer = null;

    // 页面信息结构
    this.pageInfoStructure = {
      page: null,
      pageId: '',
      lastUrl: '',
      lastInjection: null,
      injectionAttempts: 0,
      createdAt: null,
      lastActivity: null,
      status: 'pending' // pending, injecting, connected, failed
    };
  }

  /**
   * 启动页面监控
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ 页面监控已在运行中');
      return;
    }

    console.log('🔍 启动页面生命周期监控...');
    this.isMonitoring = true;

    // 初始化现有页面
    this.initializeExistingPages();

    // 开始监控循环
    this.monitoringTimer = setInterval(() => {
      this.monitorLoop().catch(error => {
        console.error('❌ 监控循环错误:', error);
      });
    }, this.monitoringInterval);

    console.log('✅ 页面生命周期监控已启动');
  }

  /**
   * 停止页面监控
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ 页面监控未在运行');
      return;
    }

    console.log('🛑 停止页面生命周期监控...');
    this.isMonitoring = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    this.pageRegistry.clear();
    this.injectionQueue.clear();

    console.log('✅ 页面生命周期监控已停止');
  }

  /**
   * 初始化现有页面
   */
  async initializeExistingPages() {
    try {
      if (!this.browserService.context) {
        console.log('⚠️ 浏览器上下文未初始化，稍后重试');
        return;
      }

      const existingPages = this.browserService.context.pages();
      console.log(`📋 发现 ${existingPages.length} 个现有页面`);

      for (const page of existingPages) {
        const pageId = this.getPageId(page);
        await this.registerPage(page, pageId, 'existing');
      }
    } catch (error) {
      console.error('❌ 初始化现有页面失败:', error);
    }
  }

  /**
   * 监控主循环
   */
  async monitorLoop() {
    if (!this.isMonitoring || !this.browserService.context) {
      return;
    }

    try {
      // 1. 检查页面变化
      await this.checkPageChanges();

      // 2. 处理注入队列
      await this.processInjectionQueue();

      // 3. 清理已关闭页面
      this.cleanupClosedPages();

      // 4. 发送心跳事件
      this.emit('heartbeat', {
        registrySize: this.pageRegistry.size,
        queueSize: this.injectionQueue.size,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ 监控循环执行失败:', error);
      this.emit('error', error);
    }
  }

  /**
   * 检查页面变化
   */
  async checkPageChanges() {
    const currentPages = this.browserService.context.pages();
    const currentPageIds = new Set(currentPages.map(page => this.getPageId(page)));

    // 检测新增页面
    for (const page of currentPages) {
      const pageId = this.getPageId(page);
      if (!this.pageRegistry.has(pageId)) {
        await this.handleNewPage(page, pageId);
      }
    }

    // 检测页面URL变化（刷新）
    for (const [pageId, pageInfo] of this.pageRegistry) {
      if (pageInfo.page.isClosed()) {
        continue; // 将在cleanup阶段处理
      }

      try {
        const currentUrl = pageInfo.page.url();
        if (currentUrl !== pageInfo.lastUrl && currentUrl !== 'about:blank') {
          await this.handlePageRefresh(pageInfo.page, pageId, currentUrl);
        }
      } catch (error) {
        // 页面可能正在加载中，暂时忽略
        console.debug(`页面 ${pageId} URL检查失败:`, error.message);
      }
    }
  }

  /**
   * 处理新页面
   */
  async handleNewPage(page, pageId) {
    console.log(`🆕 检测到新页面: ${pageId}`);

    await this.registerPage(page, pageId, 'new');

    // 设置页面事件监听
    this.setupPageEventListeners(page, pageId);

    // 添加到注入队列
    this.injectionQueue.add(pageId);

    this.emit('newPage', { page, pageId });
  }

  /**
   * 处理页面刷新
   */
  async handlePageRefresh(page, pageId, newUrl) {
    console.log(`🔄 检测到页面刷新: ${pageId} -> ${newUrl}`);

    const pageInfo = this.pageRegistry.get(pageId);
    if (!pageInfo) return;

    // 更新页面信息
    pageInfo.lastUrl = newUrl;
    pageInfo.lastInjection = null;
    pageInfo.injectionAttempts = 0;
    pageInfo.status = 'pending';
    pageInfo.lastActivity = Date.now();

    // 重新添加到注入队列
    this.injectionQueue.add(pageId);

    this.emit('pageRefresh', { page, pageId, url: newUrl });
  }

  /**
   * 注册页面
   */
  async registerPage(page, pageId, type = 'new') {
    const pageInfo = {
      page,
      pageId,
      lastUrl: page.url() || 'about:blank',
      lastInjection: null,
      injectionAttempts: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'pending'
    };

    this.pageRegistry.set(pageId, pageInfo);

    console.log(`📝 页面已注册: ${pageId} (${type}) - ${pageInfo.lastUrl}`);

    this.emit('pageRegistered', { pageInfo, type });
  }

  /**
   * 设置页面事件监听
   */
  setupPageEventListeners(page, pageId) {
    // 页面加载事件
    page.on('load', () => {
      console.log(`📄 页面加载完成: ${pageId}`);
      this.injectionQueue.add(pageId);
    });

    // 页面错误事件
    page.on('error', (error) => {
      console.error(`❌ 页面错误 ${pageId}:`, error);
      this.emit('pageError', { pageId, error });
    });

    // 页面弹窗事件
    page.on('popup', (popup) => {
      console.log(`🪟 页面弹窗: ${pageId} -> ${this.getPageId(popup)}`);
      // 弹窗会被主监控循环检测到并自动处理
    });
  }

  /**
   * 处理注入队列
   */
  async processInjectionQueue() {
    if (this.injectionQueue.size === 0) {
      return;
    }

    console.log(`💉 处理注入队列: ${this.injectionQueue.size} 个页面待注入`);

    const injectionPromises = [];

    for (const pageId of this.injectionQueue) {
      injectionPromises.push(this.injectConnectionProtocol(pageId));
    }

    // 并行处理注入（限制并发数）
    const results = await Promise.allSettled(injectionPromises);

    // 清空队列
    this.injectionQueue.clear();

    // 统计结果
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (successful > 0 || failed > 0) {
      console.log(`📊 注入结果: 成功 ${successful}, 失败 ${failed}`);
    }
  }

  /**
   * 注入连接协议
   */
  async injectConnectionProtocol(pageId) {
    const pageInfo = this.pageRegistry.get(pageId);
    if (!pageInfo) {
      console.warn(`⚠️ 页面不存在: ${pageId}`);
      return;
    }

    if (pageInfo.injectionAttempts >= 3) {
      console.warn(`⚠️ 页面 ${pageId} 注入尝试次数过多，跳过`);
      return;
    }

    try {
      pageInfo.status = 'injecting';
      pageInfo.injectionAttempts++;

      // 等待页面稳定
      await this.waitForPageStable(pageInfo.page);

      // 执行注入
      await this.browserService.setupPageConnection(pageInfo.page);

      // 更新状态
      pageInfo.lastInjection = Date.now();
      pageInfo.lastActivity = Date.now();
      pageInfo.status = 'connected';

      console.log(`✅ 连接协议注入成功: ${pageId} (尝试: ${pageInfo.injectionAttempts})`);

      this.emit('injectionSuccess', { pageId, pageInfo });

    } catch (error) {
      console.error(`❌ 连接协议注入失败: ${pageId}`, error.message);

      pageInfo.status = 'failed';

      // 重试逻辑
      if (pageInfo.injectionAttempts < 3) {
        console.log(`🔄 将重试注入: ${pageId} (30秒后)`);
        setTimeout(() => {
          this.injectionQueue.add(pageId);
        }, 30000);
      }

      this.emit('injectionFailed', { pageId, error, pageInfo });
    }
  }

  /**
   * 等待页面稳定
   */
  async waitForPageStable(page) {
    try {
      // 等待页面加载完成
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      // 额外等待时间确保JavaScript环境稳定
      await page.waitForTimeout(1000);

    } catch (error) {
      console.debug('页面稳定等待超时，继续注入:', error.message);
    }
  }

  /**
   * 清理已关闭页面
   */
  cleanupClosedPages() {
    const closedPages = [];

    for (const [pageId, pageInfo] of this.pageRegistry) {
      if (pageInfo.page.isClosed()) {
        closedPages.push(pageId);
      }
    }

    for (const pageId of closedPages) {
      const pageInfo = this.pageRegistry.get(pageId);
      this.pageRegistry.delete(pageId);
      this.injectionQueue.delete(pageId);

      console.log(`🗑️ 清理已关闭页面: ${pageId}`);
      this.emit('pageClosed', { pageId, pageInfo });
    }
  }

  /**
   * 获取页面ID
   */
  getPageId(page) {
    // 在新版本Playwright中，使用不同的方法获取页面ID
    try {
      // 尝试使用 _mainFrame 的方法
      if (page._mainFrame && page._mainFrame()._id) {
        return `frame-${page._mainFrame()._id}`;
      }
    } catch (e) {
      // 忽略错误
    }

    // 生成基于时间和URL的唯一ID
    const urlHash = page.url().split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    return `page-${urlHash}-${Date.now().toString(36)}`;
  }

  /**
   * 获取监控状态
   */
  getMonitoringStatus() {
    const pages = Array.from(this.pageRegistry.values()).map(info => ({
      pageId: info.pageId,
      url: info.lastUrl,
      status: info.status,
      injectionAttempts: info.injectionAttempts,
      lastInjection: info.lastInjection,
      createdAt: info.createdAt
    }));

    return {
      isMonitoring: this.isMonitoring,
      registrySize: this.pageRegistry.size,
      queueSize: this.injectionQueue.size,
      pages,
      timestamp: Date.now()
    };
  }

  /**
   * 手动触发页面注入
   */
  async manualInject(pageId) {
    const pageInfo = this.pageRegistry.get(pageId);
    if (!pageInfo) {
      throw new Error(`页面不存在: ${pageId}`);
    }

    this.injectionQueue.add(pageId);
    console.log(`🔧 手动触发注入: ${pageId}`);
  }

  /**
   * 手动重新扫描页面
   */
  async rescanPages() {
    console.log('🔄 手动重新扫描页面...');
    await this.initializeExistingPages();
  }
}

export default PageLifecycleMonitor;