#!/usr/bin/env node

/**
 * 微博容器操作器 - 使用RCC基础模块的容器化微博操作实现
 * 基于容器化架构的精确元素操作，避免野蛮的选择方式
 */

const { BaseModule } = require('rcc-basemodule');
const { ErrorHandlingCenter } = require('rcc-errorhandling');

/**
 * 微博容器操作器主类
 */
class WeiboContainerOperator extends BaseModule {
    constructor(config = {}) {
        super({
            id: 'WeiboContainerOperator',
            name: 'WeiboContainerOperator',
            version: '2.0.0',
            description: '微博容器化操作系统，基于RCC基础模块实现精确的元素操作',
            type: 'weibo-operator',
            ...config
        });

        // 初始化组件
        this.containerRegistry = new Map();
        this.operationHistory = [];
        this.performanceMetrics = new Map();
        this.cache = new Map();
        
        // 初始化错误处理系统
        this.errorHandlingCenter = new ErrorHandlingCenter();
        
        // 页面相关属性
        this.currentPage = null;
        this.currentContext = null;
        this.pageType = 'unknown';
        
        this.logInfo('WeiboContainerOperator initialized successfully');
    }

    /**
     * 初始化页面
     */
    async initializePage(page) {
        this.currentPage = page;
        this.currentContext = { page };
        
        // 识别页面类型
        this.pageType = await this.recognizePageType(page);
        
        // 创建页面容器
        await this.createPageContainers(page);
        
        this.logInfo('Page initialized', { pageType: this.pageType });
        
        return this.pageType;
    }

    /**
     * 识别页面类型
     */
    async recognizePageType(page) {
        const url = page.url();
        
        if (url.includes('weibo.com/u/')) {
            return 'user_profile';
        } else if (url.includes('weibo.com/search/')) {
            return 'search';
        } else if (url.includes('weibo.com/')) {
            return 'feed';
        } else {
            return 'unknown';
        }
    }

    /**
     * 创建页面容器
     */
    async createPageContainers(page) {
        this.containerRegistry.clear();
        
        // 创建基础页面容器
        const pageContainer = {
            id: 'weibo-page',
            name: 'Weibo Page Container',
            type: 'page-container',
            selectors: ['body', '.woo-layout-main'],
            operations: new Map([
                ['getPageInfo', this.createGetPageInfoOperation()],
                ['navigateTo', this.createNavigateToOperation()],
                ['checkLoginState', this.createCheckLoginStateOperation()]
            ]),
            executeOperation: async (operation, context, params) => {
                const op = this.operations.get(operation);
                if (!op) {
                    throw new Error(`Operation ${operation} not found`);
                }
                return await op(context, params);
            }
        };
        
        this.containerRegistry.set('weibo-page', pageContainer);
        
        // 根据页面类型创建特定容器
        switch (this.pageType) {
            case 'user_profile':
                await this.createUserProfileContainers();
                break;
            case 'search':
                await this.createSearchResultContainers();
                break;
            case 'feed':
                await this.createFeedContainers();
                break;
            default:
                await this.createGenericContainers();
        }
    }

    /**
     * 创建用户主页容器
     */
    async createUserProfileContainers() {
        const profileContainer = {
            id: 'user-profile',
            name: 'User Profile Container',
            type: 'profile-container',
            selectors: ['div[class*="Profile_"]'],
            operations: new Map([
                ['extractUserInfo', this.createExtractUserInfoOperation()],
                ['getUserPosts', this.createGetUserPostsOperation()]
            ]),
            executeOperation: async (operation, context, params) => {
                const op = this.operations.get(operation);
                if (!op) {
                    throw new Error(`Operation ${operation} not found`);
                }
                return await op(context, params);
            }
        };
        
        this.containerRegistry.set('user-profile', profileContainer);
    }

