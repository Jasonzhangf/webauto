#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 微博评论精确提取系统
 * 采用目标抽象和精确选择器，避免野蛮操作
 */
class WeiboCommentExtractor {
    constructor() {
        // 精确的选择器定义
        this.selectors = {
            // 评论区容器 - 微博特定的结构
            commentSection: [
                '[data-feedid] [class*="comment"]',
                '[data-feedid] [class*="feedback"]',
                '.Feed_body__3R0rO [class*="comment"]',
                '.Feed_body__3R0rO [class*="react"]',
                '[class*="woo-box-flex"].woo-box-alignCenter.woo-box-spaceBetween'
            ],
            
            // 评论加载更多按钮 - 微博特定的加载更多
            loadMoreButton: [
                'button:has-text("加载更多")',
                'button:has-text("更多评论")',
                '[class*="load-more"]',
                '[data-action="load-more"]',
                'a:has-text("查看更多")'
            ],
            
            // 单个评论项 - 基于微博的实际结构
            commentItem: [
                '[data-feedid] .woo-box-flex.woo-box-alignCenter',
                '[class*="comment-item"]',
                '[class*="feedback-item"]',
                '[class*="react-item"]',
                '[data-commentid]'
            ],
            
            // 评论内容 - 更精确的定位
            commentContent: [
                '[class*="content"] span',
                '[class*="text"] span',
                '.woo-box-flex span',
                '[class*="body"] span'
            ],
            
            // 评论者信息 - 微博用户链接
            commentAuthor: [
                'a[href*="/u/"]',
                'a[href*="/n/"]',
                '[class*="user"] a',
                '[class*="author"] a'
            ],
            
            // 评论时间
            commentTime: [
                '[class*="time"]',
                '[class*="date"]',
                'time',
                '[class*="ago"]'
            ],
            
            // 点赞数
            commentLikes: [
                '[class*="like"]',
                '[class*="good"]',
                '[class*="thumb"]',
                '[class*="up"]'
            ],
            
            // 回复数
            commentReplies: [
                '[class*="reply"]',
                '[class*="comment-reply"]'
            ],
            
            // 页面底部标识
            pageEnd: [
                '[class*="footer"]',
                '[class*="bottom"]',
                '[data-role="footer"]',
                'footer'
            ]
        };
        
        // 评论提取状态
        this.extractionState = {
            scrollCount: 0,
            maxScrolls: 15,
            lastCommentCount: 0,
            noNewCommentsCount: 0,
            maxNoNewComments: 3,
            foundPageEnd: false,
            comments: []
        };
    }
    
    /**
     * 精确查找元素
     */
    async findElement(page, selectors, context = null) {
        const searchContext = context || page;
        
        for (const selector of selectors) {
            try {
                const element = await searchContext.$(selector);
                if (element) {
                    return { element, selector };
                }
            } catch (error) {
                continue;
            }
        }
        
        return null;
    }
    
    /**
     * 精确查找多个元素
     */
    async findElements(page, selectors, context = null) {
        const searchContext = context || page;
        const allElements = [];
        
        for (const selector of selectors) {
            try {
                const elements = await searchContext.$$(selector);
                allElements.push(...elements.map(el => ({ element: el, selector })));
            } catch (error) {
                continue;
            }
        }
        
        return allElements;
    }
    
    /**
     * 检查是否到达页面底部
     */
    async checkPageEnd(page) {
        const endElement = await this.findElement(page, this.selectors.pageEnd);
        if (endElement) {
            console.log('🎯 检测到页面底部标识');
            return true;
        }
        
        // 检查是否已经滚动到页面最底部
        const scrollInfo = await page.evaluate(() => {
            return {
                scrollTop: window.scrollY,
                scrollHeight: document.body.scrollHeight,
                clientHeight: window.innerHeight,
                atBottom: window.scrollY + window.innerHeight >= document.body.scrollHeight - 100
            };
        });
        
        if (scrollInfo.atBottom) {
            console.log('🎯 已到达页面底部');
            return true;
        }
        
        return false;
    }
    
