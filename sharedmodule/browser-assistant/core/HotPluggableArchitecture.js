const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// 导入核心组件
const { CookieManager } = require('./CookieManager');
const { SecurityManager } = require('./SecurityManager');
const { PerformanceMonitor } = require('./PerformanceMonitor');

// 导入滚动策略
const { VerticalInfiniteScrollStrategy, VerticalPaginatedScrollStrategy } = require('../strategies/scroll/VerticalScrollStrategies');
const { GridInfiniteScrollStrategy, GridPaginatedScrollStrategy } = require('../strategies/scroll/GridScrollStrategies');

/**
 * 热插拔架构基础类 - 支持策略热插拔和动态配置
 */
class HotPluggableArchitecture {
    constructor() {
        this.plugins = new Map();
        this.strategies = new Map();
        this.configurations = new Map();
        this.eventBus = new EventBus();
        this.securityManager = new SecurityManager();
        this.cookieManager = new CookieManager();
        this.performanceMonitor = new PerformanceMonitor();
        
        // 开始性能监控会话
        this.performanceMonitor.startSession();
        
        this.browser = null;
        this.context = null;
        this.page = null;
        this.currentSite = null;
        this.isLoggedIn = false;
        
        this.initializeDefaultStrategies();
    }

    /**
     * 初始化默认策略
     */
    initializeDefaultStrategies() {
        // 注册默认滚动策略
        this.registerStrategy('scroll', 'vertical-infinite', new VerticalInfiniteScrollStrategy(this));
        this.registerStrategy('scroll', 'vertical-paginated', new VerticalPaginatedScrollStrategy(this));
        this.registerStrategy('scroll', 'grid-infinite', new GridInfiniteScrollStrategy(this));
        
        // 注册默认交互策略 (待实现)
        // this.registerStrategy('interaction', 'modal-based', new ModalInteractionStrategy(this));
        // this.registerStrategy('interaction', 'direct-click', new DirectClickStrategy(this));
        
        // 注册默认内容提取策略 (待实现)
        // this.registerStrategy('extraction', 'structured', new StructuredExtractionStrategy(this));
        // this.registerStrategy('extraction', 'ai-based', new AIBasedExtractionStrategy(this));
    }

    /**
     * 注册插件
     */
    async registerPlugin(name, plugin) {
        if (this.plugins.has(name)) {
            throw new Error(`Plugin ${name} already registered`);
        }
        
        await plugin.initialize(this);
        this.plugins.set(name, plugin);
        this.eventBus.emit('plugin:registered', { name, plugin });
        
        console.log(`✅ 插件注册成功: ${name}`);
    }

