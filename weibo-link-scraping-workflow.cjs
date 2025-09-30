#!/usr/bin/env node

/**
 * 微博链接爬取Workflow - 包含完整的Cookie管理系统
 * 这是一个完整的可测试workflow，集成了现有的容器库和cookie管理
 */

const { WorkflowEngine } = require('../sharedmodule/operations-framework/src/workflow/WorkflowEngine');
const { CookieManagerNode } = require('../sharedmodule/operations-framework/node-system/nodes/CookieManagerNode');
const { WeiboLinkContainer } = require('../sharedmodule/operations-framework/src/containers/WeiboLinkContainer');
const { UniversalCookieManager } = require('../sharedmodule/operations-framework/src/detectors/event-driven-cookie-manager');
const path = require('path');
const os = require('os');

class WeiboLinkScrapingWorkflow {
    constructor(config = {}) {
        this.config = {
            // Cookie管理配置
            cookieConfig: {
                primaryPath: path.join(os.homedir(), '.webauto', 'cookies', 'weibo-cookies.json'),
                backupPath: './cookies/weibo-cookies.json',
                domain: 'weibo.com',
                essentialCookies: ['SUB', 'SCF', 'SUBP', 'ALF']
            },

            // 爬取配置
            scrapingConfig: {
                maxLinks: config.maxLinks || 500,
                enableAutoScroll: config.enableAutoScroll !== false,
                enableAutoPagination: config.enableAutoPagination !== false,
                scrollStep: config.scrollStep || 3,
                maxScrollAttempts: config.maxScrollAttempts || 50,
                maxPageAttempts: config.maxPageAttempts || 20,
                linkPatterns: [
                    'weibo.com/\\d+/[A-Za-z0-9_\\-]+',
                    'weibo.com/[A-Za-z0-9_\\-]+'
                ],
                excludePatterns: [
                    '.*login.*',
                    '.*register.*',
                    '.*search.*',
                    '.*ad.*',
                    '.*promotion.*'
                ]
            },

            // 导出配置
            exportConfig: {
                format: 'json',
                outputDir: './scraped-links',
                includeMetadata: true,
                timestamp: true
            },

            ...config
        };

        this.workflowEngine = new WorkflowEngine();
        this.cookieManager = null;
        this.linkContainer = null;
        this.page = null;
        this.browser = null;
    }

    /**
     * 初始化Workflow
     */
    async initialize() {
        console.log('🚀 初始化微博链接爬取Workflow...');

        try {
            // 1. 初始化Cookie管理器
            await this.initializeCookieManager();

            // 2. 验证和加载Cookie
            await this.validateAndLoadCookies();

            // 3. 初始化浏览器环境
            await this.initializeBrowser();

            // 4. 设置工作流节点
            await this.setupWorkflowNodes();

            console.log('✅ Workflow初始化完成');

        } catch (error) {
            console.error('❌ Workflow初始化失败:', error);
            throw error;
        }
    }

    /**
     * 初始化Cookie管理器
     */
    async initializeCookieManager() {
        console.log('🍪 初始化Cookie管理器...');

        this.cookieManager = new UniversalCookieManager({
            basePath: path.dirname(this.config.cookieConfig.primaryPath)
        });

        // 确保Cookie目录存在
        const fs = require('fs').promises;
        const cookieDir = path.dirname(this.config.cookieConfig.primaryPath);

        try {
            await fs.mkdir(cookieDir, { recursive: true });
        } catch (error) {
            // 目录已存在，忽略错误
        }
    }

    /**
     * 验证和加载Cookie
     */
    async validateAndLoadCookies() {
        console.log('🔍 验证和加载Cookie...');

        const cookiePaths = [
            this.config.cookieConfig.primaryPath,
            this.config.cookieConfig.backupPath
        ];

        let loadedCookies = null;
        let usedPath = null;

        // 尝试从多个路径加载Cookie
        for (const cookiePath of cookiePaths) {
            try {
                const result = await this.cookieManager.loadCookies({
                    fileName: path.basename(cookiePath),
                    domain: this.config.cookieConfig.domain
                });

                if (result.success && result.data.cookies.length > 0) {
                    loadedCookies = result.data.cookies;
                    usedPath = cookiePath;
                    console.log(`✅ 成功从 ${cookiePath} 加载 ${loadedCookies.length} 个Cookie`);
                    break;
                }
            } catch (error) {
                console.warn(`⚠️ 从 ${cookiePath} 加载Cookie失败:`, error.message);
            }
        }

        if (!loadedCookies) {
            throw new Error('无法从任何路径加载有效的Cookie文件');
        }

        // 验证Cookie有效性
        const validation = await this.validateCookies(loadedCookies);
        if (!validation.valid) {
            console.warn('⚠️ Cookie验证警告:', validation.message);
        } else {
            console.log('✅ Cookie验证通过');
        }

        return {
            cookies: loadedCookies,
            path: usedPath,
            validation
        };
    }

