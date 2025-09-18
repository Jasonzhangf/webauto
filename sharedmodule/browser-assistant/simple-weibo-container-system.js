#!/usr/bin/env node

const { PreciseWebOperator, ContainerElement, OperationDefinition } = require('./precise-element-operator');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 精简版微博容器化系统演示
 * 展示基于容器ID和内容列表的嵌套架构核心概念
 */
class SimpleWeiboContainerSystem {
    constructor(page) {
        this.operator = new PreciseWebOperator(page);
        this.results = {};
    }

    /**
     * 构建简化的微博容器架构
     */
    buildSimplifiedArchitecture() {
        // 页面总容器
        const pageContainer = this.operator.createContainer({
            id: 'weibo-page',
            name: '微博页面总容器',
            description: '微博页面的最外层容器',
            type: 'page-container',
            selectors: ['body', '.woo-layout-main'],
            operations: {
                getPageInfo: {
                    description: '获取页面基本信息',
                    action: async ({ page }) => {
                        return await page.evaluate(() => ({
                            title: document.title,
                            url: window.location.href,
                            pageType: this.getPageType(page.url())
                        }));
                    }
                }
            },
            contentList: [
                // 主内容容器
                {
                    id: 'main-content',
                    name: '主内容容器',
                    description: '页面主内容区域',
                    type: 'content-container',
                    selectors: ['.woo-layout-main', '.main-content'],
                    operations: {
                        getContentType: {
                            description: '获取内容类型',
                            action: async ({ page }) => {
                                return this.getPageType(page.url());
                            }
                        }
                    },
                    contentList: [
                        // 帖子容器
                        {
                            id: 'post-container',
                            name: '帖子容器',
                            description: '微博帖子内容容器',
                            type: 'post-container',
                            selectors: ['article[class*="Feed_wrap_3v9LH"]', '.woo-panel-main.Detail_feed_3iffy'],
                            operations: {
                                extractPostInfo: {
                                    description: '提取帖子信息',
                                    action: async ({ element }) => {
                                        const title = await element.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                                        const author = await element.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                                        const time = await element.$eval('.head-info_time_6sFQg', el => el.textContent).catch(() => '');
                                        return { title, author, time };
                                    }
                                }
                            },
                            contentList: [
                                // 媒体容器
                                {
                                    id: 'media-container',
                                    name: '媒体容器',
                                    description: '帖子媒体内容（图片、视频）',
                                    type: 'media-container',
                                    selectors: ['.woo-box-flex.woo-box-alignCenter.media_media-pic_2hjWt'],
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
                                        downloadImages: {
                                            description: '下载图片操作',
                                            action: async ({ element }) => {
                                                const images = await element.$$eval('img[src*="sina"]', imgs => 
                                                    imgs.map(img => img.src).filter(src => src && src.includes('jpg'))
                                                );
                                                return { operation: 'download', count: images.length, urls: images };
                                            }
                                        }
                                    }
                                },
                                // 文字容器
                                {
                                    id: 'text-container',
                                    name: '文字容器',
                                    description: '帖子文字内容',
                                    type: 'text-container',
                                    selectors: ['.detail_wbtext_4CRf9'],
                                    operations: {
                                        extractText: {
                                            description: '提取文字内容',
                                            action: async ({ element }) => {
                                                return await element.textContent();
                                            }
                                        }
                                    }
                                },
                                // 评论区容器
                                {
                                    id: 'comments-container',
                                    name: '评论区容器',
                                    description: '帖子评论区',
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
                                        extractComments: {
                                            description: '提取评论',
                                            action: async ({ element, page }) => {
                                                return await this.extractComments(element, page);
                                            }
                                        }
                                    },
                                    contentList: [
                                        // 评论列表容器
                                        {
                                            id: 'comment-list',
                                            name: '评论列表容器',
                                            description: '评论列表',
                                            type: 'comment-list-container',
                                            selectors: ['.RepostCommentList_mar1_3VHkS', '.Scroll_container_280Ky'],
                                            operations: {
                                                loadMore: {
                                                    description: '加载更多评论',
                                                    action: async ({ element }) => {
                                                        const currentHeight = await element.evaluate(el => el.scrollHeight);
                                                        await element.evaluate(el => el.scrollTo(0, el.scrollHeight));
                                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                                        const newHeight = await element.evaluate(el => el.scrollHeight);
                                                        return newHeight > currentHeight;
                                                    }
                                                },
                                                checkAtBottom: {
                                                    description: '检查是否到底',
                                                    action: async ({ element }) => {
                                                        const scrollTop = await element.evaluate(el => el.scrollTop);
                                                        const scrollHeight = await element.evaluate(el => el.scrollHeight);
                                                        const clientHeight = await element.evaluate(el => el.clientHeight);
                                                        return scrollTop + clientHeight >= scrollHeight - 100;
                                                    }
                                                }
                                            },
                                            contentList: [
                                                // 评论项容器
                                                {
                                                    id: 'comment-item',
                                                    name: '评论项容器',
                                                    description: '单个评论项',
                                                    type: 'comment-item-container',
                                                    selectors: ['.wbpro-scroller-item', '.vue-recycle-scroller__item-view'],
                                                    operations: {
                                                        expand: {
                                                            description: '展开评论',
                                                            action: async ({ element }) => {
                                                                const expandButton = await element.$('button[title*="展开"]');
                                                                if (expandButton) {
                                                                    await expandButton.click();
                                                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                                                    return true;
                                                                }
                                                                return false;
                                                            }
                                                        },
                                                        extractCommentData: {
                                                            description: '提取评论数据',
                                                            action: async ({ element }) => {
                                                                const content = await element.$eval('.item1in .con1 .text, .text', el => el.textContent).catch(() => '');
                                                                const username = await element.$eval('.ALink_default_2ibt1 a', el => el.textContent).catch(() => '');
                                                                const userLink = await element.$eval('.ALink_default_2ibt1 a', el => el.href).catch(() => '');
                                                                const info = await element.$eval('.info', el => el.textContent).catch(() => '');
                                                                
                                                                const cleanContent = content.trim()
                                                                    .replace(/\s+/g, ' ')
                                                                    .replace(/展开|返回|更多|收起/g, '')
                                                                    .trim();

                                                                if (cleanContent.length < 3) return null;

                                                                return {
                                                                    content: cleanContent.substring(0, 300),
                                                                    author: username.trim() || '匿名用户',
                                                                    authorLink: userLink || '',
                                                                    time: info.trim(),
                                                                    extractedAt: new Date().toISOString()
                                                                };
                                                            }
                                                        }
                                                    }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        return pageContainer;
    }

    /**
     * 判断页面类型
     */
    getPageType(url) {
        if (url.includes('#comment')) return 'post-detail';
        if (url.includes('/u/')) return 'user-profile';
        if (url.includes('/search')) return 'search';
        if (url.includes('/home')) return 'feed';
        return 'unknown';
    }

    /**
     * 提取评论
     */
    async extractComments(commentContainer, page) {
        const comments = [];
        let scrollCount = 0;
        const maxScrolls = 10;
        let noNewCommentsCount = 0;
        const maxNoNewComments = 2;

        while (scrollCount < maxScrolls && noNewCommentsCount < maxNoNewComments) {
            const commentItems = await commentContainer.$$('.wbpro-scroller-item, .vue-recycle-scroller__item-view');
            
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
                console.log(`✅ 新增 ${newComments.length} 条评论，总计 ${comments.length} 条`);
            } else {
                noNewCommentsCount++;
                console.log(`⏳ 无新评论 (${noNewCommentsCount}/${maxNoNewComments})`);
            }

            const commentList = await commentContainer.$('.RepostCommentList_mar1_3VHkS, .Scroll_container_280Ky');
            if (commentList) {
                const currentHeight = await commentList.evaluate(el => el.scrollHeight);
                await commentList.evaluate(el => el.scrollTo(0, el.scrollHeight));
                await new Promise(resolve => setTimeout(resolve, 3000));
                const newHeight = await commentList.evaluate(el => el.scrollHeight);
                
                if (newHeight <= currentHeight) {
                    console.log('🎯 到达评论底部');
                    break;
                }
            }

            scrollCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return comments;
    }

    /**
     * 演示容器架构操作
     */
    async demonstrateArchitecture(url) {
        console.log('🎯 微博容器架构演示\n');
        
        // 构建架构
        console.log('🏗️ 构建容器架构...');
        const pageContainer = this.buildSimplifiedArchitecture();
        
        // 导航到页面
        console.log('🌐 导航到目标页面...');
        await this.operator.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.operator.page.waitForTimeout(2000);
        
        // 获取页面信息
        console.log('📋 获取页面信息...');
        const pageInfo = await this.operator.operate('weibo-page', 'getPageInfo');
        console.log(`页面类型: ${pageInfo.pageType}`);
        console.log(`页面标题: ${pageInfo.title.substring(0, 50)}...`);
        
        // 获取内容类型
        console.log('📂 获取内容类型...');
        const contentType = await this.operator.operate('main-content', 'getContentType');
        console.log(`内容类型: ${contentType}`);
        
        if (contentType === 'post-detail') {
            console.log('\n📝 处理帖子详情页...');
            
            // 提取帖子信息
            console.log('📋 提取帖子信息...');
            const postInfo = await this.operator.operate('post-container', 'extractPostInfo');
            console.log(`作者: ${postInfo.author}`);
            console.log(`标题: ${postInfo.title.substring(0, 50)}...`);
            
            // 提取媒体内容
            console.log('🖼️ 提取媒体内容...');
            const images = await this.operator.operate('media-container', 'extractImages');
            console.log(`找到 ${images.length} 张图片`);
            
            // 演示下载操作（不实际下载）
            console.log('💾 演示下载操作...');
            const downloadOp = await this.operator.operate('media-container', 'downloadImages');
            console.log(`下载操作: ${downloadOp.operation}, 数量: ${downloadOp.count}`);
            
            // 提取文字内容
            console.log('📝 提取文字内容...');
            const text = await this.operator.operate('text-container', 'extractText');
            console.log(`文字内容: ${text.substring(0, 100)}...`);
            
            // 处理评论
            console.log('\n💬 处理评论区...');
            await this.operator.operate('comments-container', 'scrollToView');
            
            const comments = await this.operator.operate('comments-container', 'extractComments');
            console.log(`🎉 提取完成！共 ${comments.length} 条评论`);
            
            // 显示前几条评论
            if (comments.length > 0) {
                console.log('\n📝 前三条评论:');
                comments.slice(0, 3).forEach((comment, index) => {
                    console.log(`${index + 1}. ${comment.author}: ${comment.content.substring(0, 60)}...`);
                });
            }
            
            this.results = {
                pageInfo,
                postInfo,
                media: { images, count: images.length },
                text: { content: text, length: text.length },
                comments: { count: comments.length, items: comments }
            };
        }
        
        // 显示架构信息
        console.log('\n🏗️ 容器架构信息:');
        console.log('=' * 50);
        await this.displayContainerArchitecture(pageContainer, 0);
        
        return this.results;
    }

    /**
     * 显示容器架构
     */
    async displayContainerArchitecture(container, level = 0) {
        const indent = '  '.repeat(level);
        const containerInfo = container.toJSON();
        
        console.log(`${indent}📦 ${containerInfo.name} (${containerInfo.type})`);
        console.log(`${indent}   ID: ${containerInfo.id}`);
        console.log(`${indent}   描述: ${containerInfo.description}`);
        console.log(`${indent}   操作: [${containerInfo.operations.join(', ')}]`);
        
        if (containerInfo.contentList.length > 0) {
            console.log(`${indent}   子容器: ${containerInfo.contentList.length} 个`);
            for (const childId of containerInfo.contentList) {
                const child = this.operator.getContainer(childId);
                if (child) {
                    await this.displayContainerArchitecture(child, level + 1);
                }
            }
        }
    }
}

// 主函数
async function main() {
    console.log('🌐 精简版微博容器化系统演示\n');
    
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
        // 创建系统并演示
        const system = new SimpleWeiboContainerSystem(page);
        const results = await system.demonstrateArchitecture('https://weibo.com/2656274875/Q4qEJBc6z#comment');
        
        if (results) {
            console.log('\n📊 演示结果总结:');
            console.log('=' * 50);
            console.log(`✅ 成功演示了容器架构`);
            console.log(`📄 页面类型: ${results.pageInfo.pageType}`);
            console.log(`📝 帖子作者: ${results.postInfo.author}`);
            console.log(`🖼️ 图片数量: ${results.media.count}`);
            console.log(`📝 文字长度: ${results.text.length} 字符`);
            console.log(`💬 评论数量: ${results.comments.count}`);
        }
        
    } catch (error) {
        console.error('❌ 演示失败:', error.message);
    } finally {
        await browser.close();
        console.log('\n🧹 浏览器已关闭');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleWeiboContainerSystem;