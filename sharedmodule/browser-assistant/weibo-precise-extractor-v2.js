#!/usr/bin/env node

const { PreciseWebOperator } = require('./precise-element-operator');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 基于精确元素操作的微博评论提取器
 */
class WeiboCommentExtractorV2 {
    constructor() {
        this.operator = null;
        this.results = {
            postInfo: {},
            comments: [],
            extractionStats: {
                scrollCount: 0,
                maxScrolls: 20,
                foundPageEnd: false,
                totalComments: 0
            }
        };
    }

    /**
     * 初始化精确元素操作库
     */
    initElementLibrary() {
        // 主帖子容器
        const postContainer = this.operator.createElement({
            name: 'postContainer',
            description: '主帖子容器',
            selectors: [
                'article[class*="Feed_wrap_3v9LH"][class*="Detail_feed_3iffy"]',
                '.woo-panel-main.Detail_feed_3iffy'
            ],
            operations: {
                getPostInfo: {
                    description: '获取帖子基本信息',
                    action: async ({ element }) => {
                        const title = await element.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                        const author = await element.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                        const time = await element.$eval('.head-info_time_6sFQg', el => el.textContent).catch(() => '');
                        
                        return { title, author, time };
                    }
                }
            }
        });

        // 评论区主容器
        const commentSection = this.operator.createElement({
            name: 'commentSection',
            description: '评论区主容器',
            selectors: [
                '.Detail_box_3Jeom',
                '.woo-panel-main.Card_wrap_2ibWe.Detail_detail_3typT'
            ],
            operations: {
                scrollToView: {
                    description: '滚动到评论区',
                    action: async ({ element }) => {
                        await element.scrollIntoView({ behavior: 'smooth' });
                        await this.operator.page.waitForTimeout(2000);
                    }
                },
                checkIfLoaded: {
                    description: '检查评论区是否加载',
                    action: async ({ element }) => {
                        const hasComments = await element.$('.wbpro-list').then(el => !!el);
                        return hasComments;
                    }
                }
            }
        });

        // 评论列表容器
        const commentList = this.operator.createElement({
            name: 'commentList',
            description: '评论列表容器',
            selectors: [
                '.RepostCommentList_mar1_3VHkS',
                '.Scroll_container_280Ky',
                '.vue-recycle-scroller'
            ],
            operations: {
                getAllComments: {
                    description: '获取所有评论',
                    action: async ({ element, finder }) => {
                        const comments = [];
                        const commentItems = await element.$$('.wbpro-scroller-item');
                        
                        for (const item of commentItems) {
                            const comment = await this.extractCommentFromItem(item, finder);
                            if (comment) {
                                comments.push(comment);
                            }
                        }
                        
                        return comments;
                    }
                },
                scrollToLoadMore: {
                    description: '滚动加载更多评论',
                    action: async ({ element }) => {
                        const currentHeight = await element.evaluate(el => el.scrollHeight);
                        await element.evaluate(el => el.scrollTo(0, el.scrollHeight));
                        await this.operator.page.waitForTimeout(3000);
                        
                        const newHeight = await element.evaluate(el => el.scrollHeight);
                        return newHeight > currentHeight;
                    }
                },
                checkIfBottom: {
                    description: '检查是否到达底部',
                    action: async ({ element }) => {
                        const scrollTop = await element.evaluate(el => el.scrollTop);
                        const scrollHeight = await element.evaluate(el => el.scrollHeight);
                        const clientHeight = await element.evaluate(el => el.clientHeight);
                        
                        return scrollTop + clientHeight >= scrollHeight - 100;
                    }
                }
            }
        });

        // 单个评论项
        const commentItem = this.operator.createElement({
            name: 'commentItem',
            description: '单个评论项',
            selectors: [
                '.wbpro-scroller-item',
                '.vue-recycle-scroller__item-view'
            ],
            operations: {
                extractComment: {
                    description: '提取评论内容',
                    action: async ({ element }) => {
                        return await this.extractCommentFromItem(element, this.operator.finder);
                    }
                }
            }
        });

        // 评论内容
        const commentContent = this.operator.createElement({
            name: 'commentContent',
            description: '评论内容',
            selectors: [
                '.item1in .con1 .text',
                '.text'
            ],
            operations: {
                getText: {
                    description: '获取评论文本',
                    action: async ({ element }) => {
                        return await element.textContent();
                    }
                },
                getUsername: {
                    description: '获取用户名',
                    action: async ({ element }) => {
                        const userLink = await element.$('.ALink_default_2ibt1 a');
                        if (userLink) {
                            return await userLink.textContent();
                        }
                        return '';
                    }
                },
                getUserLink: {
                    description: '获取用户链接',
                    action: async ({ element }) => {
                        const userLink = await element.$('.ALink_default_2ibt1 a');
                        if (userLink) {
                            return await userLink.getAttribute('href');
                        }
                        return '';
                    }
                }
            }
        });

        // 评论信息
        const commentInfo = this.operator.createElement({
            name: 'commentInfo',
            description: '评论信息（时间、点赞数）',
            selectors: [
                '.info',
                '.item1in .info'
            ],
            operations: {
                getTime: {
                    description: '获取评论时间',
                    action: async ({ element }) => {
                        return await element.textContent();
                    }
                },
                getLikes: {
                    description: '获取点赞数',
                    action: async ({ element }) => {
                        const text = await element.textContent();
                        const match = text.match(/\d+/);
                        return match ? match[0] : '0';
                    }
                }
            }
        });

        // 构建嵌套结构
        commentSection.addChild(commentList);
        commentList.addChild(commentItem);
        commentItem.addChild(commentContent);
        commentItem.addChild(commentInfo);

        // 注册结构
        this.operator.library.registerStructure('weiboCommentSection', commentSection);
    }