    /**
     * 验证Cookie有效性
     */
    async validateCookies(cookies) {
        if (!Array.isArray(cookies) || cookies.length === 0) {
            return { valid: false, reason: 'No cookies provided' };
        }

        // 检查过期Cookie
        const now = Math.floor(Date.now() / 1000);
        const expiredCookies = cookies.filter(cookie => {
            return cookie.expires && cookie.expires > 0 && cookie.expires < now;
        });

        if (expiredCookies.length > 0) {
            return {
                valid: false,
                reason: `${expiredCookies.length} cookies are expired`,
                expiredCookies: expiredCookies.map(c => c.name)
            };
        }

        // 检查必要的认证Cookie
        const essentialCookies = this.config.cookieConfig.essentialCookies;
        const missingEssential = essentialCookies.filter(name =>
            !cookies.some(cookie => cookie.name === name)
        );

        if (missingEssential.length > 0) {
            return {
                valid: false,
                reason: `Missing essential cookies: ${missingEssential.join(', ')}`,
                missingEssential
            };
        }

        return {
            valid: true,
            message: 'Cookies are valid and contain essential authentication data'
        };
    }

    /**
     * 初始化浏览器环境
     */
    async initializeBrowser() {
        console.log('🌐 初始化浏览器环境...');

        const chromium = require('playwright-chromium');
        this.browser = await chromium.launch({
            headless: false, // 使用有头模式便于调试
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.page = await this.browser.newPage();

        // 设置用户代理
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // 设置视窗大小
        await this.page.setViewportSize({
            width: 1920,
            height: 1080
        });

        // 注入Cookie
        const cookieData = await this.validateAndLoadCookies();
        await this.page.context().addCookies(cookieData.cookies);

        console.log('✅ 浏览器环境初始化完成');
    }

    /**
     * 设置工作流节点
     */
    async setupWorkflowNodes() {
        console.log('⚙️ 设置工作流节点...');

        // 1. Cookie管理节点
        const cookieManagerNode = new CookieManagerNode('cookie_manager', {
            cookiePath: this.config.cookieConfig.primaryPath,
            domain: this.config.cookieConfig.domain
        });

        // 2. 链接容器配置
        const linkContainerConfig = {
            name: 'weibo_link_container',
            selector: '#app [class*="feed"]',
            maxLinks: this.config.scrapingConfig.maxLinks,
            enableAutoScroll: this.config.scrapingConfig.enableAutoScroll,
            enableAutoPagination: this.config.scrapingConfig.enableAutoPagination,
            scrollStep: this.config.scrapingConfig.scrollStep,
            maxScrollAttempts: this.config.scrapingConfig.maxScrollAttempts,
            maxPageAttempts: this.config.scrapingConfig.maxPageAttempts,
            linkPatterns: this.config.scrapingConfig.linkPatterns,
            excludePatterns: this.config.scrapingConfig.excludePatterns
        };

        this.linkContainer = new WeiboLinkContainer(linkContainerConfig);

        // 注册节点到工作流引擎
        this.workflowEngine.registerNode('cookie_manager', cookieManagerNode);

        console.log('✅ 工作流节点设置完成');
    }

    /**
     * 执行主页链接爬取
     */
    async scrapeHomepageLinks() {
        console.log('🏠 开始主页链接爬取...');

        try {
            // 导航到微博主页
            await this.page.goto('https://weibo.com', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // 等待页面加载
            await this.page.waitForSelector('#app', { timeout: 10000 });

            // 验证登录状态
            const isLoggedIn = await this.verifyLoginStatus();
            if (!isLoggedIn) {
                throw new Error('用户未登录，请检查Cookie有效性');
            }

            // 初始化链接容器
            await this.linkContainer.setPageContext(this.page);

            // 执行链接发现
            const result = await this.linkContainer.startDiscovery();

            console.log('✅ 主页链接爬取完成');
            return result;

        } catch (error) {
            console.error('❌ 主页链接爬取失败:', error);
            throw error;
        }
    }

    /**
     * 执行搜索结果链接爬取
     */
    async scrapeSearchResults(keyword) {
        console.log(`🔍 开始搜索结果链接爬取 (关键词: ${keyword})...`);

        try {
            // 构建搜索URL
            const searchUrl = `https://weibo.com/search?q=${encodeURIComponent(keyword)}`;

            // 导航到搜索页面
            await this.page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // 等待搜索结果加载
            await this.page.waitForSelector('[class*="search"]', { timeout: 15000 });

            // 验证登录状态
            const isLoggedIn = await this.verifyLoginStatus();
            if (!isLoggedIn) {
                throw new Error('用户未登录，请检查Cookie有效性');
            }

            // 配置搜索专用的链接容器
            const searchContainerConfig = {
                ...this.linkContainer.config,
                selector: '[class*="search"] [class*="feed"]',
                enableAutoPagination: true,
                paginationMode: 'button'
            };

            const searchContainer = new WeiboLinkContainer(searchContainerConfig);
            await searchContainer.setPageContext(this.page);

            // 执行搜索结果链接发现
            const result = await searchContainer.startDiscovery();

            console.log('✅ 搜索结果链接爬取完成');
            return result;

        } catch (error) {
            console.error('❌ 搜索结果链接爬取失败:', error);
            throw error;
        }
    }

    /**
     * 验证登录状态
     */
    async verifyLoginStatus() {
        try {
            // 检查是否包含登录按钮（未登录状态）
            const loginButton = await this.page.$('a[href*="login"], button:has-text("登录"), [class*="login"]');
            if (loginButton) {
                console.log('⚠️ 检测到登录按钮，用户可能未登录');
                return false;
            }

            // 检查用户头像或用户名（已登录状态）
            const userAvatar = await this.page.$('img[class*="avatar"], [class*="user"] img');
            const username = await this.page.$('[class*="username"], [class*="name"]');

            if (userAvatar || username) {
                console.log('✅ 检测到用户信息，登录状态正常');
                return true;
            }

            // 检查页面内容
            const pageContent = await this.page.content();
            const hasFeedContent = pageContent.includes('feed') || pageContent.includes('Feed');

            if (hasFeedContent) {
                console.log('✅ 检测到信息流内容，登录状态正常');
                return true;
            }

            console.log('⚠️ 无法确定登录状态');
            return false;

        } catch (error) {
            console.error('登录状态验证失败:', error);
            return false;
        }
    }

    /**
     * 导出发现的链接
     */
    async exportLinks(links, filename = null) {
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filename = `weibo-links-${timestamp}.json`;
        }

        const exportPath = path.join(this.config.exportConfig.outputDir, filename);
        const fs = require('fs').promises;

        try {
            // 确保输出目录存在
            await fs.mkdir(this.config.exportConfig.outputDir, { recursive: true });

            // 准备导出数据
            const exportData = {
                metadata: {
                    exportTime: new Date().toISOString(),
                    totalLinks: links.length,
                    source: 'weibo-link-scraping-workflow',
                    config: this.config
                },
                links: links
            };

            // 写入文件
            await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));

            console.log(`✅ 链接数据已导出到: ${exportPath}`);
            return exportPath;

        } catch (error) {
            console.error('❌ 导出链接数据失败:', error);
            throw error;
        }
    }

    /**
     * 清理资源
     */
    async cleanup() {
        console.log('🧹 清理资源...');

        try {
            if (this.linkContainer) {
                await this.linkContainer.cleanup();
            }

            if (this.page) {
                await this.page.close();
            }

            if (this.browser) {
                await this.browser.close();
            }

            console.log('✅ 资源清理完成');

        } catch (error) {
            console.error('❌ 资源清理失败:', error);
        }
    }

    /**
     * 运行完整的爬取流程
     */
    async runFullScraping(options = {}) {
        const {
            targets = ['homepage'],
            keywords = [],
            exportResults = true
        } = options;

        const allResults = [];

        try {
            await this.initialize();

            for (const target of targets) {
                let result = null;

                switch (target) {
                    case 'homepage':
                        result = await this.scrapeHomepageLinks();
                        break;
                    case 'search':
                        if (keywords.length > 0) {
                            for (const keyword of keywords) {
                                const searchResult = await this.scrapeSearchResults(keyword);
                                allResults.push(searchResult);
                            }
                        }
                        break;
                    default:
                        console.warn(`未知的目标类型: ${target}`);
                }

                if (result) {
                    allResults.push(result);
                }
            }

            // 导出结果
            if (exportResults && allResults.length > 0) {
                const allLinks = allResults.flatMap(result => result.links || []);
                await this.exportLinks(allLinks);
            }

            return allResults;

        } catch (error) {
            console.error('❌ 爬取流程执行失败:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// 导出模块
module.exports = WeiboLinkScrapingWorkflow;

// 如果直接运行此文件，执行测试
if (require.main === module) {
    const workflow = new WeiboLinkScrapingWorkflow({
        maxLinks: 100, // 测试时限制链接数量
        enableAutoScroll: true,
        enableAutoPagination: false
    });

    // 执行主页链接爬取测试
    workflow.runFullScraping({
        targets: ['homepage'],
        exportResults: true
    }).then((results) => {
        console.log('🎉 爬取任务完成!');
        console.log(`总共发现 ${results.reduce((sum, r) => sum + (r.links?.length || 0), 0)} 个链接`);
    }).catch((error) => {
        console.error('❌ 爬取任务失败:', error);
        process.exit(1);
    });
}