    /**
     * 精确提取单个评论
     */
    async extractComment(commentElement) {
        try {
            // 提取评论内容
            const contentResult = await this.findElement(commentElement, this.selectors.commentContent);
            const content = contentResult ? 
                await contentResult.element.textContent() : '';
            
            if (!content || content.trim().length < 3) {
                return null;
            }
            
            // 提取评论者信息
            const authorResult = await this.findElement(commentElement, this.selectors.commentAuthor);
            const authorName = authorResult ? 
                await authorResult.element.textContent() : '匿名用户';
            const authorLink = authorResult ? 
                await authorResult.element.getAttribute('href') : '';
            
            // 提取时间
            const timeResult = await this.findElement(commentElement, this.selectors.commentTime);
            const time = timeResult ? 
                await timeResult.element.textContent() : '';
            
            // 提取点赞数
            const likesResult = await this.findElement(commentElement, this.selectors.commentLikes);
            const likes = likesResult ? 
                await likesResult.element.textContent() : '0';
            
            // 清理内容
            const cleanContent = content.trim()
                .replace(/\s+/g, ' ')
                .replace(/展开|返回|更多|收起/g, '')
                .trim();
            
            if (cleanContent.length < 3) {
                return null;
            }
            
            return {
                content: cleanContent.substring(0, 300),
                author: authorName.trim(),
                authorLink: authorLink || '',
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
     * 精确点击加载更多按钮
     */
    async clickLoadMoreButton(page) {
        try {
            const buttonResult = await this.findElement(page, this.selectors.loadMoreButton);
            if (!buttonResult) {
                return false;
            }
            
            // 检查按钮是否可见且可点击
            const isVisible = await buttonResult.element.isVisible();
            const isEnabled = await buttonResult.element.isEnabled();
            
            if (!isVisible || !isEnabled) {
                console.log('🔍 加载更多按钮不可见或不可用');
                return false;
            }
            
            console.log('📲 精确点击加载更多按钮');
            await buttonResult.element.click();
            await page.waitForTimeout(2000);
            
            return true;
            
        } catch (error) {
            console.warn('点击加载更多按钮失败:', error.message);
            return false;
        }
    }
    
    /**
     * 智能滚动策略
     */
    async smartScroll(page) {
        const { scrollCount, maxScrolls, noNewCommentsCount, maxNoNewComments } = this.extractionState;
        
        // 检查是否应该停止滚动
        if (scrollCount >= maxScrolls || noNewCommentsCount >= maxNoNewComments) {
            console.log('⏹️ 达到滚动停止条件');
            return false;
        }
        
        // 检查是否到达页面底部
        const atPageEnd = await this.checkPageEnd(page);
        if (atPageEnd) {
            this.extractionState.foundPageEnd = true;
            return false;
        }
        
        // 执行滚动
        const currentScroll = await page.evaluate(() => window.scrollY);
        const scrollAmount = 800; // 固定滚动距离
        
        await page.evaluate(() => {
            window.scrollBy(0, 800);
        });
        
        await page.waitForTimeout(2000);
        
        const newScroll = await page.evaluate(() => window.scrollY);
        
        if (newScroll > currentScroll) {
            console.log(`📜 智能滚动 ${scrollCount + 1}/${maxScrolls} - 滚动距离: ${scrollAmount}px`);
            this.extractionState.scrollCount++;
            return true;
        } else {
            console.log('🎯 滚动已到最底部');
            this.extractionState.foundPageEnd = true;
            return false;
        }
    }
    
    /**
     * 主要提取流程
     */
    async extractComments(postUrl) {
        console.log('🎯 开始精确提取微博评论...\n');
        
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
            
            // 滚动到评论区
            console.log('📍 定位到评论区...');
            await page.evaluate(() => {
                const commentSection = document.querySelector('[class*="comment"], [class*="feedback"]');
                if (commentSection) {
                    commentSection.scrollIntoView({ behavior: 'smooth' });
                } else {
                    window.scrollTo(0, document.body.scrollHeight * 0.7);
                }
            });
            
            await page.waitForTimeout(3000);
            
            // 调试：分析页面结构
            console.log('🔍 分析页面结构...');
            const pageInfo = await page.evaluate(() => {
                const allElements = document.querySelectorAll('*');
                const elementCounts = {};
                
                allElements.forEach(el => {
                    const className = el.className || '';
                    if (typeof className === 'string' && (className.includes('comment') || className.includes('feedback') || className.includes('react'))) {
                        elementCounts[className] = (elementCounts[className] || 0) + 1;
                    }
                });
                
                const feedItems = document.querySelectorAll('[data-feedid]').length;
                const wooBoxes = document.querySelectorAll('.woo-box-flex').length;
                
                return {
                    feedItems,
                    wooBoxes,
                    commentClasses: elementCounts,
                    pageHeight: document.body.scrollHeight,
                    windowHeight: window.innerHeight
                };
            });
            
            console.log('📊 页面分析结果:', JSON.stringify(pageInfo, null, 2));
            
            // 主要提取循环
            console.log('🔄 开始智能提取循环...\n');
            
            while (true) {
                // 查找并提取评论
                const commentElements = await this.findElements(page, this.selectors.commentItem);
                let newComments = [];
                
                for (const { element } of commentElements) {
                    const comment = await this.extractComment(element);
                    if (comment && !this.extractionState.comments.find(c => c.content === comment.content)) {
                        newComments.push(comment);
                    }
                }
                
                // 更新状态
                if (newComments.length > 0) {
                    this.extractionState.comments.push(...newComments);
                    this.extractionState.lastCommentCount = newComments.length;
                    this.extractionState.noNewCommentsCount = 0;
                    console.log(`✅ 新增 ${newComments.length} 条评论，总计 ${this.extractionState.comments.length} 条`);
                } else {
                    this.extractionState.noNewCommentsCount++;
                    console.log(`⏳ 无新评论 (${this.extractionState.noNewCommentsCount}/${this.extractionState.maxNoNewComments})`);
                }
                
                // 尝试点击加载更多按钮
                const buttonClicked = await this.clickLoadMoreButton(page);
                
                // 执行智能滚动
                const shouldContinue = await this.smartScroll(page);
                
                // 检查停止条件
                if (!shouldContinue) {
                    break;
                }
                
                // 短暂延迟
                await page.waitForTimeout(1000);
            }
            
            console.log('\n🎉 评论提取完成！');
            console.log(`📊 总共提取 ${this.extractionState.comments.length} 条评论`);
            
            // 保存结果
            const result = {
                postUrl,
                extractedAt: new Date().toISOString(),
                totalComments: this.extractionState.comments.length,
                extractionStats: {
                    scrollCount: this.extractionState.scrollCount,
                    foundPageEnd: this.extractionState.foundPageEnd,
                    maxScrolls: this.extractionState.maxScrolls
                },
                comments: this.extractionState.comments
            };
            
            const resultFile = path.join(process.env.HOME || '~', '.webauto', 'weibo-precise-comments.json');
            await fs.mkdir(path.dirname(resultFile), { recursive: true });
            await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
            
            console.log(`💾 结果已保存到: ${resultFile}`);
            
            return result;
            
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
    const extractor = new WeiboCommentExtractor();
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