    /**
     * 从评论项中提取评论信息
     */
    async extractCommentFromItem(item, finder) {
        try {
            // 查找评论内容
            const contentElement = await finder.findElement(
                this.operator.library.getElement('commentContent'),
                item
            );
            
            if (!contentElement) return null;

            // 获取评论文本
            const text = await this.operator.operate('commentContent', 'getText', {}, item);
            if (!text || text.trim().length < 3) return null;

            // 获取用户名
            const username = await this.operator.operate('commentContent', 'getUsername', {}, item);
            
            // 获取用户链接
            const userLink = await this.operator.operate('commentContent', 'getUserLink', {}, item);
            
            // 获取时间信息
            let time = '';
            let likes = '0';
            
            try {
                const infoElement = await finder.findElement(
                    this.operator.library.getElement('commentInfo'),
                    item
                );
                if (infoElement) {
                    time = await this.operator.operate('commentInfo', 'getTime', {}, item);
                    likes = await this.operator.operate('commentInfo', 'getLikes', {}, item);
                }
            } catch (error) {
                // 某些评论可能没有信息区域
            }

            // 清理文本
            const cleanText = text.trim()
                .replace(/\s+/g, ' ')
                .replace(/展开|返回|更多|收起/g, '')
                .trim();

            if (cleanText.length < 3) return null;

            return {
                content: cleanText.substring(0, 300),
                author: username.trim() || '匿名用户',
                authorLink: userLink || '',
                time: time.trim(),
                likes: likes.trim(),
                extractedAt: new Date().toISOString()
            };

        } catch (error) {
            console.warn('提取评论时出错:', error.message);
            return null;
        }
    }

    /**
     * 智能滚动策略
     */
    async smartScroll() {
        const { scrollCount, maxScrolls } = this.results.extractionStats;
        
        if (scrollCount >= maxScrolls) {
            console.log('⏹️ 达到最大滚动次数');
            return false;
        }

        // 检查是否到达评论区底部
        const isAtBottom = await this.operator.operate('commentList', 'checkIfBottom');
        if (isAtBottom) {
            console.log('🎯 已到达评论区底部');
            this.results.extractionStats.foundPageEnd = true;
            return false;
        }

        // 执行滚动
        console.log(`📜 智能滚动 ${scrollCount + 1}/${maxScrolls}`);
        const hasNewContent = await this.operator.operate('commentList', 'scrollToLoadMore');
        
        if (hasNewContent) {
            this.results.extractionStats.scrollCount++;
            return true;
        } else {
            console.log('🎯 没有新内容加载');
            this.results.extractionStats.foundPageEnd = true;
            return false;
        }
    }

