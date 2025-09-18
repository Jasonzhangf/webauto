#!/usr/bin/env node

const { PreciseWebOperator, ContainerElement, OperationDefinition } = require('./precise-element-operator');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 基于容器架构的微博精确操作器
 * 实现您指定的嵌套元素-操作绑定架构
 */
class WeiboContainerOperator {
    constructor(page) {
        this.operator = new PreciseWebOperator(page);
        this.results = {
            pageInfo: {},
            extractedData: {},
            operationStats: {
                totalOperations: 0,
                successfulOperations: 0,
                failedOperations: 0
            }
        };
    }

    /**
     * 创建微博页面容器架构
     */
    createWeiboContainerStructure() {
        // 创建根容器：微博页面总容器
        const pageContainer = this.operator.createContainer({
            id: 'weibo-page-container',
            name: '微博页面总容器',
            description: '微博帖子页面的最外层容器，包含所有内容',
            type: 'page-container',
            selectors: [
                'body',
                '.woo-layout-main',
                '[class*="Page_wrap_"]'
            ],
            operations: {
                getPageInfo: {
                    description: '获取页面基本信息',
                    action: async ({ element, page }) => {
                        return await page.evaluate(() => ({
                            title: document.title,
                            url: window.location.href,
                            scrollHeight: document.body.scrollHeight,
                            viewportHeight: window.innerHeight
                        }));
                    }
                },
                scrollToBottom: {
                    description: '滚动到页面底部',
                    action: async ({ element }) => {
                        await element.evaluate(el => window.scrollTo(0, document.body.scrollHeight));
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return true;
                    }
                }
            },
            contentList: [
                // 帖子内容容器
                {
                    id: 'post-content-container',
                    name: '帖子内容容器',
                    description: '包含帖子主体内容（文字、图片、视频等）',
                    type: 'content-container',
                    selectors: [
                        'article[class*="Feed_wrap_3v9LH"]',
                        '.woo-panel-main.Detail_feed_3iffy'
                    ],
                    operations: {
                        extractPostInfo: {
                            description: '提取帖子基本信息',
                            action: async ({ element }) => {
                                const title = await element.$eval('.detail_wbtext_4CRf9', el => el.textContent).catch(() => '');
                                const author = await element.$eval('.head_main_3DRDm', el => el.textContent).catch(() => '');
                                const time = await element.$eval('.head-info_time_6sFQg', el => el.textContent).catch(() => '');
                                return { title, author, time };
                            }
                        },
                        extractImages: {
                            description: '提取帖子中的图片',
                            action: async ({ element }) => {
                                const images = await element.$$eval('img[src*="sina"]', imgs => 
                                    imgs.map(img => img.src).filter(src => src && src.includes('jpg'))
                                );
                                return images;
                            }
                        }
                    },
                    contentList: [
                        // 图片容器
                        {
                            id: 'images-container',
                            name: '图片容器',
                            description: '包含帖子中的所有图片',
                            type: 'image-container',
                            selectors: [
                                '.woo-box-flex.woo-box-alignCenter.media_media-pic_2hjWt',
                                '.media_media-pic_2hjWt img'
                            ],
                            operations: {
                                downloadImages: {
                                    description: '下载所有图片',
                                    action: async ({ element }) => {
                                        const images = await element.$$eval('img', imgs => 
                                            imgs.map(img => img.src).filter(src => src)
                                        );
                                        return { count: images.length, urls: images };
                                    }
                                }
                            }
                        },
                        // 文字内容容器
                        {
                            id: 'text-container',
                            name: '文字内容容器',
                            description: '包含帖子的文字内容',
                            type: 'text-container',
                            selectors: [
                                '.detail_wbtext_4CRf9',
                                '.Feed_body_3R0rO .detail_wbtext_4CRf9'
                            ],
                            operations: {
                                extractText: {
                                    description: '提取文字内容',
                                    action: async ({ element }) => {
                                        return await element.textContent();
                                    }
                                }
                            }
                        },
                        // 视频容器
                        {
                            id: 'video-container',
                            name: '视频容器',
                            description: '包含帖子中的视频内容',
                            type: 'video-container',
                            selectors: [
                                '.woo-box-flex.woo-box-alignCenter.media_media-video_2hjWt',
                                '.media_media-video_2hjWt'
                            ],
                            operations: {
                                extractVideoInfo: {
                                    description: '提取视频信息',
                                    action: async ({ element }) => {
                                        const videoElement = await element.$('video');
                                        if (videoElement) {
                                            const src = await videoElement.getAttribute('src');
                                            const poster = await videoElement.getAttribute('poster');
                                            return { src, poster, hasVideo: true };
                                        }
                                        return { hasVideo: false };
                                    }
                                }
                            }
                        }
                    ]
                },
                // 评论区总容器
                {
                    id: 'comments-container',
                    name: '评论区容器',
                    description: '包含所有评论的总容器',
                    type: 'comments-container',
                    selectors: [
                        '.Detail_box_3Jeom',
                        '.woo-panel-main.Card_wrap_2ibWe.Detail_detail_3typT'
                    ],
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
                            action: async ({ element, finder, page }) => {
                                return await this.extractCommentsRecursive(element, finder, page);
                            }
                        }
                    },
                    contentList: [
                        // 评论列表容器
                        {
                            id: 'comment-list-container',
                            name: '评论列表容器',
                            description: '包含所有评论项的列表容器',
                            type: 'comment-list-container',
                            selectors: [
                                '.RepostCommentList_mar1_3VHkS',
                                '.Scroll_container_280Ky',
                                '.vue-recycle-scroller'
                            ],
                            operations: {
                                loadMoreComments: {
                                    description: '加载更多评论（滚动）',
                                    action: async ({ element }) => {
                                        const currentHeight = await element.evaluate(el => el.scrollHeight);
                                        await element.evaluate(el => el.scrollTo(0, el.scrollHeight));
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        const newHeight = await element.evaluate(el => el.scrollHeight);
                                        return newHeight > currentHeight;
                                    }
                                },
                                checkAtBottom: {
                                    description: '检查是否到达底部',
                                    action: async ({ element }) => {
                                        const scrollTop = await element.evaluate(el => el.scrollTop);
                                        const scrollHeight = await element.evaluate(el => el.scrollHeight);
                                        const clientHeight = await element.evaluate(el => el.clientHeight);
                                        return scrollTop + clientHeight >= scrollHeight - 100;
                                    }
                                },
                                getAllCommentItems: {
                                    description: '获取所有评论项',
                                    action: async ({ element }) => {
                                        return await element.$$('.wbpro-scroller-item, .vue-recycle-scroller__item-view');
                                    }
                                }
                            },
                            contentList: [
                                // 单个评论项
                                {
                                    id: 'comment-item-container',
                                    name: '评论项容器',
                                    description: '单个评论项的容器',
                                    type: 'comment-item-container',
                                    selectors: [
                                        '.wbpro-scroller-item',
                                        '.vue-recycle-scroller__item-view'
                                    ],
                                    operations: {
                                        expandComment: {
                                            description: '展开评论（如果有展开按钮）',
                                            action: async ({ element }) => {
                                                const expandButton = await element.$('button[title*="展开"], button[aria-label*="展开"]');
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
                                                
                                                // 清理内容
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
        });

        return pageContainer;
    }

    /**
     * 递归提取评论
     */
    async extractCommentsRecursive(commentContainer, finder, page) {
        const comments = [];
        let scrollCount = 0;
        const maxScrolls = 20;
        let lastCommentCount = 0;
        let noNewCommentsCount = 0;
        const maxNoNewComments = 3;

        console.log('🔄 开始递归提取评论...');

        while (scrollCount < maxScrolls && noNewCommentsCount < maxNoNewComments) {
            // 获取当前所有评论项
            const commentItems = await commentContainer.$$('.wbpro-scroller-item, .vue-recycle-scroller__item-view');
            
            // 提取新评论
            const newComments = [];
            for (const item of commentItems) {
                try {
                    const commentData = await item.$eval('.item1in .con1 .text', el => el.textContent).catch(() => '');
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
                console.log(`✅ 新增 ${newComments.length} 条评论，总计 ${comments.length} 条`);
                noNewCommentsCount = 0;
            } else {
                noNewCommentsCount++;
                console.log(`⏳ 无新评论 (${noNewCommentsCount}/${maxNoNewComments})`);
            }

            // 滚动加载更多
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
     * 执行完整的微博页面操作
     */
    async operateOnWeiboPage(postUrl) {
        console.log('🎯 使用容器架构操作微博页面...\n');

        try {
            // 创建容器架构
            const pageContainer = this.createWeiboContainerStructure();
            
            // 导航到页面
            console.log('🌐 导航到目标页面...');
            await this.operator.page.goto(postUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            await this.operator.page.waitForTimeout(3000);

            // 获取页面信息
            console.log('📋 获取页面信息...');
            const pageInfo = await this.operator.operate('weibo-page-container', 'getPageInfo');
            this.results.pageInfo = pageInfo;
            console.log('页面信息:', pageInfo);

            // 提取帖子内容
            console.log('📝 提取帖子内容...');
            const postInfo = await this.operator.operate('post-content-container', 'extractPostInfo');
            this.results.extractedData.postInfo = postInfo;
            console.log('帖子信息:', postInfo);

            // 提取图片
            console.log('🖼️ 提取图片...');
            const images = await this.operator.operate('post-content-container', 'extractImages');
            this.results.extractedData.images = images;
            console.log(`找到 ${images.length} 张图片`);

            // 处理评论区
            console.log('💬 处理评论区...');
            await this.operator.operate('comments-container', 'scrollToView');
            
            const hasComments = await this.operator.operate('comments-container', 'checkHasComments');
            if (hasComments) {
                console.log('✅ 发现评论，开始提取...');
                const comments = await this.operator.operate('comments-container', 'extractAllComments');
                this.results.extractedData.comments = comments;
                console.log(`🎉 提取完成！共 ${comments.length} 条评论`);
            } else {
                console.log('❌ 该帖子没有评论');
            }

            // 保存结果
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const resultFile = path.join(process.env.HOME || '~', '.webauto', `weibo-container-results-${timestamp}.json`);
            await fs.mkdir(path.dirname(resultFile), { recursive: true });
            await fs.writeFile(resultFile, JSON.stringify({
                ...this.results,
                containerStructure: this.operator.exportLibrary()
            }, null, 2));

            console.log(`💾 结果已保存到: ${resultFile}`);
            return this.results;

        } catch (error) {
            console.error('❌ 操作失败:', error.message);
            return null;
        }
    }
}

// 主函数
async function main() {
    console.log('🏗️ 微博容器架构操作器演示\n');
    
    const targetUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
    
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
        const operator = new WeiboContainerOperator(page);
        const results = await operator.operateOnWeiboPage(targetUrl);
        
        if (results) {
            console.log('\n📋 操作结果预览:');
            console.log('=' * 60);
            
            const { pageInfo, extractedData } = results;
            console.log(`📄 页面: ${pageInfo.title}`);
            console.log(`🔗 URL: ${pageInfo.url}`);
            console.log(`📝 帖子: ${extractedData.postInfo?.author || '未知'} - ${extractedData.postInfo?.title?.substring(0, 50) || '无标题'}...`);
            console.log(`🖼️ 图片: ${extractedData.images?.length || 0} 张`);
            console.log(`💬 评论: ${extractedData.comments?.length || 0} 条`);
            
            if (extractedData.comments && extractedData.comments.length > 0) {
                console.log('\n📝 前三条评论:');
                extractedData.comments.slice(0, 3).forEach((comment, index) => {
                    console.log(`${index + 1}. ${comment.author}: ${comment.content.substring(0, 80)}...`);
                });
            }
        }
    } catch (error) {
        console.error('❌ 执行失败:', error);
    } finally {
        await browser.close();
        console.log('🧹 浏览器已关闭');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = WeiboContainerOperator;