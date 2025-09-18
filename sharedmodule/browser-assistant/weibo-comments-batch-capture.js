#!/usr/bin/env node

/**
 * 微博评论批量捕获工具
 * 基于已捕获的微博链接，批量打开单条微博页面并捕获评论
 */

const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

class WeiboCommentsBatchCapture {
    constructor() {
        this.inputDir = process.env.INPUT_DIR || '~/.webauto/2025-09-13/homepage';
        this.outputDir = path.join(this.inputDir, 'with-comments');
        this.results = {
            processedPosts: 0,
            successfulCaptures: 0,
            totalComments: 0,
            failedCaptures: []
        };
        this.browser = null;
    }

    async initialize() {
        console.log('🚀 初始化微博评论批量捕获工具...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        
        // 启动浏览器
        this.browser = await chromium.launch({
            headless: false, // 可视化模式以便调试
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
        
        console.log('✅ 初始化完成');
    }

    async extractWeiboLinks() {
        console.log('🔍 从现有微博文件中提取链接...');
        
        const links = [];
        const files = await fs.readdir(this.inputDir);
        
        for (const file of files) {
            if (file.startsWith('post_') && file.endsWith('.md')) {
                const filePath = path.join(this.inputDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                
                // 提取原文链接
                const linkMatch = content.match(/\[查看原文\]\((https:\/\/weibo\.com\/[^)]+)\)/);
                if (linkMatch) {
                    links.push({
                        url: linkMatch[1],
                        sourceFile: file,
                        postId: file.replace('.md', '').split('_')[1]
                    });
                }
            }
        }
        
        console.log(`✅ 提取到 ${links.length} 个微博链接`);
        return links;
    }

    async processPostLinks(links) {
        console.log(`📝 开始处理 ${links.length} 条微博链接...`);
        
        const page = await this.browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 加载微博cookie
        await this.loadCookies(page);
        
        for (let i = 0; i < links.length; i++) {
            const linkInfo = links[i];
            console.log(`处理 ${i + 1}/${links.length}: ${linkInfo.url}`);
            
            try {
                const result = await this.capturePostWithComments(page, linkInfo);
                this.results.processedPosts++;
                
                if (result.success) {
                    this.results.successfulCaptures++;
                    this.results.totalComments += result.commentCount;
                    console.log(`✅ 成功捕获 ${result.commentCount} 条评论`);
                } else {
                    this.results.failedCaptures.push({
                        url: linkInfo.url,
                        error: result.error
                    });
                    console.log(`❌ 捕获失败: ${result.error}`);
                }
                
                // 添加延迟避免被检测
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                this.results.failedCaptures.push({
                    url: linkInfo.url,
                    error: error.message
                });
                console.log(`❌ 处理失败: ${error.message}`);
            }
        }
        
        await page.close();
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
                
                await page.context().addCookies(puppeteerCookies);
                console.log('✅ 已加载微博cookie');
            }
        } catch (error) {
            console.warn('⚠️ 加载cookie失败:', error.message);
        }
    }

    async capturePostWithComments(page, linkInfo) {
        try {
            // 访问微博单页面
            await page.goto(linkInfo.url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 检查是否需要登录
            const loginRequired = await page.evaluate(() => {
                return document.querySelector('a[href*="login"], .login_btn') !== null;
            });
            
            if (loginRequired) {
                return { success: false, error: '需要登录' };
            }
            
            // 提取微博内容
            const postContent = await this.extractPostContent(page);
            
            // 展开评论
            await this.expandComments(page);
            
            // 等待评论加载
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 提取评论
            const comments = await this.extractComments(page);
            
            // 保存结果
            const fileName = `post_with_comments_${linkInfo.postId}.md`;
            const filePath = path.join(this.outputDir, fileName);
            
            await this.savePostWithComments(filePath, {
                originalUrl: linkInfo.url,
                sourceFile: linkInfo.sourceFile,
                post: postContent,
                comments: comments,
                captureTime: new Date().toISOString()
            });
            
            return {
                success: true,
                commentCount: comments.length,
                postContent: postContent
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async extractPostContent(page) {
        return await page.evaluate(() => {
            // 提取微博内容
            const contentElement = document.querySelector('.Feed_body-content, .WB_text, [class*="content"]');
            const authorElement = document.querySelector('.Feed_body-author-name, .WB_name, [class*="name"]');
            const timeElement = document.querySelector('.Feed_body-time, .WB_from, [class*="time"]');
            
            return {
                content: contentElement?.textContent?.trim() || '',
                author: authorElement?.textContent?.trim() || '',
                time: timeElement?.textContent?.trim() || ''
            };
        });
    }

    async expandComments(page) {
        try {
            // 尝试多种方式展开评论
            await page.evaluate(() => {
                // 方法1: 点击评论按钮
                const allButtons = document.querySelectorAll('button, a, [class*="comment"]');
                allButtons.forEach(btn => {
                    if (btn.textContent && btn.textContent.includes('评论')) {
                        btn.click();
                    }
                });
                
                // 方法2: 点击"查看更多评论"
                setTimeout(() => {
                    const moreButtons = document.querySelectorAll('button, a, [class*="more"]');
                    moreButtons.forEach(btn => {
                        if (btn.textContent && (btn.textContent.includes('更多') || btn.textContent.includes('查看'))) {
                            btn.click();
                        }
                    });
                }, 1000);
            });
            
            // 滚动加载更多评论
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => {
                    window.scrollBy(0, 500);
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
        } catch (error) {
            console.log('展开评论时出错:', error.message);
        }
    }

    async extractComments(page) {
        return await page.evaluate(() => {
            const comments = [];
            
            // 尝试提取微博页面中嵌套的评论（转发评论）
            const extractNestedComments = (text) => {
                const commentPattern = /([^\n]+?):\s*([^\n]+?)(?=\n[^\n]+?:|$)/g;
                const timePattern = /(\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})/g;
                let match;
                const extractedComments = [];
                
                while ((match = commentPattern.exec(text)) !== null) {
                    const author = match[1].trim();
                    const content = match[2].trim();
                    const timeMatch = content.match(timePattern);
                    const time = timeMatch ? timeMatch[0] : '';
                    
                    if (author && content && !author.includes('发布于') && !author.includes('来自')) {
                        extractedComments.push({
                            id: `comment_${extractedComments.length}`,
                            author: { name: author },
                            content: content.replace(time, '').trim(),
                            publishTime: time,
                            index: extractedComments.length + 1
                        });
                    }
                }
                
                return extractedComments;
            };
            
            // 从页面文本中提取评论
            const pageText = document.body.innerText;
            const nestedComments = extractNestedComments(pageText);
            
            // 同时尝试标准评论选择器
            const commentSelectors = [
                '.WB_comment',
                '.weibo-comment', 
                '.comment-item',
                '[class*="comment"]',
                '.woo-box-flex.woo-box-alignCenter.comment-item'
            ];
            
            let standardComments = [];
            for (const selector of commentSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    elements.forEach((comment, index) => {
                        try {
                            const authorElement = comment.querySelector('.WB_name, .comment-author, [class*="name"], [class*="author"]');
                            const contentElement = comment.querySelector('.WB_text, .comment-content, [class*="content"], [class*="text"]');
                            const timeElement = comment.querySelector('.WB_from, .comment-time, [class*="time"], [class*="from"]');
                            
                            const author = authorElement?.textContent?.trim() || '';
                            const content = contentElement?.textContent?.trim() || '';
                            const time = timeElement?.textContent?.trim() || '';
                            
                            if (content && author) {
                                standardComments.push({
                                    id: `comment_${index}`,
                                    author: { name: author },
                                    content,
                                    publishTime: time,
                                    index: index + 1
                                });
                            }
                        } catch (e) {
                            // 忽略单个评论提取错误
                        }
                    });
                    break;
                }
            }
            
            // 合并评论，优先使用嵌套评论
            const allComments = [...nestedComments, ...standardComments];
            return allComments.slice(0, 20); // 最多20条评论
        });
    }

    async savePostWithComments(filePath, data) {
        const content = `# 微博详情与评论

## 基本信息
- **原文链接:** ${data.originalUrl}
- **来源文件:** ${data.sourceFile}
- **捕获时间:** ${data.captureTime}
- **评论数量:** ${data.comments.length}条

---

## 微博内容

**作者:** ${data.post.author}
**发布时间:** ${data.post.time}

**内容:**
${data.post.content}

---

## 评论 (${data.comments.length}条)

${data.comments.map(comment => `
### 评论 ${comment.index}

**作者:** ${comment.author.name}
**时间:** ${comment.publishTime}

**内容:**
${comment.content}

---
`).join('')}

*此文件由微博评论批量捕获工具自动生成*`;

        await fs.writeFile(filePath, content, 'utf8');
    }

    async generateSummaryReport() {
        const reportPath = path.join(this.outputDir, '评论捕获汇总报告.md');
        
        const report = `# 微博评论捕获汇总报告

## 📊 捕获统计
- **处理微博数:** ${this.results.processedPosts}
- **成功捕获:** ${this.results.successfulCaptures}
- **失败捕获:** ${this.results.failedCaptures.length}
- **总评论数:** ${this.results.totalComments}
- **成功率:** ${((this.results.successfulCaptures / this.results.processedPosts) * 100).toFixed(1)}%

## 📁 输出文件
所有包含评论的微博文件保存在: ${this.outputDir}

## ❌ 失败记录
${this.results.failedCaptures.map((item, index) => `
${index + 1}. **URL:** ${item.url}
   **错误:** ${item.error}
`).join('') || '无失败记录'}

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 微博评论批量捕获工具 v1.0`;

        await fs.writeFile(reportPath, report, 'utf8');
        console.log(`📊 汇总报告已保存: ${reportPath}`);
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
    const capturer = new WeiboCommentsBatchCapture();
    
    try {
        await capturer.initialize();
        
        // 提取微博链接
        const links = await capturer.extractWeiboLinks();
        
        if (links.length === 0) {
            console.log('❌ 未找到微博链接');
            return;
        }
        
        // 处理链接并捕获评论
        await capturer.processPostLinks(links);
        
        // 生成汇总报告
        await capturer.generateSummaryReport();
        
        console.log('\n🎉 评论捕获完成！');
        console.log(`📁 结果保存在: ${capturer.outputDir}`);
        console.log(`📊 成功捕获 ${capturer.results.successfulCaptures}/${capturer.results.processedPosts} 条微博的评论`);
        console.log(`💬 总评论数: ${capturer.results.totalComments}`);
        
    } catch (error) {
        console.error('❌ 执行失败:', error);
        process.exit(1);
    } finally {
        await capturer.cleanup();
    }
}

// 运行程序
if (require.main === module) {
    main();
}

module.exports = WeiboCommentsBatchCapture;