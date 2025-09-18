#!/usr/bin/env node

const { PreciseWebOperator, ContainerElement, OperationDefinition } = require('./precise-element-operator');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 完整的微博容器化操作系统
 * 基于分层容器架构的精确网页操作框架
 */
class WeiboContainerSystem {
    constructor(page) {
        this.operator = new PreciseWebOperator(page);
        this.systemState = {
            currentPage: '',
            isLoggedIn: false,
            currentOperation: null
        };
        this.operationHistory = [];
    }

    /**
     * 构建完整的微博容器架构
     */
    buildCompleteArchitecture() {
        // === 第一层：页面总容器 ===
        const pageContainer = this.operator.createContainer({
            id: 'weibo-page-container',
            name: '微博页面总容器',
            description: '微博页面的最外层容器，包含所有内容',
            type: 'page-container',
            selectors: ['body', '.woo-layout-main', '[class*="Page_wrap_"]'],
            operations: {
                getPageInfo: {
                    description: '获取页面基本信息',
                    action: async ({ page }) => {
                        return await page.evaluate(() => ({
                            title: document.title,
                            url: window.location.href,
                            scrollHeight: document.body.scrollHeight,
                            viewportHeight: window.innerHeight,
                            allElementsCount: document.querySelectorAll('*').length
                        }));
                    }
                },
                navigateTo: {
                    description: '导航到指定URL',
                    action: async ({ page }, { url }) => {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(2000);
                        this.systemState.currentPage = url;
                        return true;
                    }
                },
                checkLoginState: {
                    description: '检查登录状态',
                    action: async ({ page }) => {
                        const currentUrl = page.url();
                        const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('signin');
                        this.systemState.isLoggedIn = isLoggedIn;
                        return isLoggedIn;
                    }
                },
                scrollToPosition: {
                    description: '滚动到指定位置',
                    action: async ({ page }, { position = 'bottom', percentage = 100 }) => {
                        const targetScroll = position === 'bottom' ? 
                            document.body.scrollHeight : 
                            document.body.scrollHeight * (percentage / 100);
                        await page.evaluate((scroll) => {
                            window.scrollTo(0, scroll);
                        }, targetScroll);
                        await page.waitForTimeout(1000);
                        return true;
                    }
                }
            },
            contentList: [
                // === 第二层：主要区域容器 ===
                {
                    id: 'navigation-container',
                    name: '导航栏容器',
                    description: '页面顶部导航栏，包含搜索、通知、用户菜单等',
                    type: 'navigation-container',
                    selectors: ['.woo-bar-nav', '.gn_header', '.gn_header__nav'],
                    operations: {
                        getSearchBox: {
                            description: '获取搜索框',
                            action: async ({ element }) => {
                                const searchBox = await element.$('input[placeholder*="搜索"], input[type="search"]');
                                return searchBox ? await searchBox.inputValue() : null;
                            }
                        },
                        clickSearch: {
                            description: '点击搜索',
                            action: async ({ element }) => {
                                const searchButton = await element.$('button[aria-label*="搜索"], .gn_search');
                                if (searchButton) {
                                    await searchButton.click();
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    return true;
                                }
                                return false;
                            }
                        },
                        getUserMenu: {
                            description: '获取用户菜单',
                            action: async ({ element }) => {
                                const userMenu = await element.$('.gn_nav_list .gn_nav_item_user, .woo-pop-profile');
                                return userMenu ? await userMenu.textContent() : null;
                            }
                        },
                        clickHome: {
                            description: '点击首页',
                            action: async ({ element }) => {
                                const homeLink = await element.$('a[href*="/home"], a[aria-label*="首页"]');
                                if (homeLink) {
                                    await homeLink.click();
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    return true;
                                }
                                return false;
                            }
                        }
                    }
                },
                {
                    id: 'main-content-container',
                    name: '主内容容器',
                    description: '页面主内容区域，根据页面类型包含不同内容',
                    type: 'main-content-container',
                    selectors: ['.woo-layout-main', '.main-content', '[class*="main_"]'],
                    operations: {
                        getCurrentPageType: {
                            description: '获取当前页面类型',
                            action: async ({ page }) => {
                                const url = page.url();
                                if (url.includes('/home')) return 'home';
                                if (url.includes('/u/')) return 'user-profile';
                                if (url.includes('/search')) return 'search';
                                if (url.includes('#comment')) return 'post-detail';
                                return 'unknown';
                            }
                        },
                        scrollIntoView: {
                            description: '滚动到内容区域',
                            action: async ({ element }) => {
                                await element.scrollIntoView({ behavior: 'smooth' });
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                return true;
                            }
                        }
                    },
                    contentList: [
                        // === 第三层：功能容器 ===
                        {
                            id: 'feed-container',
                            name: '信息流容器',
                            description: '微博信息流（首页、关注页等）',
                            type: 'feed-container',
                            selectors: ['.Feed_body_3R0rO', '.woo-feed-list', '.woo-feed-item'],
                            operations: {
                                getAllPosts: {
                                    description: '获取所有帖子',
                                    action: async ({ element }) => {
                                        const posts = await element.$$('.woo-feed-item, .Feed_body_3R0rO');
                                        const postData = [];
                                        for (const post of posts) {
                                            try {
                                                const title = await post.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                                                const author = await post.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                                                if (title || author) {
                                                    postData.push({ title, author });
                                                }
                                            } catch (error) {
                                                continue;
                                            }
                                        }
                                        return postData;
                                    }
                                },
                                loadMorePosts: {
                                    description: '加载更多帖子',
                                    action: async ({ page }) => {
                                        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
                                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                                        await page.waitForTimeout(2000);
                                        const newHeight = await page.evaluate(() => document.body.scrollHeight);
                                        return newHeight > currentHeight;
                                    }
                                },
                                filterByType: {
                                    description: '按类型筛选帖子',
                                    action: async ({ element }, { type = 'all' }) => {
                                        // 实现筛选逻辑
                                        return true;
                                    }
                                }
                            },
                            contentList: [
                                {
                                    id: 'post-item-container',
                                    name: '帖子项容器',
                                    description: '单个微博帖子项',
                                    type: 'post-item-container',
                                    selectors: ['.woo-feed-item', '.Feed_body_3R0rO'],
                                    operations: {
                                        getPostInfo: {
                                            description: '获取帖子信息',
                                            action: async ({ element }) => {
                                                const title = await element.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                                                const author = await element.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                                                const time = await element.$eval('.head-info_time_6sFQg', el => el.textContent).catch(() => '');
                                                return { title, author, time };
                                            }
                                        },
                                        clickPost: {
                                            description: '点击帖子查看详情',
                                            action: async ({ element }) => {
                                                const postLink = await element.$('a[href*="/"]');
                                                if (postLink) {
                                                    await postLink.click();
                                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                                    return true;
                                                }
                                                return false;
                                            }
                                        }
                                    }
                                }
                            ]
                        },
                        {
                            id: 'post-detail-container',
                            name: '帖子详情容器',
                            description: '单个微博帖子的详情页',
                            type: 'post-detail-container',
                            selectors: ['article[class*="Feed_wrap_3v9LH"]', '.woo-panel-main.Detail_feed_3iffy'],
                            operations: {
                                getPostInfo: {
                                    description: '获取帖子详细信息',
                                    action: async ({ element }) => {
                                        const title = await element.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                                        const author = await element.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                                        const time = await element.$eval('.head-info_time_6sFQg', el => el.textContent).catch(() => '');
                                        const stats = await element.$eval('.feed_action_3fFqM', el => el.textContent).catch(() => '');
                                        return { title, author, time, stats };
                                    }
                                },
                                likePost: {
                                    description: '点赞帖子',
                                    action: async ({ element }) => {
                                        const likeButton = await element.$('button[aria-label*="赞"], .woo-button-main');
                                        if (likeButton) {
                                            await likeButton.click();
                                            await new Promise(resolve => setTimeout(resolve, 1000));
                                            return true;
                                        }
                                        return false;
                                    }
                                }
                            },
                            contentList: [
                                {
                                    id: 'post-media-container',
                                    name: '媒体内容容器',
                                    description: '帖子的媒体内容（图片、视频）',
                                    type: 'media-container',
                                    selectors: ['.woo-box-flex.woo-box-alignCenter.media_media-pic_2hjWt', '.media_media-video_2hjWt'],
                                    operations: {
                                        extractImages: {
                                            description: '提取图片',
                                            action: async ({ element }) => {
                                                const images = await element.$$eval('img[src*="sina"]', imgs => 
                                                    imgs.map(img => img.src).filter(src => src && src.includes('jpg'))
                                                );
                                                return images;
                                            }
                                        },
                                        extractVideos: {
                                            description: '提取视频',
                                            action: async ({ element }) => {
                                                const videos = await element.$$eval('video', videos => 
                                                    videos.map(video => video.src).filter(src => src)
                                                );
                                                return videos;
                                            }
                                        }
                                    }
                                },
                                {
                                    id: 'post-text-container',
                                    name: '文字内容容器',
                                    description: '帖子的文字内容',
                                    type: 'text-container',
                                    selectors: ['.detail_wbtext_4CRf9', '.Feed_body_3R0rO .detail_wbtext_4CRf9'],
                                    operations: {
                                        extractText: {
                                            description: '提取文字内容',
                                            action: async ({ element }) => {
                                                return await element.textContent();
                                            }
                                        },
                                        getHashtags: {
                                            description: '提取话题标签',
                                            action: async ({ element }) => {
                                                const text = await element.textContent();
                                                const hashtags = text.match(/#[^#]+#/g) || [];
                                                return hashtags;
                                            }
                                        },
                                        getMentions: {
                                            description: '提取@提及',
                                            action: async ({ element }) => {
                                                const text = await element.textContent();
                                                const mentions = text.match(/@[^@\s]+/g) || [];
                                                return mentions;
                                            }
                                        }
                                    }
                                },
                                {
                                    id: 'comments-container',
                                    name: '评论区容器',
                                    description: '帖子的评论区',
                                    type: 'comments-container',
                                    selectors: ['.Detail_box_3Jeom', '.woo-panel-main.Card_wrap_2ibWe.Detail_detail_3typT'],
                                    operations: {
                                        scrollToView: {
                                            description: '滚动到评论区',
                                            action: async ({ element }) => {
                                                await element.scrollIntoView({ behavior: 'smooth' });
                                                await new Promise(resolve => setTimeout(resolve, 2000));
                                                return true;
                                            }
                                        },
                                        checkHasComments: {
                                            description: '检查是否有评论',
                                            action: async ({ element }) => {
                                                const hasComments = await element.$('.wbpro-list').then(el => !!el);
                                                return hasComments;
                                            }
                                        },
                                        extractAllComments: {
                                            description: '提取所有评论',
                                            action: async ({ element, page }) => {
                                                return await this.extractCommentsFromContainer(element, page);
                                            }
                                        }
                                    }
                                }
                            ]
                        },
                        {
                            id: 'user-profile-container',
                            name: '用户主页容器',
                            description: '用户个人主页',
                            type: 'user-profile-container',
                            selectors: ['.Profile_wrap_2y_pF', '.woo-panel.Profile_panel_3y_pF'],
                            operations: {
                                getUserInfo: {
                                    description: '获取用户信息',
                                    action: async ({ element }) => {
                                        const username = await element.$eval('.woo-box-flex.woo-box-alignCenter.Profile_name_2y_pF', el => el.textContent).catch(() => '');
                                        const bio = await element.$eval('.Profile_desc_2y_pF', el => el.textContent).catch(() => '');
                                        return { username, bio };
                                    }
                                },
                                getFollowStats: {
                                    description: '获取关注统计',
                                    action: async ({ element }) => {
                                        const stats = await element.$$eval('.Profile_follow_2y_pF span', spans => 
                                            spans.map(span => span.textContent)
                                        );
                                        return stats;
                                    }
                                },
                                followUser: {
                                    description: '关注用户',
                                    action: async ({ element }) => {
                                        const followButton = await element.$('button[aria-label*="关注"], .woo-button-main');
                                        if (followButton) {
                                            await followButton.click();
                                            await new Promise(resolve => setTimeout(resolve, 1000));
                                            return true;
                                        }
                                        return false;
                                    }
                                }
                            }
                        },
                        {
                            id: 'search-results-container',
                            name: '搜索结果容器',
                            description: '搜索结果页面',
                            type: 'search-results-container',
                            selectors: ['.search-result', '.woo-panel.SearchResult', '.search_main'],
                            operations: {
                                getSearchResults: {
                                    description: '获取搜索结果',
                                    action: async ({ element }) => {
                                        const results = await element.$$('.woo-feed-item, .search_item');
                                        const searchData = [];
                                        for (const result of results) {
                                            try {
                                                const title = await result.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                                                const author = await result.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                                                if (title || author) {
                                                    searchData.push({ title, author });
                                                }
                                            } catch (error) {
                                                continue;
                                            }
                                        }
                                        return searchData;
                                    }
                                },
                                loadMoreResults: {
                                    description: '加载更多结果',
                                    action: async ({ page }) => {
                                        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
                                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                                        await page.waitForTimeout(2000);
                                        const newHeight = await page.evaluate(() => document.body.scrollHeight);
                                        return newHeight > currentHeight;
                                    }
                                }
                            }
                        }
                    ]
                }
            ]
        });

        return pageContainer;
    }

    /**
     * 从评论容器中提取评论
     */
    async extractCommentsFromContainer(commentContainer, page) {
        const comments = [];
        let scrollCount = 0;
        const maxScrolls = 20;
        let lastCommentCount = 0;
        let noNewCommentsCount = 0;
        const maxNoNewComments = 3;

        while (scrollCount < maxScrolls && noNewCommentsCount < maxNoNewComments) {
            // 获取当前所有评论项
            const commentItems = await commentContainer.$$('.wbpro-scroller-item, .vue-recycle-scroller__item-view');
            
            // 提取新评论
            const newComments = [];
            for (const item of commentItems) {
                try {
                    const commentData = await item.$eval('.item1in .con1 .text, .text', el => el.textContent).catch(() => '');
                    if (commentData && commentData.trim().length > 3) {
                        const username = await item.$eval('.ALink_default_2ibt1 a', el => el.textContent).catch(() => '');
                        const userLink = await item.$eval('.ALink_default_2ibt1 a', el => el.href).catch(() => '');
                        const info = await item.$eval('.info', el => el.textContent).catch(() => '');
                        
                        const cleanContent = commentData.trim()
                            .replace(/\s+/g, ' ')
                            .replace(/展开|返回|更多|收起/g, '')
                            .trim();

                        // 检查是否已存在
                        const exists = comments.find(c => c.content === cleanContent);
                        if (!exists && cleanContent.length >= 3) {
                            newComments.push({
                                content: cleanContent.substring(0, 300),
                                author: username.trim() || '匿名用户',
                                authorLink: userLink || '',
                                time: info.trim(),
                                extractedAt: new Date().toISOString()
                            });
                        }
                    }
                } catch (error) {
                    continue;
                }
            }

            if (newComments.length > 0) {
                comments.push(...newComments);
                noNewCommentsCount = 0;
            } else {
                noNewCommentsCount++;
            }

            // 滚动加载更多
            const commentList = await commentContainer.$('.RepostCommentList_mar1_3VHkS, .Scroll_container_280Ky');
            if (commentList) {
                const currentHeight = await commentList.evaluate(el => el.scrollHeight);
                await commentList.evaluate(el => el.scrollTo(0, el.scrollHeight));
                await new Promise(resolve => setTimeout(resolve, 3000));
                const newHeight = await commentList.evaluate(el => el.scrollHeight);
                
                if (newHeight <= currentHeight) {
                    break;
                }
            }

            scrollCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return comments;
    }

    /**
     * 初始化系统
     */
    async initialize() {
        console.log('🏗️ 初始化微博容器化系统...');
        const pageContainer = this.buildCompleteArchitecture();
        console.log('✅ 系统架构构建完成');
        return pageContainer;
    }

    /**
     * 执行完整页面分析
     */
    async analyzePage() {
        console.log('🔍 开始页面分析...');
        
        const results = {
            pageInfo: {},
            containers: {},
            extractedData: {},
            operationStats: {
                totalOperations: 0,
                successfulOperations: 0,
                failedOperations: 0
            }
        };

        try {
            // 获取页面信息
            console.log('📄 获取页面信息...');
            const pageInfo = await this.operator.operate('weibo-page-container', 'getPageInfo');
            results.pageInfo = pageInfo;

            // 检查登录状态
            console.log('🔐 检查登录状态...');
            const isLoggedIn = await this.operator.operate('weibo-page-container', 'checkLoginState');
            results.systemState = { ...this.systemState };

            // 获取页面类型
            console.log('📋 获取页面类型...');
            const pageType = await this.operator.operate('main-content-container', 'getCurrentPageType');
            results.pageType = pageType;

            // 根据页面类型执行特定操作
            switch (pageType) {
                case 'post-detail':
                    console.log('📝 分析帖子详情页...');
                    await this.analyzePostDetail(results);
                    break;
                case 'user-profile':
                    console.log('👤 分析用户主页...');
                    await this.analyzeUserProfile(results);
                    break;
                case 'search':
                    console.log('🔍 分析搜索结果页...');
                    await this.analyzeSearchResults(results);
                    break;
                case 'home':
                    console.log('🏠 分析信息流页...');
                    await this.analyzeFeed(results);
                    break;
                default:
                    console.log('❓ 未知页面类型');
            }

            // 保存分析结果
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const resultFile = path.join(process.env.HOME || '~', '.webauto', `weibo-system-analysis-${timestamp}.json`);
            await fs.mkdir(path.dirname(resultFile), { recursive: true });
            await fs.writeFile(resultFile, JSON.stringify({
                ...results,
                systemArchitecture: this.operator.exportLibrary()
            }, null, 2));

            console.log(`💾 分析结果已保存到: ${resultFile}`);
            return results;

        } catch (error) {
            console.error('❌ 页面分析失败:', error.message);
            return null;
        }
    }

    /**
     * 分析帖子详情页
     */
    async analyzePostDetail(results) {
        try {
            // 获取帖子信息
            const postInfo = await this.operator.operate('post-detail-container', 'getPostInfo');
            results.extractedData.postInfo = postInfo;

            // 提取媒体内容
            const images = await this.operator.operate('post-media-container', 'extractImages');
            const videos = await this.operator.operate('post-media-container', 'extractVideos');
            results.extractedData.media = { images, videos };

            // 提取文字内容
            const text = await this.operator.operate('post-text-container', 'extractText');
            const hashtags = await this.operator.operate('post-text-container', 'getHashtags');
            const mentions = await this.operator.operate('post-text-container', 'getMentions');
            results.extractedData.text = { text, hashtags, mentions };

            // 处理评论
            await this.operator.operate('comments-container', 'scrollToView');
            const hasComments = await this.operator.operate('comments-container', 'checkHasComments');
            if (hasComments) {
                const comments = await this.operator.operate('comments-container', 'extractAllComments');
                results.extractedData.comments = comments;
                console.log(`💬 提取了 ${comments.length} 条评论`);
            }

        } catch (error) {
            console.error('❌ 帖子详情分析失败:', error.message);
        }
    }

    /**
     * 分析用户主页
     */
    async analyzeUserProfile(results) {
        try {
            // 获取用户信息
            const userInfo = await this.operator.operate('user-profile-container', 'getUserInfo');
            results.extractedData.userInfo = userInfo;

            // 获取关注统计
            const followStats = await this.operator.operate('user-profile-container', 'getFollowStats');
            results.extractedData.followStats = followStats;

        } catch (error) {
            console.error('❌ 用户主页分析失败:', error.message);
        }
    }

    /**
     * 分析搜索结果页
     */
    async analyzeSearchResults(results) {
        try {
            // 获取搜索结果
            const searchResults = await this.operator.operate('search-results-container', 'getSearchResults');
            results.extractedData.searchResults = searchResults;
            console.log(`🔍 找到 ${searchResults.length} 条搜索结果`);

        } catch (error) {
            console.error('❌ 搜索结果分析失败:', error.message);
        }
    }

    /**
     * 分析信息流页
     */
    async analyzeFeed(results) {
        try {
            // 获取所有帖子
            const posts = await this.operator.operate('feed-container', 'getAllPosts');
            results.extractedData.posts = posts;
            console.log(`📝 获取了 ${posts.length} 条帖子`);

        } catch (error) {
            console.error('❌ 信息流分析失败:', error.message);
        }
    }

    /**
     * 获取系统状态
     */
    getSystemState() {
        return {
            ...this.systemState,
            operationHistory: this.operationHistory,
            systemArchitecture: this.operator.exportLibrary()
        };
    }
}

// 主函数
async function main() {
    console.log('🌐 微博容器化操作系统\n');
    
    // 加载cookie
    const cookieFile = path.join(process.env.HOME || '~', '.webauto', 'cookies', 'weibo.com.json');
    let cookies = [];
    
    try {
        const cookieData = await fs.readFile(cookieFile, 'utf8');
        cookies = JSON.parse(cookieData);
        console.log(`✅ 加载了 ${cookies.length} 个Cookie`);
    } catch (error) {
        console.log('❌ 未找到Cookie文件，请先登录');
        return;
    }
    
    // 启动浏览器
    const browser = await chromium.launch({ 
        headless: false,
        viewport: { width: 1920, height: 1080 }
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    await context.addCookies(cookies);
    const page = await context.newPage();
    
    try {
        // 初始化系统
        const system = new WeiboContainerSystem(page);
        await system.initialize();
        
        // 导航到测试页面
        const testUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
        await system.operator.operate('weibo-page-container', 'navigateTo', { url: testUrl });
        
        // 执行页面分析
        const results = await system.analyzePage();
        
        if (results) {
            console.log('\n📋 系统分析结果:');
            console.log('=' * 60);
            
            const { pageInfo, pageType, extractedData, systemState } = results;
            console.log(`📄 页面: ${pageInfo.title}`);
            console.log(`🔗 URL: ${pageInfo.url}`);
            console.log(`📋 页面类型: ${pageType}`);
            console.log(`🔐 登录状态: ${systemState.isLoggedIn ? '已登录' : '未登录'}`);
            
            // 显示提取的数据
            if (extractedData.postInfo) {
                console.log(`📝 帖子: ${extractedData.postInfo.author || '未知'} - ${extractedData.postInfo.title?.substring(0, 50) || '无标题'}...`);
            }
            
            if (extractedData.media) {
                console.log(`🖼️ 图片: ${extractedData.media.images?.length || 0} 张`);
                console.log(`🎥 视频: ${extractedData.media.videos?.length || 0} 个`);
            }
            
            if (extractedData.text) {
                console.log(`📝 文字: ${extractedData.text.text?.substring(0, 50) || '无内容'}...`);
                console.log(`🏷️ 话题标签: ${extractedData.text.hashtags?.length || 0} 个`);
                console.log(`📢 @提及: ${extractedData.text.mentions?.length || 0} 个`);
            }
            
            if (extractedData.comments) {
                console.log(`💬 评论: ${extractedData.comments.length} 条`);
                if (extractedData.comments.length > 0) {
                    console.log('\n📝 前三条评论:');
                    extractedData.comments.slice(0, 3).forEach((comment, index) => {
                        console.log(`${index + 1}. ${comment.author}: ${comment.content.substring(0, 60)}...`);
                    });
                }
            }
        }
        
    } catch (error) {
        console.error('❌ 系统执行失败:', error);
    } finally {
        await browser.close();
        console.log('🧹 浏览器已关闭');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = WeiboContainerSystem;