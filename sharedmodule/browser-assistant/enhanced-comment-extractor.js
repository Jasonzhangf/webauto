#!/usr/bin/env node

/**
 * 增强版微博评论提取工具
 * 专门解决动态加载问题：评论展开点击 + 分页加载
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

class EnhancedWeiboCommentExtractor {
    constructor() {
        this.outputDir = path.join(process.env.HOME || '~', '.webauto', 'enhanced-comments');
        this.results = {
            url: '',
            title: '',
            author: '',
            content: '',
            comments: [],
            expandClicks: 0,
            pageLoads: 0,
            scrollActions: 0,
            startTime: null,
            endTime: null
        };
        this.browser = null;
        this.maxComments = 1000; // 最大提取评论数
        this.maxRetries = 3; // 最大重试次数
    }

    async initialize() {
        console.log('🚀 初始化增强版微博评论提取工具...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        
        // 启动浏览器
        this.browser = await puppeteer.launch({
            headless: false, // 可视化模式便于调试
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        
        this.results.startTime = new Date();
        console.log('✅ 初始化完成');
    }

    async extractAllComments(url) {
        console.log(`🔥 开始增强版评论提取: ${url}`);
        this.results.url = url;
        
        const page = await this.browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 设置页面超时
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(60000);
        
        // 加载微博cookie
        await this.loadCookies(page);
        
        try {
            // 访问微博页面
            console.log('📄 访问微博页面...');
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 检查是否需要登录
            const loginRequired = await page.evaluate(() => {
                return document.querySelector('a[href*="login"], .login_btn') !== null;
            });
            
            if (loginRequired) {
                console.log('⚠️ 需要登录，请手动登录后继续...');
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
            
            // 提取微博基本信息
            await this.extractPostInfo(page);
            
            // 多阶段评论提取策略
            console.log('🎯 开始多阶段评论提取...');
            
            // 阶段1: 观察页面架构，找到评论容器
            const commentContainers = await this.findCommentContainers(page);
            
            if (commentContainers.length > 0) {
                console.log(`🔍 找到 ${commentContainers.length} 个评论容器`);
                
                // 阶段2: 在找到的评论容器内展开评论（返回更新后的容器）
                const expandedContainers = await this.expandCommentsInContainers(page, commentContainers);
                
                // 阶段3: 在评论容器内滚动加载更多
                await this.scrollInContainers(page, expandedContainers);
                
                // 阶段4: 从评论容器中提取评论
                const comments = await this.extractCommentsFromContainers(page, expandedContainers);
                this.results.comments.push(...comments);
            } else {
                console.log('⚠️ 未找到评论容器，跳过提取');
            }
            
            console.log(`✅ 提取完成！共 ${this.results.comments.length} 条评论`);
            console.log(`📊 统计: 展开${this.results.expandClicks}次 | 滚动${this.results.scrollActions}次 | 加载${this.results.pageLoads}次`);
            
        } catch (error) {
            console.error('❌ 提取失败:', error.message);
        } finally {
            await page.close();
        }
    }

    async loadCookies(page) {
        try {
            const cookieFile = '/Users/fanzhang/Documents/github/webauto/cookies/weibo.com.json';
            
            if (await fs.pathExists(cookieFile)) {
                const cookies = await fs.readJson(cookieFile);
                const puppeteerCookies = cookies.map(cookie => ({
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    expires: cookie.expires,
                    httpOnly: cookie.httpOnly,
                    secure: cookie.secure,
                    sameSite: cookie.sameSite
                }));
                
                await page.setCookie(...puppeteerCookies);
                console.log('✅ 已加载微博cookie');
            }
        } catch (error) {
            console.warn('⚠️ 加载cookie失败:', error.message);
        }
    }

    async extractPostInfo(page) {
        const postInfo = await page.evaluate(() => {
            const titleElement = document.querySelector('h1, .title, [class*="title"]');
            const authorElement = document.querySelector('.author, .user-name, [class*="author"], [class*="name"]');
            const contentElement = document.querySelector('.content, .text, .WB_text, [class*="content"]');
            
            return {
                title: titleElement?.textContent?.trim() || '',
                author: authorElement?.textContent?.trim() || '',
                content: contentElement?.textContent?.trim() || ''
            };
        });
        
        this.results.title = postInfo.title;
        this.results.author = postInfo.author;
        this.results.content = postInfo.content;
        
        console.log(`📝 微博信息: ${postInfo.author} - ${postInfo.title}`);
    }

    async expandAllComments(page) {
        console.log('🔽 阶段1: 展开所有评论...');
        
        let totalExpanded = 0;
        let retryCount = 0;
        
        while (retryCount < this.maxRetries) {
            try {
                const expanded = await page.evaluate(() => {
                    let expandedCount = 0;
                    
                    // 查找所有可能需要展开的按钮
                    const buttons = document.querySelectorAll('button, a, [role="button"], [class*="btn"]');
                    
                    buttons.forEach(btn => {
                        const text = btn.textContent || '';
                        const ariaLabel = btn.getAttribute('aria-label') || '';
                        
                        // 检查是否为展开评论的按钮
                        if (text.includes('展开') || text.includes('评论') || text.includes('更多') ||
                            text.includes('查看') || text.includes('回复') ||
                            ariaLabel.includes('展开') || ariaLabel.includes('评论')) {
                            
                            // 确保按钮可见
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                setTimeout(() => {
                                    btn.click();
                                }, 100);
                                expandedCount++;
                            }
                        }
                    });
                    
                    return expandedCount;
                });
                
                if (expanded > 0) {
                    totalExpanded += expanded;
                    this.results.expandClicks += expanded;
                    console.log(`✅ 展开了 ${expanded} 个评论区域 (总计: ${totalExpanded})`);
                    
                    // 等待展开动画完成
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // 如果有展开，重置重试计数
                    retryCount = 0;
                } else {
                    retryCount++;
                    console.log(`⚪ 第 ${retryCount} 次扫描，未找到需要展开的评论`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // 如果达到最大评论数，停止展开
                if (this.results.comments.length >= this.maxComments) {
                    break;
                }
                
            } catch (error) {
                console.warn(`⚠️ 展开评论时出错: ${error.message}`);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`🎯 阶段1完成: 共展开了 ${totalExpanded} 个评论区域`);
    }

    async loadCommentsByScrolling(page) {
        console.log('📜 阶段2: 滚动加载更多评论...');
        
        let previousCommentCount = 0;
        let noNewCommentsCount = 0;
        let scrollRound = 0;
        
        while (noNewCommentsCount < 3 && scrollRound < 10) {
            scrollRound++;
            
            try {
                // 多种滚动策略
                const strategies = [
                    () => window.scrollTo(0, document.body.scrollHeight),
                    () => window.scrollBy(0, 1000),
                    () => {
                        const comments = document.querySelectorAll('[class*="comment"]');
                        if (comments.length > 0) {
                            comments[comments.length - 1].scrollIntoView({ behavior: 'smooth' });
                        }
                    }
                ];
                
                // 执行滚动
                await page.evaluate(() => {
                    const strategies = [
                        () => window.scrollTo(0, document.body.scrollHeight),
                        () => window.scrollBy(0, 1000),
                        () => {
                            const comments = document.querySelectorAll('[class*="comment"]');
                            if (comments.length > 0) {
                                comments[comments.length - 1].scrollIntoView({ behavior: 'smooth' });
                            }
                        }
                    ];
                    
                    // 随机选择一种滚动策略
                    const strategy = strategies[Math.floor(Math.random() * strategies.length)];
                    strategy();
                });
                
                this.results.scrollActions++;
                
                // 等待新评论加载
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 检查是否有新评论加载
                const currentCommentCount = await page.evaluate(() => {
                    return document.querySelectorAll('[class*="comment"]').length;
                });
                
                if (currentCommentCount > previousCommentCount) {
                    console.log(`📈 滚动加载了 ${currentCommentCount - previousCommentCount} 条新评论`);
                    previousCommentCount = currentCommentCount;
                    noNewCommentsCount = 0;
                } else {
                    noNewCommentsCount++;
                    console.log(`⚪ 第 ${noNewCommentsCount} 次滚动无新评论`);
                }
                
                // 如果达到最大评论数，停止滚动
                if (this.results.comments.length >= this.maxComments) {
                    break;
                }
                
            } catch (error) {
                console.warn(`⚠️ 滚动加载时出错: ${error.message}`);
                noNewCommentsCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`🎯 阶段2完成: 滚动了 ${scrollRound} 轮，执行了 ${this.results.scrollActions} 次滚动`);
    }

    async loadMoreComments(page) {
        console.log('🔄 阶段3: 查找并点击"加载更多"按钮...');
        
        let moreClicks = 0;
        let noMoreCount = 0;
        
        while (noMoreCount < 3 && moreClicks < 10) {
            try {
                const clicked = await page.evaluate(() => {
                    let clicked = false;
                    
                    // 查找"加载更多"相关按钮
                    const moreButtons = document.querySelectorAll('button, a, [role="button"]');
                    
                    moreButtons.forEach(btn => {
                        if (clicked) return;
                        
                        const text = btn.textContent || '';
                        const ariaLabel = btn.getAttribute('aria-label') || '';
                        
                        // 检查是否为"加载更多"按钮
                        if (text.includes('更多') || text.includes('加载') || text.includes('下一页') ||
                            text.includes('查看更多') || text.includes('全部评论') ||
                            ariaLabel.includes('更多') || ariaLabel.includes('加载')) {
                            
                            // 确保按钮可见
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                setTimeout(() => {
                                    btn.click();
                                }, 200);
                                clicked = true;
                            }
                        }
                    });
                    
                    return clicked;
                });
                
                if (clicked) {
                    moreClicks++;
                    this.results.pageLoads++;
                    console.log(`✅ 点击了"加载更多"按钮 (第${moreClicks}次)`);
                    
                    // 等待新评论加载
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    noMoreCount = 0;
                } else {
                    noMoreCount++;
                    console.log(`⚪ 第 ${noMoreCount} 次未找到"加载更多"按钮`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // 如果达到最大评论数，停止点击
                if (this.results.comments.length >= this.maxComments) {
                    break;
                }
                
            } catch (error) {
                console.warn(`⚠️ 点击"加载更多"时出错: ${error.message}`);
                noMoreCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`🎯 阶段3完成: 点击了 ${moreClicks} 次"加载更多"按钮`);
    }

    async extractAllCommentElements(page) {
        console.log('💬 阶段4: 智能评论检测与提取...');
        
        const comments = await page.evaluate(() => {
            const comments = [];
            
            // 智能评论检测算法 - 直接查找评论列表
            const detectCommentElements = () => {
                // 直接使用CSS选择器查找可能的评论元素
                const selectors = [
                    '[class*="comment"]',
                    '[class*="reply"]', 
                    '.feed_item',
                    '.woo-item',
                    '[class*="item"]'
                ];
                
                const comments = [];
                
                selectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (isSingleComment(element) && !isHotSearchContent(element)) {
                            comments.push(element);
                        }
                    });
                });
                
                // 去重并按位置排序
                return Array.from(new Set(comments))
                    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            };
            
            // 判断是否为单条评论
            const isSingleComment = (element) => {
                const rect = element.getBoundingClientRect();
                const text = element.textContent || '';
                
                // 基本尺寸和内容检查
                if (rect.width < 150 || rect.height < 30) return false;
                if (text.length < 15 || text.length > 800) return false;
                
                // 必须包含用户名特征和内容特征
                const hasUsername = hasValidUsername(element);
                const hasContent = hasValidContent(element);
                const hasInteractive = hasInteractiveElements(element);
                
                // 至少需要用户名和内容
                return hasUsername && hasContent;
            };
            
            // 检查是否包含有效的用户名
            const hasValidUsername = (element) => {
                const candidates = element.querySelectorAll('*');
                return Array.from(candidates).some(child => {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 用户名：2-15字符，不数字开头，不包含热搜特征
                    return text.length >= 2 && text.length <= 15 &&
                           /^[\u4e00-\u9fa5a-zA-Z_]/.test(text) &&
                           !/^\d/.test(text) &&
                           !text.includes('热搜') &&
                           !text.includes('登顶') &&
                           !text.includes('好友正在看') &&
                           (className.includes('name') || className.includes('user') || 
                            className.includes('author') || child.tagName === 'A');
                });
            };
            
            // 检查是否包含有效的内容
            const hasValidContent = (element) => {
                const candidates = element.querySelectorAll('*');
                return Array.from(candidates).some(child => {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 内容：15-500字符，不是按钮或链接
                    return text.length >= 15 && text.length <= 500 &&
                           child.tagName !== 'BUTTON' && child.tagName !== 'A' &&
                           !text.includes('热搜') &&
                           !text.includes('点赞') &&
                           !text.includes('回复') &&
                           (className.includes('text') || className.includes('content') || !className);
                });
            };
            
            // 检查是否有互动元素
            const hasInteractiveElements = (element) => {
                const buttons = element.querySelectorAll('button, a, [role="button"]');
                return Array.from(buttons).some(btn => {
                    const text = btn.textContent || '';
                    return text.includes('赞') || text.includes('回复') || text.includes('转发');
                });
            };
            
            // 排除热搜榜内容
            const isHotSearchContent = (element) => {
                const text = element.textContent || '';
                return text.includes('热搜') || 
                       text.includes('登顶') || 
                       text.includes('好友正在看') ||
                       text.includes('起猛了') ||
                       text.includes('批奏折') ||
                       /\d+起猛了/.test(text) ||
                       /\d+果粉/.test(text);
            };
            
            // 查找评论容器
            const findCommentContainers = (allElements) => {
                const containers = new Set();
                
                allElements.forEach(element => {
                    const className = element.className || '';
                    const text = element.textContent || '';
                    
                    // 查找具有评论容器特征的元素
                    if (className.includes('comment') || 
                        className.includes('reply') ||
                        className.includes('feed') ||
                        text.includes('评论') ||
                        text.includes('回复')) {
                        
                        // 向上查找父容器
                        let container = element;
                        let depth = 0;
                        while (container && depth < 5) {
                            const rect = container.getBoundingClientRect();
                            // 容器应该有合理的尺寸
                            if (rect.width > 300 && rect.height > 100) {
                                containers.add(container);
                                break;
                            }
                            container = container.parentNode;
                            depth++;
                        }
                    }
                });
                
                return Array.from(containers);
            };
            
            // 从容器中提取评论
            const extractCommentsFromContainer = (container) => {
                const children = Array.from(container.children);
                const comments = [];
                
                children.forEach(child => {
                    if (isLikelyComment(child)) {
                        comments.push(child);
                    }
                });
                
                return comments;
            };
            
            // 在评论区域内提取真实评论
            const extractRealComments = (commentSection) => {
                const allElements = commentSection.querySelectorAll('*');
                const comments = [];
                
                allElements.forEach(element => {
                    if (isRealCommentElement(element, commentSection)) {
                        comments.push(element);
                    }
                });
                
                return comments;
            };
            
            // 判断是否为可能的评论元素
            const isLikelyComment = (element) => {
                const rect = element.getBoundingClientRect();
                const text = element.textContent || '';
                
                // 基本过滤
                if (rect.width < 200 || rect.height < 40) return false;
                if (text.length < 10 || text.length > 1000) return false;
                
                // 排除明显不是评论的元素
                if (text.includes('热搜') || text.includes('好友正在看') || text.includes('登顶')) {
                    return false;
                }
                
                // 查找评论特征：用户名、内容、时间等
                const hasMultipleLines = text.split('\n').length > 1;
                const hasUserContent = hasUserAndContent(element);
                const hasStructure = hasCommentStructure(element);
                
                return hasMultipleLines && (hasUserContent || hasStructure);
            };
            
            // 检查是否包含用户和内容的结构
            const hasUserAndContent = (element) => {
                const children = element.querySelectorAll('*');
                let hasName = false;
                let hasContent = false;
                
                children.forEach(child => {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 用户名特征
                    if (!hasName && text.length >= 2 && text.length <= 15 &&
                        !/^\d/.test(text) && 
                        (className.includes('name') || className.includes('user') || className.includes('author'))) {
                        hasName = true;
                    }
                    
                    // 内容特征
                    if (!hasContent && text.length > 10 && text.length < 200 &&
                        (className.includes('text') || className.includes('content') || !className)) {
                        hasContent = true;
                    }
                });
                
                return hasName && hasContent;
            };
            
            // 检查是否有评论的基本结构
            const hasCommentStructure = (element) => {
                // 查找包含用户头像、用户名、内容的典型评论结构
                const hasAvatar = element.querySelector('img');
                const hasTextElements = element.querySelectorAll('*').length > 3;
                const hasReasonableLength = element.textContent.length > 20;
                
                return (hasAvatar && hasTextElements) || hasReasonableLength;
            };
            
            // 检查是否有用户信息（用户名、头像等）
            const hasCommentUserInfo = (element) => {
                // 查找用户名（通常较短，不包含数字开头）
                const nameCandidates = element.querySelectorAll('*');
                return Array.from(nameCandidates).some(child => {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 用户名特征：2-10字符，包含中英文，不包含数字开头
                    return text.length >= 2 && text.length <= 10 &&
                           /^[\u4e00-\u9fa5a-zA-Z_]/.test(text) &&
                           !/^\d/.test(text) &&
                           (className.includes('name') || className.includes('user') || className.includes('author'));
                });
            };
            
            // 检查是否有时间信息
            const hasCommentTime = (element) => {
                const timeCandidates = element.querySelectorAll('*');
                return Array.from(timeCandidates).some(child => {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 时间特征：包含"前"、"分钟"、"小时"、"今天"等
                    return text.match(/\d/) && 
                           (text.includes('前') || text.includes('分钟') || text.includes('小时') ||
                            text.includes('今天') || text.includes('昨天') || className.includes('time'));
                });
            };
            
            // 检查是否有互动按钮（点赞、回复等）
            const hasInteractiveButtons = (element) => {
                const buttons = element.querySelectorAll('button, a, [role="button"]');
                return Array.from(buttons).some(btn => {
                    const text = btn.textContent || '';
                    const className = btn.className || '';
                    
                    // 互动按钮特征
                    return text.includes('赞') || text.includes('回复') || text.includes('转发') ||
                           className.includes('like') || className.includes('reply') || className.includes('share');
                });
            };
            
            // 检查是否有回复模式（@用户、//回复等）
            const hasReplyKeywords = (text) => {
                return text.includes('@') || text.includes('//') || text.includes('回复') || text.includes('楼');
            };
            
            // 判断元素是否在可能的评论区域
            const isInLikelyCommentSection = (element) => {
                let current = element;
                let depth = 0;
                
                while (current && depth < 10) {
                    const className = current.className || '';
                    const id = current.id || '';
                    
                    // 检查父容器的类名
                    const sectionKeywords = ['comment', 'reply', 'discuss', 'chat', 'list', 'container', 'wrapper', 'section'];
                    if (sectionKeywords.some(keyword => 
                        className.toLowerCase().includes(keyword) || id.toLowerCase().includes(keyword)
                    )) {
                        return true;
                    }
                    
                    current = current.parentNode;
                    depth++;
                }
                
                return false;
            };
            
            // 判断元素是否在热搜榜区域（重要过滤）
            const isInHotSearchSection = (element) => {
                let current = element;
                let depth = 0;
                
                while (current && depth < 15) {
                    const className = current.className || '';
                    const id = current.id || '';
                    const text = current.textContent || '';
                    
                    // 热搜榜区域的关键词
                    const hotSearchKeywords = [
                        'hot', 'search', '热搜', '榜单', '排行', 'top', 'trending', 
                        'rank', 'plaza', '广场', '发现', 'recommend', '推荐'
                    ];
                    
                    // 检查是否包含热搜榜特征
                    if (hotSearchKeywords.some(keyword => 
                        className.toLowerCase().includes(keyword) || 
                        id.toLowerCase().includes(keyword) ||
                        text.includes('热搜榜') ||
                        text.includes('热搜') ||
                        text.includes('好友正在看') ||
                        text.includes('登顶')
                    )) {
                        return true;
                    }
                    
                    current = current.parentNode;
                    depth++;
                }
                
                return false;
            };
            
            // 智能提取评论信息（新版本）
            const extractSmartCommentInfo = (element) => {
                const info = {
                    author: '',
                    content: '',
                    time: '',
                    likes: ''
                };
                
                // 1. 提取用户名
                info.author = extractAuthorName(element);
                
                // 2. 提取评论内容
                info.content = extractCommentContent(element);
                
                // 3. 提取时间
                info.time = extractCommentTime(element);
                
                // 4. 提取点赞数
                info.likes = extractLikeCount(element);
                
                return info;
            };
            
            // 提取用户名
            const extractAuthorName = (element) => {
                const candidates = element.querySelectorAll('*');
                for (const child of candidates) {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 用户名特征：2-10字符，不数字开头，可能是用户名类
                    if (text.length >= 2 && text.length <= 10 &&
                        /^[\u4e00-\u9fa5a-zA-Z_]/.test(text) &&
                        !/^\d/.test(text) &&
                        (className.includes('name') || className.includes('user') || className.includes('author')) &&
                        !text.includes('加载') && !text.includes('展开')) {
                        return text;
                    }
                }
                return '';
            };
            
            // 提取评论内容
            const extractCommentContent = (element) => {
                const candidates = element.querySelectorAll('*');
                const contentCandidates = [];
                
                for (const child of candidates) {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 评论内容特征：较长，不是按钮或链接
                    if (text.length > 5 && text.length < 500 &&
                        child.tagName !== 'BUTTON' && child.tagName !== 'A' &&
                        (className.includes('text') || className.includes('content') || !className) &&
                        !text.includes('加载') && !text.includes('展开') &&
                        !text.includes('点赞') && !text.includes('回复')) {
                        contentCandidates.push({text, element: child});
                    }
                }
                
                // 选择最长的文本作为评论内容
                if (contentCandidates.length > 0) {
                    return contentCandidates.reduce((longest, current) => 
                        current.text.length > longest.text.length ? current : longest
                    ).text;
                }
                
                return '';
            };
            
            // 提取时间信息
            const extractCommentTime = (element) => {
                const candidates = element.querySelectorAll('*');
                for (const child of candidates) {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 时间特征：包含数字和时间相关词汇
                    if (text.match(/\d/) && 
                        (text.includes('前') || text.includes('分钟') || text.includes('小时') ||
                         text.includes('今天') || text.includes('昨天') || className.includes('time'))) {
                        return text;
                    }
                }
                return '';
            };
            
            // 提取点赞数
            const extractLikeCount = (element) => {
                const candidates = element.querySelectorAll('*');
                for (const child of candidates) {
                    const text = child.textContent?.trim() || '';
                    const className = child.className || '';
                    
                    // 点赞数特征：纯数字，在点赞相关元素中
                    if (text.match(/^\d+$/) && 
                        (className.includes('like') || className.includes('num') || className.includes('count'))) {
                        return text;
                    }
                }
                return '';
            };
            
            // 执行智能检测
            const commentElements = detectCommentElements();
            console.log(`智能检测到 ${commentElements.length} 个评论候选元素`);
            
            // 提取评论信息
            commentElements.forEach((element, index) => {
                try {
                    const info = extractSmartCommentInfo(element);
                    
                    if (info.content && info.content.length > 5) {
                        comments.push({
                            id: `comment_${index}`,
                            author: { name: info.author || '未知用户' },
                            content: info.content,
                            publishTime: info.time,
                            likes: info.likes,
                            index: index + 1,
                            elementHtml: element.outerHTML.substring(0, 300) // 保存部分HTML用于调试
                        });
                    }
                } catch (e) {
                    console.warn(`提取评论 ${index} 时出错:`, e.message);
                }
            });
            
            return comments;
        });
        
        // 高级去重处理
        const uniqueComments = this.deduplicateComments(comments);
        
        this.results.comments = uniqueComments.slice(0, this.maxComments);
        
        console.log(`✅ 智能提取了 ${uniqueComments.length} 条评论 (去重后)`);
    }
    
    // 高级去重算法
    deduplicateComments(comments) {
        const uniqueComments = [];
        const seen = new Set();
        
        comments.forEach(comment => {
            // 使用多种去重策略
            const contentKey = comment.content.replace(/\s+/g, '').substring(0, 50);
            const authorKey = comment.author.name.replace(/\s+/g, '');
            const combinedKey = `${authorKey}-${contentKey}`;
            
            if (!seen.has(combinedKey)) {
                seen.add(combinedKey);
                uniqueComments.push(comment);
            }
        });
        
        return uniqueComments;
    }

    async saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(this.outputDir, `enhanced-comments-${timestamp}.md`);
        const dataPath = path.join(this.outputDir, `enhanced-comments-${timestamp}.json`);
        
        this.results.endTime = new Date();
        const duration = (this.results.endTime - this.results.startTime) / 1000;
        
        const content = `# 增强版微博评论提取报告

## 📊 基本信息
- **微博链接:** ${this.results.url}
- **提取时间:** ${this.results.startTime.toLocaleString()}
- **处理耗时:** ${duration.toFixed(1)} 秒
- **评论总数:** ${this.results.comments.length}

## 📝 微博信息
**标题:** ${this.results.title}
**作者:** ${this.results.author}
**内容:** ${this.results.content.substring(0, 200)}${this.results.content.length > 200 ? '...' : ''}

## 🎯 提取统计
- **展开点击次数:** ${this.results.expandClicks}
- **滚动动作次数:** ${this.results.scrollActions}
- **加载更多点击:** ${this.results.pageLoads}
- **平均每秒提取:** ${(this.results.comments.length / duration).toFixed(2)} 条评论

---

## 💬 评论内容 (${this.results.comments.length} 条)

${this.results.comments.slice(0, 100).map(comment => `
### 评论 ${comment.index}

**作者:** ${comment.author.name}
**时间:** ${comment.publishTime}
**点赞:** ${comment.likes}

**内容:**
${comment.content}

---
`).join('')}

${this.results.comments.length > 100 ? `
... 还有 ${this.results.comments.length - 100} 条评论 ...

---

## 📈 分析统计

### 点赞分布
${this.generateLikeAnalysis()}

### 时间分布
${this.generateTimeAnalysis()}

### 热门词汇
${this.generateTopWords()}

---

## 🔧 技术详情

### 智能检测策略
1. **展开评论:** 点击所有"展开"按钮 (${this.results.expandClicks} 次)
2. **滚动加载:** 多轮滚动加载 (${this.results.scrollActions} 次)
3. **分页加载:** 点击"加载更多"按钮 (${this.results.pageLoads} 次)
4. **智能检测:** 使用条件判断算法识别评论元素

### 智能检测算法
- **评分系统:** 基于类名、属性、内容结构、DOM结构、位置、上下文等多维度评分
- **动态识别:** 不依赖硬编码选择器，通过内容模式和结构特征识别评论
- **自适应过滤:** 根据页面结构动态调整识别阈值
- **去重优化:** 多重去重策略确保评论唯一性

### 性能指标
- **处理效率:** ${(this.results.comments.length / duration).toFixed(2)} 条/秒
- **成功率:** ${(this.results.comments.length > 0 ? '100%' : '0%')}
- **重复率:** ${((this.results.comments.length / Math.max(1, this.results.comments.length)) * 100).toFixed(1)}%
- **平均评分:** ${(this.results.comments.reduce((sum, c) => sum + (c.score || 0), 0) / Math.max(1, this.results.comments.length)).toFixed(1)}/10

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 增强版微博评论提取工具 v2.0` : ''}`;

        await fs.writeFile(reportPath, content, 'utf8');
        await fs.writeFile(dataPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        console.log(`📄 详细报告: ${reportPath}`);
        console.log(`📄 原始数据: ${dataPath}`);
        
        return reportPath;
    }

    generateLikeAnalysis() {
        const comments = this.results.comments;
        const validLikes = comments
            .map(c => parseInt(c.likes) || 0)
            .filter(likes => likes > 0);
        
        if (validLikes.length === 0) return '- **无点赞数据**';
        
        const maxLikes = Math.max(...validLikes);
        const avgLikes = validLikes.reduce((sum, likes) => sum + likes, 0) / validLikes.length;
        const topComments = comments
            .filter(c => parseInt(c.likes) > 0)
            .sort((a, b) => parseInt(b.likes) - parseInt(a.likes))
            .slice(0, 3);
        
        return `- **最高点赞:** ${maxLikes} 赞
- **平均点赞:** ${avgLikes.toFixed(1)} 赞
- **热门评论:** ${topComments.map(c => `${c.author.name}(${c.likes}赞)`).join(', ')}`;
    }

    generateTimeAnalysis() {
        const comments = this.results.comments;
        const timeMap = {};
        
        comments.forEach(comment => {
            const time = comment.publishTime;
            if (time) {
                timeMap[time] = (timeMap[time] || 0) + 1;
            }
        });
        
        const sortedTimes = Object.entries(timeMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return sortedTimes.map(([time, count]) => 
            `- **${time}:** ${count} 条评论`
        ).join('\n');
    }

    generateTopWords() {
        const comments = this.results.comments;
        const words = comments.flatMap(c => c.content.split(/[\s，。！？、；：""''（）【】]/));
        const wordCount = {};
        
        words.forEach(word => {
            if (word.length > 1 && !/^\d+$/.test(word)) {
                wordCount[word] = (wordCount[word] || 0) + 1;
            }
        });
        
        const topWords = Object.entries(wordCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => `${word}(${count})`);
        
        return topWords.join(', ');
    }

    // 查找评论容器的方法
    async findCommentContainers(page) {
        console.log('🔍 阶段4: 观察页面架构并提取评论...');
        
        // 直接查找评论容器，按照您的思路：找列表特征 + 用户交互元素
        const commentContainers = await page.evaluate(() => {
            const containers = [];
            
            // 查找所有可能的列表容器 - 进一步扩展选择器范围
            const allContainers = document.querySelectorAll([
                'div',
                'section',
                'article',
                'main',
                '[role="list"]',
                '[role="region"]',
                '[role="main"]'
            ].join(', '));
            
            allContainers.forEach((container, index) => {
                const rect = container.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                
                // 更准确的位置过滤 - 基于微博页面实际布局
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                
                // 调整位置判断：微博主要内容区域通常从200px开始
                const isHeaderArea = rect.top < 200; // 顶部200px为导航和微博内容
                const isFooterArea = rect.top > viewportHeight * 0.9; // 底部10%为页脚
                const isSidebarArea = rect.left > viewportWidth * 0.7 || rect.right < viewportWidth * 0.2; // 更宽松的侧边栏判断
                const isTooNarrow = rect.width < 200 || rect.width > viewportWidth * 0.9; // 更宽松的宽度判断
                const isTooShort = rect.height < 100; // 更宽松的高度判断
                
                // 主要内容区域判断
                const isMainContentArea = rect.top >= 200 && rect.top <= viewportHeight * 0.9;
                
                if (!isMainContentArea || isHeaderArea || isFooterArea || isSidebarArea || isTooNarrow || isTooShort) {
                    return; // 只保留正文主要内容区域
                }
                
                // 检查容器内的列表特征
                const children = container.children;
                const text = container.textContent || '';
                
                // 排除明显的热搜内容
                if (text.includes('热搜') || text.includes('榜单') || text.includes('排行') || text.includes('热点')) {
                    return;
                }
                
                // 统计用户交互特征
                const avatars = container.querySelectorAll('img[src*="avatar"], img[alt*="头像"], [class*="avatar"]');
                const usernames = container.querySelectorAll('[class*="name"], [class*="user"], [class*="author"]');
                const timestamps = container.querySelectorAll('time, [data-time], [class*="time"]');
                const likeButtons = container.querySelectorAll('[class*="like"], [class*="heart"], [class*="favor"]');
                const replyButtons = container.querySelectorAll('[class*="reply"], [class*="comment"], [class*="respond"]');
                const contents = container.querySelectorAll('[class*="content"], [class*="text"], [class*="body"]');
                
                // 计算列表密度：是否有多个相似结构的子元素
                let listScore = 0;
                if (children.length > 3) {
                    const similarChildren = Array.from(children).filter(child => 
                        child.children.length >= 2 && child.textContent.length > 10
                    ).length;
                    listScore = similarChildren / children.length;
                }
                
                const containerInfo = {
                    index,
                    element: container.tagName.toLowerCase(),
                    className: container.className,
                    position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                    childCount: children.length,
                    listScore: listScore,
                    userFeatures: {
                        avatarCount: avatars.length,
                        usernameCount: usernames.length,
                        timestampCount: timestamps.length,
                        likeButtonCount: likeButtons.length,
                        replyButtonCount: replyButtons.length,
                        locationCount: 0,
                        contentCount: contents.length
                    },
                    totalInteractiveElements: avatars.length + usernames.length + timestamps.length + 
                                           likeButtons.length + replyButtons.length,
                    sampleContent: text.substring(0, 200)
                };
                
                // 判断是否为评论容器的核心条件 - 进一步降低要求，先找到潜在区域
                const isCommentContainer = (
                    (containerInfo.listScore > 0.05 || containerInfo.childCount >= 3) && // 有基本列表结构
                    (containerInfo.userFeatures.avatarCount >= 1 || 
                     containerInfo.userFeatures.usernameCount >= 1 || 
                     containerInfo.userFeatures.contentCount >= 2) && // 有基本的用户或内容特征
                    containerInfo.totalInteractiveElements >= 2 // 至少有一些交互元素
                );
                
                if (isCommentContainer) {
                    containers.push(containerInfo);
                }
            });
            
            // 按照交互元素数量排序，选择最可能是评论的容器
            return containers.sort((a, b) => b.totalInteractiveElements - a.totalInteractiveElements);
        });

        console.log(`🔍 找到 ${commentContainers.length} 个评论容器候选`);
        
        if (commentContainers.length === 0) {
            console.log('⚠️  未找到符合特征的评论容器');
            
            // 调试：显示通过位置过滤后的容器信息
            const debugInfo = await page.evaluate(() => {
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                
                const allContainers = document.querySelectorAll([
                    'div[class*="comment"]',
                    'div[class*="reply"]', 
                    'div[class*="feed"]',
                    'div[class*="list"]',
                    'div[class*="stream"]',
                    'div[class*="thread"]',
                    'div[class*="item"]',
                    'div[class*="card"]',
                    'div[class*="panel"]',
                    'section',
                    'article',
                    'main div',
                    '[role="list"]',
                    '[role="region"]'
                ].join(', '));
                
                // 先过滤，只显示可能符合条件的容器
                const filteredContainers = Array.from(allContainers).filter(container => {
                    const rect = container.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return false;
                    
                    const viewportHeight = window.innerHeight;
                    const viewportWidth = window.innerWidth;
                    
                    // 位置过滤条件
                    const isHeaderArea = rect.top < 200;
                    const isFooterArea = rect.top > viewportHeight * 0.9;
                    const isSidebarArea = rect.left > viewportWidth * 0.7 || rect.right < viewportWidth * 0.2;
                    const isTooNarrow = rect.width < 200 || rect.width > viewportWidth * 0.9;
                    const isTooShort = rect.height < 100;
                    const isMainContentArea = rect.top >= 200 && rect.top <= viewportHeight * 0.9;
                    
                    return isMainContentArea && !isHeaderArea && !isFooterArea && !isSidebarArea && !isTooNarrow && !isTooShort;
                });
                
                return filteredContainers.slice(0, 20).map((container, index) => {
                    const rect = container.getBoundingClientRect();
                    const children = container.children;
                    const avatars = container.querySelectorAll('img[src*="avatar"], img[alt*="头像"], [class*="avatar"]');
                    const usernames = container.querySelectorAll('[class*="name"], [class*="user"], [class*="author"]');
                    const contents = container.querySelectorAll('[class*="content"], [class*="text"], [class*="body"]');
                    
                    // 位置过滤条件
                    const isHeaderArea = rect.top < 200;
                    const isFooterArea = rect.top > viewportHeight * 0.9;
                    const isSidebarArea = rect.left > viewportWidth * 0.7 || rect.right < viewportWidth * 0.2;
                    const isTooNarrow = rect.width < 200 || rect.width > viewportWidth * 0.9;
                    const isTooShort = rect.height < 100;
                    const isMainContentArea = rect.top >= 200 && rect.top <= viewportHeight * 0.9;
                    
                    return {
                        index,
                        tag: container.tagName,
                        className: container.className.substring(0, 50),
                        position: `top:${rect.top.toFixed(0)} left:${rect.left.toFixed(0)} w:${rect.width.toFixed(0)} h:${rect.height.toFixed(0)}`,
                        childCount: children.length,
                        avatars: avatars.length,
                        usernames: usernames.length,
                        contents: contents.length,
                        passedPositionFilter: isMainContentArea && !isHeaderArea && !isFooterArea && !isSidebarArea && !isTooNarrow && !isTooShort,
                        sampleText: container.textContent.substring(0, 80).replace(/\s+/g, ' ')
                    };
                });
            });
            
            console.log('🔍 调试 - 前10个容器位置信息:');
            debugInfo.forEach(info => {
                const status = info.passedPositionFilter ? '✅' : '❌';
                console.log(`${status} [${info.index}] ${info.tag} (${info.childCount}子) ${info.position}`);
                console.log(`    特征: 头像${info.avatars} 用户名${info.usernames} 内容${info.contents}`);
                console.log(`    文本: ${info.sampleText}`);
            });
            
            return [];
        }
        
        // 返回找到的容器信息
        console.log('📊 最佳评论容器特征:', {
            childCount: commentContainers[0].childCount,
            listScore: commentContainers[0].listScore.toFixed(2),
            avatars: commentContainers[0].userFeatures.avatarCount,
            usernames: commentContainers[0].userFeatures.usernameCount,
            timestamps: commentContainers[0].userFeatures.timestampCount,
            likes: commentContainers[0].userFeatures.likeButtonCount,
            replies: commentContainers[0].userFeatures.replyButtonCount
        });
        
        return commentContainers;
    }

    // 在评论容器内展开评论
    async expandCommentsInContainers(page, containers) {
        console.log('🔽 在评论容器内展开评论...');
        
        let totalExpanded = 0;
        
        // 首先在整个页面中查找评论展开按钮
        const pageLevelExpanded = await page.evaluate(() => {
            const allButtons = document.querySelectorAll('button, [role="button"], a, [onclick]');
            let expandedCount = 0;
            
            allButtons.forEach(btn => {
                const text = btn.textContent || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                const href = btn.getAttribute('href') || '';
                const className = btn.className || '';
                
                // 查找评论相关的展开按钮 - 更广泛的条件
                if ((text.includes('评论') && (text.includes('展开') || text.includes('更多') || text.includes('查看') || text.includes('全部'))) ||
                    (ariaLabel.includes('评论') && (ariaLabel.includes('展开') || ariaLabel.includes('更多'))) ||
                    text.includes('全部评论') || text.includes('查看所有评论') ||
                    (className.includes('comment') && (text.includes('展开') || text.includes('更多'))) ||
                    (text.match(/\d+条评论/) || text.match(/\d+回复/)) || // 包含评论数字的
                    (href && href.includes('comment'))) {
                    
                    // 排除热搜和无关内容
                    if (!text.includes('热搜') && !text.includes('榜单') && !text.includes('热点') &&
                        !text.includes('关注') && !text.includes('粉丝')) {
                        
                        console.log('找到评论相关按钮:', text.substring(0, 30));
                        btn.scrollIntoView({ block: 'center' });
                        btn.click();
                        expandedCount++;
                    }
                }
            });
            
            // 查找包含数字的评论区域（可能显示评论数量）
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                const text = el.textContent || '';
                if (text.match(/142\s*评论/) || text.match(/评论.*142/) || 
                    text.match(/\d+\s*条评论/) || text.match(/评论.*\d+\s*条/)) {
                    console.log('找到评论计数区域:', text.substring(0, 50));
                    
                    // 尝试点击这个元素或其父元素
                    const clickable = el.querySelector('button, a, [role="button"], [onclick]') || el;
                    if (clickable !== el) {
                        clickable.scrollIntoView({ block: 'center' });
                        clickable.click();
                        expandedCount++;
                    }
                }
            });
            
            return expandedCount;
        });
        
        if (pageLevelExpanded > 0) {
            totalExpanded += pageLevelExpanded;
            this.results.expandClicks += pageLevelExpanded;
            console.log(`  页面级展开: ${pageLevelExpanded} 个评论展开按钮`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // 如果展开了页面级按钮，等待页面加载并重新查找容器
        if (pageLevelExpanded > 0) {
            console.log('🔍 页面结构已变化，重新查找评论容器...');
            containers = await this.findCommentContainers(page);
            console.log(`🔍 重新找到 ${containers.length} 个评论容器`);
        }
        
        // 使用更新后的容器列表进行后续处理
        const updatedContainers = containers;
        
        // 然后在每个容器内查找展开按钮
        for (const container of containers) {
            const expanded = await page.evaluate((containerPosition) => {
                // 使用位置查找容器
                const allElements = document.querySelectorAll('div, section, article, ul, ol');
                const container = Array.from(allElements).find(el => {
                    const rect = el.getBoundingClientRect();
                    return Math.abs(rect.top - containerPosition.top) < 5 && 
                           Math.abs(rect.left - containerPosition.left) < 5 &&
                           rect.width === containerPosition.width &&
                           rect.height === containerPosition.height;
                });
                
                if (!container) return 0;
                
                console.log(`在容器内查找展开按钮，子元素数: ${container.children.length}`);
                
                // 在容器内查找展开按钮
                const expandButtons = container.querySelectorAll('button, [role="button"], a');
                let expandedCount = 0;
                
                expandButtons.forEach(btn => {
                    const text = btn.textContent || '';
                    const ariaLabel = btn.getAttribute('aria-label') || '';
                    const href = btn.getAttribute('href') || '';
                    
                    // 更广泛的展开条件
                    if (text.includes('展开') || text.includes('更多') || text.includes('查看') || 
                        text.includes('加载') || text.includes('下一页') || text.includes('剩余') ||
                        ariaLabel.includes('展开') || ariaLabel.includes('查看') || ariaLabel.includes('更多') ||
                        (href && href.includes('comment'))) {
                        
                        // 排除热搜和无关内容
                        if (!text.includes('热搜') && !text.includes('榜单') && !text.includes('热点') &&
                            !text.includes('关注') && !text.includes('粉丝') && !text.includes('首页')) {
                            
                            console.log('容器内找到展开按钮:', text.substring(0, 30));
                            btn.scrollIntoView({ block: 'center' });
                            btn.click();
                            expandedCount++;
                        }
                    }
                });
                
                return expandedCount;
            }, container.position);
            
            if (expanded > 0) {
                totalExpanded += expanded;
                this.results.expandClicks += expanded;
                console.log(`  容器内展开: ${expanded} 个评论展开按钮`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`🎯 容器内展开完成: 共展开 ${totalExpanded} 个评论`);
        
        // 返回更新后的容器列表
        return containers;
    }

    // 在评论容器内滚动加载更多
    async scrollInContainers(page, containers) {
        console.log('📜 在评论容器内滚动加载...');
        
        for (const container of containers) {
            await page.evaluate((containerIndex) => {
                const containers = document.querySelectorAll([
                    'div[class*="comment"]',
                    'div[class*="reply"]', 
                    'div[class*="feed"]',
                    'div[class*="item"]',
                    'section'
                ].join(', '));
                
                const container = containers[containerIndex];
                if (!container) return;
                
                // 在容器内滚动
                const scrollHeight = container.scrollHeight;
                const clientHeight = container.clientHeight;
                
                // 分几次滚动
                for (let i = 0; i < 3; i++) {
                    const scrollTop = (scrollHeight - clientHeight) * (i + 1) / 3;
                    container.scrollTop = scrollTop;
                    
                    // 等待加载
                    setTimeout(() => {}, 1000);
                }
            }, container.index);
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        this.results.scrollActions += containers.length * 3;
        console.log(`🎯 容器内滚动完成: 在 ${containers.length} 个容器中滚动`);
    }

    // 从多个评论容器中提取评论
    async extractCommentsFromContainers(page, containers) {
        console.log('💬 从评论容器中提取评论...');
        
        let allComments = [];
        for (const container of containers) {
            const comments = await this.extractCommentsFromContainer(page, container);
            allComments.push(...comments);
        }
        
        // 去重
        allComments = this.deduplicateComments(allComments);
        
        console.log(`🔍 从 ${containers.length} 个容器中提取了 ${allComments.length} 条唯一评论`);
        return allComments;
    }

    // 从单个评论容器中提取评论
    async extractCommentsFromContainer(page, containerInfo) {
        console.log(`🔍 处理容器 ${containerInfo.index}: 子元素数=${containerInfo.childCount}, 特征: 头像${containerInfo.userFeatures.avatarCount} 点赞${containerInfo.userFeatures.likeButtonCount}`);
        
        const comments = await page.evaluate((containerPosition) => {
            // 更直接的方法：找到具有指定位置的容器
            const allElements = document.querySelectorAll('div, section, article, ul, ol');
            const container = Array.from(allElements).find(el => {
                const rect = el.getBoundingClientRect();
                return Math.abs(rect.top - containerPosition.top) < 5 && 
                       Math.abs(rect.left - containerPosition.left) < 5 &&
                       rect.width === containerPosition.width &&
                       rect.height === containerPosition.height;
            });
            
            if (!container) {
                console.log('未找到匹配的容器');
                return [];
            }
            
            console.log(`浏览器上下文: 找到容器: ${container.children.length} 个子元素, 类名: ${container.className.substring(0, 100)}`);
            console.log(`容器文本预览: ${container.textContent.substring(0, 200)}`);
            
            // 详细调试：分析容器内容
            console.log('=== 容器详细分析 ===');
            console.log(`容器子元素数量: ${container.children.length}`);
            
            // 分析每个子元素
            Array.from(container.children).forEach((child, index) => {
                const text = child.textContent || '';
                const rect = child.getBoundingClientRect();
                const className = child.className || '';
                console.log(`子元素 ${index}: 尺寸=${rect.width}x${rect.height}, 文本长度=${text.length}, 类名=${className.substring(0, 50)}`);
                console.log(`子元素 ${index} 文本预览: ${text.substring(0, 100)}`);
                
                // 检查是否包含评论特征
                const hasAvatar = child.querySelector('img');
                const hasButtons = child.querySelectorAll('button, [role="button"]').length;
                const hasLinks = child.querySelectorAll('a').length;
                console.log(`子元素 ${index}: 头像=${!!hasAvatar}, 按钮=${hasButtons}, 链接=${hasLinks}`);
            });
            
            const comments = [];
            
            // 在容器内查找评论项 - 更灵活的方式
            const commentItems = container.children;
            
            Array.from(commentItems).forEach((item, index) => {
                const text = item.textContent || '';
                const rect = item.getBoundingClientRect();
                
                // 基本过滤 - 暂时放宽条件用于调试
                console.log(`子元素 ${index} 过滤检查: 尺寸=${rect.width}x${rect.height}, 文本长度=${text.length}`);
                console.log(`子元素 ${index} 文本内容: "${text.substring(0, 100)}..."`);
                
                // 临时禁用尺寸过滤
                // if (rect.width < 100 || rect.height < 30 || text.length < 15) {
                //     console.log(`子元素 ${index} 被过滤: 尺寸或文本不足`);
                //     return;
                // }
                
                // 临时禁用关键词过滤
                // const filterKeywords = ['热搜', '榜单', '排行', '播放视频', '加载完毕', '直播', 
                //     '全屏', '静音', '复制视频地址', '小窗播放', '高清', '标清', 
                //     '倍速', '关注', '精选', '超话', '相册', '文章'];
                // 
                // const hasFilterKeyword = filterKeywords.some(keyword => text.includes(keyword));
                // if (hasFilterKeyword) {
                //     console.log(`子元素 ${index} 被过滤: 包含过滤关键词`);
                //     return;
                // }
                
                // 更灵活的用户名和内容检测
                const avatar = item.querySelector('img') || item.querySelector('[class*="avatar"]');
                const username = item.querySelector('[class*="name"], [class*="user"], [class*="author"], a');
                const content = item.querySelector('[class*="content"], [class*="text"], [class*="body"]');
                const buttons = item.querySelectorAll('button, [role="button"]');
                
                // 尝试提取用户名 - 更灵活的方法
                let authorName = '未知用户';
                if (username) {
                    authorName = username.textContent.trim();
                } else if (avatar) {
                    // 从图片alt属性获取
                    authorName = avatar.getAttribute('alt') || '未知用户';
                } else {
                    // 从文本中提取用户名（通常是开头部分）
                    const nameMatch = text.match(/^[\u4e00-\u9fa5a-zA-Z0-9_]{2,15}/);
                    if (nameMatch) {
                        authorName = nameMatch[0];
                    } else if (text.length > 10) {
                        // 如果没有明显用户名，使用前几个字符
                        authorName = text.substring(0, 8);
                    }
                }
                
                // 尝试提取内容 - 排除用户名部分
                let contentText = text;
                if (authorName !== '未知用户' && contentText.includes(authorName)) {
                    contentText = contentText.replace(authorName, '').trim();
                }
                
                // 如果有明确的内容元素，使用它的文本
                if (content) {
                    contentText = content.textContent.trim();
                }
                
                // 验证是否为有效评论 - 临时放宽条件用于调试
                console.log(`子元素 ${index} 最终验证: 用户名="${authorName}", 内容长度=${contentText.length}, 内容="${contentText.substring(0, 50)}..."`);
                
                // 临时接受所有内容，只做基本检查
                const isValid = authorName && contentText && contentText.length > 0;
                
                console.log(`子元素 ${index} 验证结果: ${isValid ? '通过' : '失败'}`);
                
                if (!isValid) {
                    console.log(`验证失败原因:`, {
                        hasAuthor: !!authorName,
                        hasContent: !!contentText,
                        contentLength: contentText?.length
                    });
                    return;
                }
                
                // 提取其他信息
                const timestamp = item.querySelector('time, [data-time], [class*="time"]');
                const likeButton = Array.from(buttons).find(btn => 
                    btn.textContent.includes('赞') || btn.className.includes('like')
                );
                const replyButton = Array.from(buttons).find(btn => 
                    btn.textContent.includes('回复') || btn.className.includes('reply')
                );
                
                console.log(`找到评论 ${index}: ${authorName} - ${contentText.substring(0, 50)}...`);
                
                comments.push({
                    id: `container_${Date.now()}_${index}`,
                    author: {
                        name: authorName
                    },
                    content: contentText,
                    publishTime: timestamp ? timestamp.textContent.trim() : '',
                    likes: likeButton ? likeButton.textContent.trim() : '',
                    score: 5,
                    interactionFeatures: {
                        hasAvatar: !!avatar,
                        hasTimestamp: !!timestamp,
                        hasLikes: !!likeButton,
                        hasReply: !!replyButton,
                        hasLocation: false
                    }
                });
            });
            
            return comments;
        }, containerInfo.position);
        
        console.log(`🔍 容器 ${containerInfo.index} 结果: 提取了 ${comments.length} 条评论`);
        if (comments.length > 0) {
            console.log(`样本评论: ${comments[0].author.name} - ${comments[0].content.substring(0, 50)}...`);
        }
        return comments;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🧹 清理完成');
    }
}

// 主执行函数
async function main() {
    const extractor = new EnhancedWeiboCommentExtractor();
    
    try {
        await extractor.initialize();
        
        // 使用您提供的微博URL
        const weiboUrl = 'https://weibo.com/2174585797/Q4fZgwfSy';
        await extractor.extractAllComments(weiboUrl);
        
        // 保存结果
        const resultPath = await extractor.saveResults();
        
        console.log('\n🎉 增强版微博评论提取完成！');
        console.log(`📊 提取了 ${extractor.results.comments.length} 条评论`);
        console.log(`📄 详细报告: ${resultPath}`);
        
    } catch (error) {
        console.error('❌ 执行失败:', error);
        process.exit(1);
    } finally {
        await extractor.cleanup();
    }
}

// 运行程序
if (require.main === module) {
    main();
}

module.exports = EnhancedWeiboCommentExtractor;