    /**
     * 主要提取流程
     */
    async extractComments(postUrl) {
        console.log('🎯 使用精确元素操作提取微博评论...\n');

        // 加载cookie
        const cookieFile = path.join(process.env.HOME || '~', '.webauto', 'cookies', 'weibo.com.json');
        let cookies = [];
        
        try {
            const cookieData = await fs.readFile(cookieFile, 'utf8');
            cookies = JSON.parse(cookieData);
            console.log(`✅ 加载了 ${cookies.length} 个Cookie`);
        } catch (error) {
            console.log('❌ 未找到Cookie文件');
            return null;
        }

        // 启动浏览器
        const browser = await chromium.launch({ 
            headless: false,
            viewport: { width: 1920, height: 1080 }
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        await context.addCookies(cookies);
        const page = await context.newPage();

        try {
            // 初始化操作器
            this.operator = new PreciseWebOperator(page);
            this.initElementLibrary();

            // 导航到帖子
            console.log('🌐 导航到目标帖子...');
            await page.goto(postUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            await page.waitForTimeout(3000);

            // 检查登录状态
            const currentUrl = page.url();
            if (currentUrl.includes('login') || currentUrl.includes('signin')) {
                console.log('❌ 需要登录，Cookie已失效');
                return null;
            }

            console.log('✅ 成功访问帖子');

            // 获取帖子信息
            console.log('📋 获取帖子信息...');
            const postInfo = await this.operator.operate('postContainer', 'getPostInfo');
            this.results.postInfo = {
                url: postUrl,
                ...postInfo,
                extractedAt: new Date().toISOString()
            };
            console.log('帖子信息:', this.results.postInfo);

            // 滚动到评论区
            console.log('📍 定位到评论区...');
            await this.operator.operate('commentSection', 'scrollToView');

            // 检查评论区是否加载
            const hasComments = await this.operator.operate('commentSection', 'checkIfLoaded');
            if (!hasComments) {
                console.log('❌ 评论区未加载或无评论');
                return this.results;
            }

            console.log('✅ 评论区已加载');

            // 主要提取循环
            console.log('🔄 开始精确提取循环...\n');
            let lastCommentCount = 0;
            let noNewCommentsCount = 0;
            const maxNoNewComments = 3;

            while (true) {
                // 获取当前所有评论
                const currentComments = await this.operator.operate('commentList', 'getAllComments');
                
                // 去重并添加新评论
                const newComments = [];
                for (const comment of currentComments) {
                    if (!this.results.comments.find(c => c.content === comment.content)) {
                        newComments.push(comment);
                    }
                }

                if (newComments.length > 0) {
                    this.results.comments.push(...newComments);
                    this.results.extractionStats.totalComments = this.results.comments.length;
                    console.log(`✅ 新增 ${newComments.length} 条评论，总计 ${this.results.comments.length} 条`);
                    noNewCommentsCount = 0;
                } else {
                    noNewCommentsCount++;
                    console.log(`⏳ 无新评论 (${noNewCommentsCount}/${maxNoNewComments})`);
                }

                // 执行智能滚动
                const shouldContinue = await this.smartScroll();
                
                // 检查停止条件
                if (!shouldContinue || noNewCommentsCount >= maxNoNewComments) {
                    break;
                }

                // 短暂延迟
                await page.waitForTimeout(1000);
            }

            console.log('\n🎉 评论提取完成！');
            console.log(`📊 总共提取 ${this.results.comments.length} 条评论`);
            console.log(`📈 滚动次数: ${this.results.extractionStats.scrollCount}`);
            console.log(`🎯 到达底部: ${this.results.extractionStats.foundPageEnd}`);

            // 保存结果
            const resultFile = path.join(process.env.HOME || '~', '.webauto', 'weibo-precise-comments-v2.json');
            await fs.mkdir(path.dirname(resultFile), { recursive: true });
            await fs.writeFile(resultFile, JSON.stringify({
                ...this.results,
                elementLibrary: this.operator.exportLibrary()
            }, null, 2));

            console.log(`💾 结果已保存到: ${resultFile}`);

            return this.results;

        } catch (error) {
            console.error('❌ 提取过程中出错:', error.message);
            return null;
        } finally {
            await browser.close();
            console.log('🧹 浏览器已关闭');
        }
    }
}

// 主函数
async function main() {
    const targetUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
    const extractor = new WeiboCommentExtractorV2();
    const result = await extractor.extractComments(targetUrl);
    
    if (result) {
        console.log('\n📋 提取结果预览:');
        console.log('=' * 60);
        result.comments.slice(0, 3).forEach((comment, index) => {
            console.log(`${index + 1}. ${comment.author}`);
            console.log(`   ${comment.content}`);
            console.log(`   👍 ${comment.likes} | 🕐 ${comment.time}`);
            console.log('');
        });
        
        if (result.comments.length > 3) {
            console.log(`... 还有 ${result.comments.length - 3} 条评论`);
        }
    }
}

main().catch(console.error);