    /**
     * 创建搜索结果容器
     */
    async createSearchResultContainers() {
        const searchContainer = {
            id: 'search-results',
            name: 'Search Results Container',
            type: 'search-container',
            selectors: ['div[class*="Pl_"]'],
            operations: new Map([
                ['extractSearchResults', this.createExtractSearchResultsOperation()]
            ]),
            executeOperation: async (operation, context, params) => {
                const op = this.operations.get(operation);
                if (!op) {
                    throw new Error(`Operation ${operation} not found`);
                }
                return await op(context, params);
            }
        };
        
        this.containerRegistry.set('search-results', searchContainer);
    }

    /**
     * 创建信息流容器
     */
    async createFeedContainers() {
        const feedContainer = {
            id: 'feed',
            name: 'Feed Container',
            type: 'feed-container',
            selectors: ['div[class*="Feed_"]'],
            operations: new Map([
                ['extractFeedPosts', this.createExtractFeedPostsOperation()]
            ]),
            executeOperation: async (operation, context, params) => {
                const op = this.operations.get(operation);
                if (!op) {
                    throw new Error(`Operation ${operation} not found`);
                }
                return await op(context, params);
            }
        };
        
        this.containerRegistry.set('feed', feedContainer);
    }

    /**
     * 创建通用容器
     */
    async createGenericContainers() {
        const genericContainer = {
            id: 'generic',
            name: 'Generic Container',
            type: 'generic-container',
            selectors: ['body'],
            operations: new Map([
                ['getPageInfo', this.createGetPageInfoOperation()]
            ]),
            executeOperation: async (operation, context, params) => {
                const op = this.operations.get(operation);
                if (!op) {
                    throw new Error(`Operation ${operation} not found`);
                }
                return await op(context, params);
            }
        };
        
        this.containerRegistry.set('generic', genericContainer);
    }

    /**
     * 创建获取页面信息操作
     */
    createGetPageInfoOperation() {
        return async (context, params) => {
            return await context.page.evaluate(() => ({
                title: document.title,
                url: window.location.href,
                pageType: this.getPageType(window.location.href)
            }));
        };
    }

