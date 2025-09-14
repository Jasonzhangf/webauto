const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * 基础测试系统 - 所有原子操作的基础
 * 提供统一的环境配置、Cookie管理、日志记录和测试框架
 */
class BaseTestSystem extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 基础配置
    this.config = {
      browserType: 'chromium',
      headless: false,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ...options
    };
    
    // 系统状态
    this.state = {
      initialized: false,
      browser: null,
      context: null,
      page: null,
      cookies: [],
      logs: [],
      results: {},
      errors: []
    };
    
    // 日志系统
    this.logLevel = options.logLevel || 'info';
    this.logFile = options.logFile || this.generateLogFileName();
    
    // Cookie管理
    this.cookieFile = options.cookieFile || path.join(__dirname, 'cookies.json');
    
    // 测试统计
    this.stats = {
      startTime: null,
      endTime: null,
      operations: 0,
      successes: 0,
      failures: 0
    };
  }

  /**
   * 初始化基础测试系统
   */
  async initialize() {
    try {
      console.log('🚀 初始化基础测试系统...');
      
      // 初始化日志系统
      await this.initializeLogging();
      
      // 启动浏览器
      await this.launchBrowser();
      
      // 加载Cookie
      await this.loadCookies();
      
      // 设置页面配置
      await this.configurePage();
      
      this.state.initialized = true;
      this.stats.startTime = Date.now();
      
      this.log('info', '基础测试系统初始化完成');
      this.emit('initialized', this.state);
      
      return true;
    } catch (error) {
      this.log('error', `系统初始化失败: ${error.message}`);
      this.state.errors.push(error);
      throw error;
    }
  }

  /**
   * 初始化日志系统
   */
  async initializeLogging() {
    this.log('info', '初始化日志系统...');
    
    // 确保日志目录存在
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 创建日志文件
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '日志系统初始化完成',
      system: 'BaseTestSystem'
    };
    
    await this.appendLog(logEntry);
  }

  /**
   * 启动浏览器
   */
  async launchBrowser() {
    this.log('info', '启动浏览器...');
    
    const browserOptions = {
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-default-browser-check'
      ]
    };
    
    this.state.browser = await chromium.launch(browserOptions);
    this.state.context = await this.state.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: this.config.viewport
    });
    
    this.state.page = await this.state.context.newPage();
    
    // 监听页面事件
    this.setupPageEventListeners();
    
    this.log('info', '浏览器启动成功');
  }

  /**
   * 设置页面事件监听器
   */
  setupPageEventListeners() {
    const page = this.state.page;
    
    // 监听控制台消息
    page.on('console', msg => {
      this.log('browser', `Console ${msg.type()}: ${msg.text()}`);
    });
    
    // 监听页面错误
    page.on('pageerror', error => {
      this.log('error', `页面错误: ${error.message}`);
      this.state.errors.push(error);
    });
    
    // 监听请求失败
    page.on('requestfailed', request => {
      this.log('warn', `请求失败: ${request.url()} - ${request.failure()?.errorText}`);
    });
    
    // 监听响应
    page.on('response', response => {
      if (response.status() >= 400) {
        this.log('warn', `HTTP错误: ${response.status()} - ${response.url()}`);
      }
    });
  }

  /**
   * 加载Cookie
   */
  async loadCookies() {
    this.log('info', '加载Cookie...');
    
    try {
      if (fs.existsSync(this.cookieFile)) {
        const cookieData = fs.readFileSync(this.cookieFile, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        if (Array.isArray(cookies) && cookies.length > 0) {
          await this.state.context.addCookies(cookies);
          this.state.cookies = cookies;
          this.log('info', `成功加载 ${cookies.length} 个Cookie`);
        } else {
          this.log('warn', 'Cookie文件为空或格式错误');
        }
      } else {
        this.log('info', 'Cookie文件不存在，将使用新会话');
      }
    } catch (error) {
      this.log('error', `Cookie加载失败: ${error.message}`);
    }
  }

  /**
   * 保存Cookie
   */
  async saveCookies() {
    try {
      const cookies = await this.state.context.cookies();
      if (cookies.length > 0) {
        fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
        this.state.cookies = cookies;
        this.log('info', `成功保存 ${cookies.length} 个Cookie`);
      }
    } catch (error) {
      this.log('error', `Cookie保存失败: ${error.message}`);
    }
  }

  /**
   * 配置页面
   */
  async configurePage() {
    this.log('info', '配置页面...');
    
    const page = this.state.page;
    
    // 设置超时
    page.setDefaultTimeout(this.config.timeout);
    
    // 设置视窗大小
    await page.setViewportSize(this.config.viewport);
    
    this.log('info', '页面配置完成');
  }

  /**
   * 执行原子操作
   */
  async executeAtomicOperation(operationName, params = {}) {
    if (!this.state.initialized) {
      throw new Error('系统未初始化，请先调用 initialize()');
    }
    
    this.stats.operations++;
    const startTime = Date.now();
    
    try {
      this.log('info', `执行原子操作: ${operationName}`);
      
      // 查找原子操作
      const operation = this.getAtomicOperation(operationName);
      if (!operation) {
        throw new Error(`未找到原子操作: ${operationName}`);
      }
      
      // 执行操作
      const result = await operation(this.state.page, params, this);
      
      const executionTime = Date.now() - startTime;
      this.stats.successes++;
      
      this.log('info', `原子操作完成: ${operationName} (耗时: ${executionTime}ms)`);
      
      // 记录结果
      this.state.results[operationName] = {
        success: true,
        result,
        executionTime,
        timestamp: new Date().toISOString()
      };
      
      this.emit('operationCompleted', {
        operationName,
        result,
        executionTime,
        success: true
      });
      
      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.stats.failures++;
      
      this.log('error', `原子操作失败: ${operationName} - ${error.message}`);
      
      // 记录错误
      this.state.results[operationName] = {
        success: false,
        error: error.message,
        executionTime,
        timestamp: new Date().toISOString()
      };
      
      this.state.errors.push(error);
      
      this.emit('operationCompleted', {
        operationName,
        error,
        executionTime,
        success: false
      });
      
      throw error;
    }
  }

  /**
   * 获取原子操作
   */
  getAtomicOperation(operationName) {
    const operations = {
      // 页面操作
      navigate: this.atomicNavigate.bind(this),
      click: this.atomicClick.bind(this),
      input: this.atomicInput.bind(this),
      wait: this.atomicWait.bind(this),
      screenshot: this.atomicScreenshot.bind(this),
      
      // 数据提取
      extractText: this.atomicExtractText.bind(this),
      extractAttribute: this.atomicExtractAttribute.bind(this),
      extractElements: this.atomicExtractElements.bind(this),
      
      // 验证操作
      elementExists: this.atomicElementExists.bind(this),
      elementVisible: this.atomicElementVisible.bind(this),
      
      // 高级操作
      executeScript: this.atomicExecuteScript.bind(this),
      scrollTo: this.atomicScrollTo.bind(this),
      waitForNavigation: this.atomicWaitForNavigation.bind(this)
    };
    
    return operations[operationName];
  }

  // 原子操作实现
  async atomicNavigate(page, params) {
    const { url, waitUntil = 'networkidle' } = params;
    return await page.goto(url, { waitUntil });
  }

  async atomicClick(page, params) {
    const { selector, timeout = 5000 } = params;
    await page.click(selector, { timeout });
    return { clicked: true };
  }

  async atomicInput(page, params) {
    const { selector, text, timeout = 5000 } = params;
    await page.fill(selector, text, { timeout });
    return { input: true };
  }

  async atomicWait(page, params) {
    const { selector, timeout = 5000 } = params;
    await page.waitForSelector(selector, { timeout });
    return { waited: true };
  }

  async atomicScreenshot(page, params) {
    const { filename, fullPage = false } = params;
    const screenshotPath = path.join(__dirname, 'screenshots', filename);
    
    // 确保截图目录存在
    const screenshotDir = path.dirname(screenshotPath);
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    await page.screenshot({ path: screenshotPath, fullPage });
    return { screenshot: screenshotPath };
  }

  async atomicExtractText(page, params) {
    const { selector, multiple = false } = params;
    if (multiple) {
      return await page.$$eval(selector, elements => elements.map(el => el.textContent?.trim() || ''));
    } else {
      return await page.$eval(selector, el => el.textContent?.trim() || '');
    }
  }

  async atomicExtractAttribute(page, params) {
    const { selector, attribute, multiple = false } = params;
    if (multiple) {
      return await page.$$eval(selector, elements => elements.map(el => el.getAttribute(attribute) || ''));
    } else {
      return await page.$eval(selector, el => el.getAttribute(attribute) || '');
    }
  }

  async atomicExtractElements(page, params) {
    const { selector } = params;
    const elements = await page.$$(selector);
    return { count: elements.length, elements };
  }

  async atomicElementExists(page, params) {
    const { selector } = params;
    const element = await page.$(selector);
    return { exists: !!element };
  }

  async atomicElementVisible(page, params) {
    const { selector } = params;
    const element = await page.$(selector);
    if (!element) return { visible: false };
    const isVisible = await element.isVisible();
    return { visible: isVisible };
  }

  async atomicExecuteScript(page, params) {
    const { script, args = [] } = params;
    return await page.evaluate(script, ...args);
  }

  async atomicScrollTo(page, params) {
    const { x = 0, y = 0, selector } = params;
    if (selector) {
      await page.$eval(selector, el => el.scrollIntoView());
    } else {
      await page.evaluate((x, y) => window.scrollTo(x, y), x, y);
    }
    return { scrolled: true };
  }

  async atomicWaitForNavigation(page, params) {
    const { timeout = 30000 } = params;
    await page.waitForNavigation({ timeout });
    return { navigated: true };
  }

  /**
   * 执行测试脚本
   */
  async executeTestScript(script) {
    if (!this.state.initialized) {
      throw new Error('系统未初始化，请先调用 initialize()');
    }
    
    this.log('info', '执行测试脚本...');
    
    try {
      const results = await script(this);
      this.log('info', '测试脚本执行完成');
      return results;
    } catch (error) {
      this.log('error', `测试脚本执行失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 日志记录
   */
  log(level, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      system: 'BaseTestSystem'
    };
    
    this.state.logs.push(logEntry);
    
    // 控制台输出
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    
    // 写入文件
    this.appendLog(logEntry);
    
    // 触发事件
    this.emit('log', logEntry);
  }

  /**
   * 追加日志到文件
   */
  async appendLog(logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      console.error('日志写入失败:', error);
    }
  }

  /**
   * 生成日志文件名
   */
  generateLogFileName() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(__dirname, 'logs', `test-${timestamp}.log`);
  }

  /**
   * 获取测试统计
   */
  getStats() {
    return {
      ...this.stats,
      duration: this.stats.endTime ? this.stats.endTime - this.stats.startTime : 0,
      successRate: this.stats.operations > 0 ? (this.stats.successes / this.stats.operations * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 导出测试报告
   */
  async exportReport() {
    this.stats.endTime = Date.now();
    
    const report = {
      testInfo: {
        startTime: new Date(this.stats.startTime).toISOString(),
        endTime: new Date(this.stats.endTime).toISOString(),
        duration: this.stats.endTime - this.stats.startTime,
        config: this.config
      },
      stats: this.getStats(),
      results: this.state.results,
      errors: this.state.errors.map(error => ({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })),
      logs: this.state.logs
    };
    
    const reportFile = path.join(__dirname, 'reports', `test-report-${Date.now()}.json`);
    
    // 确保报告目录存在
    const reportDir = path.dirname(reportFile);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    this.log('info', `测试报告已导出: ${reportFile}`);
    
    return reportFile;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.log('info', '清理资源...');
    
    try {
      // 保存Cookie
      await this.saveCookies();
      
      // 导出报告
      await this.exportReport();
      
      // 关闭浏览器
      if (this.state.browser) {
        await this.state.browser.close();
      }
      
      this.log('info', '资源清理完成');
      this.emit('cleanup');
      
    } catch (error) {
      this.log('error', `资源清理失败: ${error.message}`);
    }
  }
}

module.exports = BaseTestSystem;