    /**
     * 注销插件
     */
    async unregisterPlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`Plugin ${name} not found`);
        }
        
        await plugin.cleanup();
        this.plugins.delete(name);
        this.eventBus.emit('plugin:unregistered', { name });
        
        console.log(`✅ 插件注销成功: ${name}`);
    }

    /**
     * 注册策略
     */
    registerStrategy(category, name, strategy) {
        const key = `${category}:${name}`;
        if (this.strategies.has(key)) {
            throw new Error(`Strategy ${key} already registered`);
        }
        
        this.strategies.set(key, strategy);
        this.eventBus.emit('strategy:registered', { category, name, strategy });
        
        console.log(`✅ 策略注册成功: ${key}`);
    }

    /**
     * 获取策略
     */
    getStrategy(category, name) {
        const key = `${category}:${name}`;
        const strategy = this.strategies.get(key);
        
        if (!strategy) {
            throw new Error(`Strategy ${key} not found`);
        }
        
        return strategy;
    }

    /**
     * 热插拔替换策略
     */
    async replaceStrategy(category, name, newStrategy) {
        const oldStrategy = this.getStrategy(category, name);
        const key = `${category}:${name}`;
        
        // 清理旧策略
        if (oldStrategy.cleanup) {
            await oldStrategy.cleanup();
        }
        
        // 初始化新策略
        if (newStrategy.initialize) {
            await newStrategy.initialize(this);
        }
        
        this.strategies.set(key, newStrategy);
        this.eventBus.emit('strategy:replaced', { category, name, oldStrategy, newStrategy });
        
        console.log(`✅ 策略替换成功: ${key}`);
    }

    /**
     * 加载站点配置
     */
    async loadSiteConfig(siteName) {
        const configPath = path.join(__dirname, '..', 'config', 'sites', `${siteName}.json`);
        
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            this.configurations.set(siteName, config);
            this.currentSite = siteName;
            
            console.log(`✅ 站点配置加载成功: ${siteName}`);
            return config;
        } catch (error) {
            throw new Error(`Failed to load site config ${siteName}: ${error.message}`);
        }
    }

    /**
     * 初始化浏览器
     */
    async initializeBrowser(options = {}) {
        const config = this.configurations.get(this.currentSite);
        if (!config) {
            throw new Error('No site configuration loaded');
        }

        // 安全检查 - 确保有cookie
        const hasCookies = await this.cookieManager.hasCookies(config.domain);
        if (!hasCookies && config.requiresAuth) {
            throw new Error(`❌ 安全检查失败: ${this.currentSite} 需要登录但没有有效的cookie`);
        }

        // 启动浏览器
        this.browser = await chromium.launch({
            headless: options.headless || false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        // 创建上下文
        this.context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...config.browserContext
        });

        // 加载cookie
        await this.cookieManager.loadCookies(this.context, config.domain);

        // 创建页面
        this.page = await this.context.newPage();
        
        // 设置超时
        this.page.setDefaultTimeout(config.timeout || 30000);
        this.page.setDefaultNavigationTimeout(config.navigationTimeout || 60000);

        // 注入反检测脚本
        await this.injectAntiDetection();

        console.log('✅ 浏览器初始化完成');
    }

    /**
     * 注入反检测脚本
     */
    async injectAntiDetection() {
        await this.page.addInitScript(() => {
            // 隐藏 webdriver 属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            // 模拟正常浏览器行为
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: { type: 'application/x-google-chrome-pdf' },
                        description: 'Portable Document Format',
                        filename: 'internal-pdf-viewer',
                        length: 1,
                        name: 'Chrome PDF Plugin'
                    }
                ]
            });

            // 模拟语言
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en']
            });
        });
    }

    /**
     * 执行操作 - 带安全检查
     */
    async executeOperation(operation, params = {}) {
        const startTime = Date.now();
        
        try {
            // 安全检查
            const securityCheck = await this.securityManager.checkBeforeOperation(this.page, operation);
            if (!securityCheck.allowed) {
                throw new Error(`❌ 安全检查失败: ${securityCheck.reason}`);
            }

            // 检查登录状态
            if (!await this.checkLoginStatus()) {
                throw new Error(`❌ 登录状态检查失败: ${this.currentSite} 需要重新登录`);
            }

            // 执行操作
            const result = await this.performOperation(operation, params);

            // 记录性能
            this.performanceMonitor.recordOperation(operation, true, Date.now() - startTime);

            return result;

        } catch (error) {
            // 记录失败
            this.performanceMonitor.recordOperation(operation, false, Date.now() - startTime);
            
            // 安全处理错误
            await this.securityManager.handleOperationError(this.page, operation, error);
            
            throw error;
        }
    }

    /**
     * 执行具体操作
     */
    async performOperation(operation, params) {
        const config = this.configurations.get(this.currentSite);
        
        switch (operation.type) {
            case 'navigate':
                return await this.navigate(params.url);
                
            case 'scroll':
                return await this.performScroll(params);
                
            case 'extract':
                return await this.performExtraction(params);
                
            case 'interact':
                return await this.performInteraction(params);
                
            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }

    /**
     * 导航到页面
     */
    async navigate(url) {
        console.log(`📍 导航到: ${url}`);
        
        // 时间扰动
        await this.securityManager.addRandomDelay(1000, 3000);
        
        await this.page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });
        
        // 等待页面稳定
        await this.page.waitForTimeout(2000);
        
        return { success: true, url: this.page.url() };
    }

    /**
     * 执行滚动操作
     */
    async performScroll(params) {
        const config = this.configurations.get(this.currentSite);
        const scrollStrategy = this.getStrategy('scroll', config.scrollStrategy);
        
        return await scrollStrategy.execute(this.page, params);
    }

    /**
     * 执行内容提取
     */
    async performExtraction(params) {
        const config = this.configurations.get(this.currentSite);
        const extractionStrategy = this.getStrategy('extraction', config.extractionStrategy);
        
        return await extractionStrategy.execute(this.page, params);
    }

    /**
     * 执行交互操作
     */
    async performInteraction(params) {
        const config = this.configurations.get(this.currentSite);
        const interactionStrategy = this.getStrategy('interaction', config.interactionStrategy);
        
        return await interactionStrategy.execute(this.page, params);
    }

    /**
     * 检查登录状态
     */
    async checkLoginStatus() {
        const config = this.configurations.get(this.currentSite);
        
        try {
            const isLoggedIn = await this.page.evaluate((selectors) => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        return true;
                    }
                }
                return false;
            }, config.loginSelectors || []);
            
            this.isLoggedIn = isLoggedIn;
            return isLoggedIn;
        } catch (error) {
            console.error('登录状态检查失败:', error);
            return false;
        }
    }

    /**
     * 清理资源
     */
    async cleanup() {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
        
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        
        // 清理所有插件
        for (const [name, plugin] of this.plugins) {
            if (plugin.cleanup) {
                await plugin.cleanup();
            }
        }
        
        // 清理所有策略
        for (const [key, strategy] of this.strategies) {
            if (strategy.cleanup) {
                await strategy.cleanup();
            }
        }
        
        console.log('✅ 资源清理完成');
    }
}

/**
 * 事件总线 - 支持插件间通信
 */
class EventBus {
    constructor() {
        this.events = new Map();
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.events.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Event callback error for ${event}:`, error);
                }
            });
        }
    }

    off(event, callback) {
        const callbacks = this.events.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
}

module.exports = { HotPluggableArchitecture, EventBus };