    /**
     * 创建导航操作
     */
    createNavigateToOperation() {
        return async (context, params) => {
            const { url } = params;
            await context.page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 30000 
            });
            await context.page.waitForTimeout(2000);
            return { success: true, url };
        };
    }

    /**
     * 创建检查登录状态操作
     */
    createCheckLoginStateOperation() {
        return async (context, params) => {
            const currentUrl = context.page.url();
            const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('signin');
            return { isLoggedIn, url: currentUrl };
        };
    }

    /**
     * 创建提取用户信息操作
     */
    createExtractUserInfoOperation() {
        return async (context, params) => {
            const userInfo = await context.page.evaluate(() => {
                const profileElement = document.querySelector('div[class*="Profile_"]');
                if (!profileElement) return null;
                
                return {
                    name: profileElement.querySelector('h1[class*="name_"]')?.textContent?.trim(),
                    bio: profileElement.querySelector('div[class*="bio_"]')?.textContent?.trim(),
                    followers: profileElement.querySelector('[class*="followers_"]')?.textContent?.trim(),
                    following: profileElement.querySelector('[class*="following_"]')?.textContent?.trim()
                };
            });
            
            return userInfo;
        };
    }

    /**
     * 创建获取用户帖子操作
     */
    createGetUserPostsOperation() {
        return async (context, params) => {
            const { limit = 10 } = params;
            const posts = await context.page.evaluate((limit) => {
                const postElements = document.querySelectorAll('article[class*="Feed_wrap_3v9LH"]');
                return Array.from(postElements).slice(0, limit).map(post => ({
                    content: post.querySelector('div[class*="Feed_body_"]')?.textContent?.trim(),
                    timestamp: post.querySelector('time')?.getAttribute('datetime'),
                    stats: {
                        likes: post.querySelector('[class*="like_"]')?.textContent?.trim(),
                        comments: post.querySelector('[class*="comment_"]')?.textContent?.trim(),
                        reposts: post.querySelector('[class*="repost_"]')?.textContent?.trim()
                    }
                }));
            }, limit);
            
            return { posts, count: posts.length };
        };
    }

    /**
     * 创建提取搜索结果操作
     */
    createExtractSearchResultsOperation() {
        return async (context, params) => {
            const { limit = 10 } = params;
            const results = await context.page.evaluate((limit) => {
                const resultElements = document.querySelectorAll('div[class*="Pl_"]');
                return Array.from(resultElements).slice(0, limit).map(result => ({
                    title: result.querySelector('h3')?.textContent?.trim(),
                    snippet: result.querySelector('p')?.textContent?.trim(),
                    url: result.querySelector('a')?.href
                }));
            }, limit);
            
            return { results, count: results.length };
        };
    }

    /**
     * 创建提取信息流帖子操作
     */
    createExtractFeedPostsOperation() {
        return async (context, params) => {
            const { limit = 10 } = params;
            const posts = await context.page.evaluate((limit) => {
                const postElements = document.querySelectorAll('article[class*="Feed_wrap_3v9LH"]');
                return Array.from(postElements).slice(0, limit).map(post => ({
                    id: post.getAttribute('data-feedid'),
                    content: post.querySelector('div[class*="Feed_body_"]')?.textContent?.trim(),
                    author: post.querySelector('.head_main_3DRDm')?.textContent?.trim(),
                    timestamp: post.querySelector('.head-info_time_6sFQg')?.textContent?.trim(),
                    stats: {
                        likes: post.querySelector('[class*="like_"]')?.textContent?.trim(),
                        comments: post.querySelector('[class*="comment_"]')?.textContent?.trim(),
                        reposts: post.querySelector('[class*="repost_"]')?.textContent?.trim()
                    }
                }));
            }, limit);
            
            return { posts, count: posts.length };
        };
    }

    /**
     * 执行容器操作
     */
    async executeContainerOperation(containerId, operationName, params = {}) {
        const container = this.containerRegistry.get(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }

        try {
            this.logInfo(`Executing operation: ${operationName}`, {
                container: containerId,
                operation: operationName,
                params
            });

            const result = await container.executeOperation(operationName, this.currentContext, params);
            
            this.logInfo(`Operation completed: ${operationName}`, {
                container: containerId,
                operation: operationName,
                success: true
            });

            return result;
            
        } catch (error) {
            this.logError(`Operation failed: ${operationName}`, error);
            
            // 使用错误处理中心处理错误
            const handledError = this.errorHandlingCenter.handleError(error, {
                containerId,
                operationName,
                params
            });
            
            throw handledError;
        }
    }

    /**
     * 提取页面内容
     */
    async extractPageContent() {
        const results = {};
        
        for (const [containerId, container] of this.containerRegistry) {
            try {
                const result = await container.executeOperation('extractContent', this.currentContext);
                results[containerId] = result;
            } catch (error) {
                this.logWarn(`Failed to extract content from container ${containerId}`, { error: error.message });
                results[containerId] = { error: error.message };
            }
        }
        
        return results;
    }

    /**
     * 获取容器
     */
    getContainer(id) {
        return this.containerRegistry.get(id);
    }

    /**
     * 获取所有容器
     */
    getAllContainers() {
        return Array.from(this.containerRegistry.values());
    }

    /**
     * 工具方法
     */
    getPageType(url) {
        if (url.includes('#comment')) return 'post-detail';
        if (url.includes('/u/')) return 'user-profile';
        if (url.includes('/search')) return 'search';
        if (url.includes('/home')) return 'feed';
        return 'unknown';
    }

    /**
     * 获取系统状态
     */
    getSystemStatus() {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            pageType: this.pageType,
            containerCount: this.containerRegistry.size,
            containers: Array.from(this.containerRegistry.keys()),
            operationHistory: this.operationHistory.slice(-10), // 最近10条操作记录
            cacheSize: this.cache.size,
            currentPage: this.currentPage ? 'available' : 'not_available'
        };
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        return {
            healthy: true,
            pageType: this.pageType,
            containerCount: this.containerRegistry.size,
            currentPage: this.currentPage ? 'available' : 'not_available',
            timestamp: new Date().toISOString()
        };
    }
}

// 导出类
module.exports = WeiboContainerOperator;