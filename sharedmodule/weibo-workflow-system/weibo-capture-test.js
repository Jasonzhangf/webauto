#!/usr/bin/env node

/**
 * 微博首页捕获测试 - 直接使用 puppeteer
 * 登录微博首页获取最新50条微博并保存到本地
 */

const puppeteer = require('puppeteer-extra');
const path = require('path');
const fs = require('fs-extra');
const { CookieManager } = require('./CookieManager');

// 添加反检测插件
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin);

class WeiboHomepageCapture {
    constructor() {
        this.outputDir = path.join(__dirname, 'output', 'weibo-homepage-capture');
        this.cookieManager = new CookieManager(path.join(__dirname, 'cookies'));
        this.results = {
            posts: [],
            summary: {
                totalPosts: 0,
                totalImages: 0,
                totalLinks: 0,
                startTime: null,
                endTime: null,
                duration: 0
            }
        };
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        console.log('🚀 初始化微博首页捕获测试...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        await fs.ensureDir(path.join(this.outputDir, 'posts'));
        await fs.ensureDir(path.join(this.outputDir, 'images'));
        await fs.ensureDir(path.join(this.outputDir, 'screenshots'));
        
        console.log(`📁 输出目录: ${this.outputDir}`);
        
        // 启动浏览器
        this.browser = await puppeteer.launch({
            headless: false,
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
        
        // 创建新页面
        this.page = await this.browser.newPage();
        
        // 设置视口
        await this.page.setViewport({ width: 1920, height: 1080 });
        
        // 设置用户代理
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 使用CookieManager加载微博cookie
        await this.loadWeiboCookiesWithManager();
        
        console.log('✅ 初始化完成');
    }

    async loadWeiboCookiesWithManager() {
        try {
            // 首先检查是否有有效的微博cookie
            const hasValidCookies = this.cookieManager.hasLoginCookies('weibo.com');
            
            if (hasValidCookies) {
                console.log('🍪 检测到有效的微博cookie，正在加载...');
                const loaded = await this.cookieManager.loadCookies(this.page, 'weibo.com');
                
                if (loaded) {
                    console.log('✅ 成功加载微博cookie');
                    return;
                }
            }
            
            console.log('⚠️ 未找到有效的微博cookie，将需要手动登录');
            
        } catch (error) {
            console.error('❌ 加载微博cookie失败:', error);
        }
    }

    async execute() {
        try {
            this.results.summary.startTime = new Date();
            console.log('🎯 开始执行微博首页捕获任务...');
            
            // 访问微博首页
            console.log('🌐 访问微博首页...');
            await this.page.goto('https://weibo.com', { waitUntil: 'networkidle2', timeout: 30000 });
            
            // 检查是否需要登录
            const loginRequired = await this.page.evaluate(() => {
                const loginElements = document.querySelectorAll('a[href*="login"], .login_btn, .gn_login, .woo-modal-main');
                return loginElements.length > 0;
            });
            
            if (loginRequired) {
                console.log('🔐 需要登录微博');
                console.log('请手动完成登录，登录成功后按 Enter 继续...');
                console.log('提示：使用手机扫码登录或输入账号密码登录');
                
                // 等待用户手动登录
                await new Promise(resolve => {
                    process.stdin.once('data', resolve);
                });
                
                console.log('✅ 登录完成，保存cookie...');
                
                // 使用CookieManager保存登录后的cookie
                await this.cookieManager.saveCookies(this.page);
                
                // 刷新页面
                await this.page.reload({ waitUntil: 'networkidle2' });
                
                // 等待页面加载
                await this.page.waitForTimeout(3000);
            }
            
            console.log('✅ 已登录微博，开始捕获内容...');
            
            // 滚动加载更多内容
            let posts = [];
            let scrollAttempts = 0;
            const maxScrollAttempts = 25;
            
            while (posts.length < 50 && scrollAttempts < maxScrollAttempts) {
                console.log(`📜 滚动加载第 ${scrollAttempts + 1} 次，当前 ${posts.length} 条微博...`);
                
                // 滚动到底部
                await this.page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                // 等待新内容加载
                await this.page.waitForTimeout(3000);
                
                // 提取微博内容
                const newPosts = await this.extractPosts();
                posts = this.mergePosts(posts, newPosts);
                
                // 如果没有新内容，尝试不同的滚动方式
                if (newPosts.length === 0 && scrollAttempts > 10) {
                    console.log('尝试不同的滚动方式...');
                    await this.page.evaluate(() => {
                        // 模拟点击"加载更多"按钮
                        const loadMoreButtons = document.querySelectorAll('button:contains("加载更多"), .more_text, .woo-button-main');
                        loadMoreButtons.forEach(btn => {
                            if (btn.textContent.includes('更多') || btn.textContent.includes('加载')) {
                                btn.click();
                            }
                        });
                    });
                    await this.page.waitForTimeout(2000);
                }
                
                scrollAttempts++;
            }
            
            // 限制为50条
            posts = posts.slice(0, 50);
            
            console.log(`✅ 成功提取 ${posts.length} 条微博`);
            
            // 捕获每条微博的详细内容
            for (let i = 0; i < posts.length; i++) {
                console.log(`📝 捕获微博 ${i + 1}/${posts.length}: ${posts[i].title?.substring(0, 50)}...`);
                
                const postDetail = await this.capturePostDetail(posts[i], i);
                this.results.posts.push(postDetail);
                
                // 添加延迟避免被检测
                await this.page.waitForTimeout(1500);
            }
            
            this.results.summary.endTime = new Date();
            this.results.summary.duration = this.results.summary.endTime - this.results.summary.startTime;
            this.results.summary.totalPosts = posts.length;
            this.results.summary.totalImages = this.results.posts.reduce((sum, p) => sum + (p.images?.length || 0), 0);
            this.results.summary.totalLinks = this.results.posts.reduce((sum, p) => sum + (p.links?.length || 0), 0);
            
            console.log('🎉 任务执行完成！');
            
            // 保存结果
            await this.saveResults();
            
            // 生成汇总报告
            await this.generateSummaryReport();
            
            return this.results;
            
        } catch (error) {
            console.error('❌ 任务执行失败:', error);
            throw error;
        }
    }

    async extractPosts() {
        return await this.page.evaluate(() => {
            const posts = [];
            
            // 尝试多种选择器来找到微博元素
            const selectors = [
                '.Feed_body',
                '.WB_feed', 
                '.weibo-post',
                '.woo-box-flex.woo-box-alignCenter.Feed_body',
                '[class*="Feed"]',
                '[class*="weibo"]',
                'article'
            ];
            
            let feedItems = [];
            for (const selector of selectors) {
                feedItems = document.querySelectorAll(selector);
                if (feedItems.length > 0) {
                    console.log(`找到 ${feedItems.length} 个微博元素，使用选择器: ${selector}`);
                    break;
                }
            }
            
            feedItems.forEach((item, index) => {
                try {
                    // 使用多种选择器来提取内容
                    const titleElement = item.querySelector('.Feed_body-title, .WB_text, .weibo-text, .woo-box-item.woo-box-clamp2.woo-box-alignCenter.Feed_body-title, [class*="text"]');
                    const authorElement = item.querySelector('.Feed_body-author-name, .WB_name, .weibo-author, [class*="name"], [class*="author"]');
                    const timeElement = item.querySelector('.Feed_body-time, .WB_from, .weibo-time, [class*="time"], [class*="from"]');
                    const contentElement = item.querySelector('.Feed_body-content, .WB_text, .weibo-content, [class*="content"]');
                    
                    const title = titleElement?.textContent?.trim() || '';
                    const author = authorElement?.textContent?.trim() || '';
                    const time = timeElement?.textContent?.trim() || '';
                    const content = contentElement?.textContent?.trim() || '';
                    
                    // 提取链接
                    const linkElements = item.querySelectorAll('a[href*="weibo.com"]');
                    const links = Array.from(linkElements).map(link => ({
                        url: link.href,
                        text: link.textContent?.trim() || ''
                    })).filter(link => link.url && link.url.includes('weibo.com'));
                    
                    // 提取图片
                    const imageElements = item.querySelectorAll('img[src*="jpg"], img[src*="png"], img[src*="jpeg"]');
                    const images = Array.from(imageElements).map(img => ({
                        url: img.src,
                        alt: img.alt || ''
                    })).filter(img => img.url && !img.url.includes('avatar') && !img.url.includes('head'));
                    
                    // 提取统计数据
                    const statsElement = item.querySelector('.Feed_body-action, .WB_handle, .weibo-actions, [class*="action"], [class*="handle"]');
                    const statsText = statsElement?.textContent || '';
                    
                    const repostMatch = statsText.match(/转发\s*(\d+)/);
                    const commentMatch = statsText.match(/评论\s*(\d+)/);
                    const likeMatch = statsText.match(/赞\s*(\d+)/);
                    
                    const repostCount = repostMatch ? parseInt(repostMatch[1]) : 0;
                    const commentCount = commentMatch ? parseInt(commentMatch[1]) : 0;
                    const likeCount = likeMatch ? parseInt(likeMatch[1]) : 0;
                    
                    // 只保存有内容的微博
                    if (title || content) {
                        posts.push({
                            id: `post_${Date.now()}_${index}`,
                            title,
                            author: { name: author },
                            publishTime: time,
                            content: content || title,
                            links,
                            images,
                            repostCount,
                            commentCount,
                            likeCount,
                            elementId: item.id || `item_${index}`
                        });
                    }
                } catch (e) {
                    console.warn('提取微博时出错:', e);
                }
            });
            
            return posts;
        });
    }

    mergePosts(existingPosts, newPosts) {
        const existingIds = new Set(existingPosts.map(p => p.id));
        const uniqueNewPosts = newPosts.filter(p => !existingIds.has(p.id));
        return [...existingPosts, ...uniqueNewPosts];
    }

    async capturePostDetail(post, index) {
        try {
            // 截图
            const screenshotPath = path.join(this.outputDir, 'screenshots', `post_${index + 1}_${post.id}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: false });
            
            // 查找并点击评论按钮展开评论
            try {
                const commentButton = await this.page.evaluateHandle((postId) => {
                    // 查找该微博的评论按钮
                    const postElement = document.getElementById(postId) || document.querySelector(`[data-post-id="${postId}"]`);
                    if (postElement) {
                        const commentBtn = postElement.querySelector('button:contains("评论"), .WB_handle a:contains("评论"), [class*="comment"]');
                        return commentBtn;
                    }
                    
                    // 如果找不到特定元素，查找所有评论按钮
                    const allCommentButtons = document.querySelectorAll('button, a');
                    for (const btn of allCommentButtons) {
                        if (btn.textContent && btn.textContent.includes('评论')) {
                            return btn;
                        }
                    }
                    return null;
                }, post.elementId);
                
                if (commentButton && await commentButton.asElement() !== null) {
                    await commentButton.click();
                    await this.page.waitForTimeout(2000);
                    
                    // 提取评论
                    const comments = await this.extractComments();
                    post.comments = comments;
                }
            } catch (e) {
                console.log(`展开评论失败: ${e.message}`);
            }
            
            // 下载图片
            const savedImages = [];
            for (let i = 0; i < Math.min(post.images.length, 5); i++) {
                try {
                    const imagePath = path.join(this.outputDir, 'images', `post_${index + 1}_img_${i + 1}.jpg`);
                    
                    // 使用页面的fetch API下载图片
                    const imageBuffer = await this.page.evaluate(async (imageUrl) => {
                        try {
                            const response = await fetch(imageUrl);
                            const arrayBuffer = await response.arrayBuffer();
                            return Array.from(new Uint8Array(arrayBuffer));
                        } catch (e) {
                            return null;
                        }
                    }, post.images[i].url);
                    
                    if (imageBuffer) {
                        await fs.writeFile(imagePath, Buffer.from(imageBuffer));
                        
                        savedImages.push({
                            originalUrl: post.images[i].url,
                            localPath: imagePath,
                            filename: `post_${index + 1}_img_${i + 1}.jpg`
                        });
                    }
                } catch (e) {
                    console.warn(`保存图片失败: ${post.images[i].url}`);
                }
            }
            
            return {
                ...post,
                screenshot: screenshotPath,
                savedImages,
                captureTime: new Date().toISOString(),
                captureIndex: index + 1
            };
            
        } catch (error) {
            console.warn(`捕获微博详情失败: ${post.id}`, error);
            return {
                ...post,
                captureTime: new Date().toISOString(),
                captureIndex: index + 1,
                error: error.message
            };
        }
    }

    async extractComments() {
        return await this.page.evaluate(() => {
            const comments = [];
            
            // 尝试多种选择器来找到评论元素
            const commentSelectors = [
                '.WB_comment',
                '.weibo-comment',
                '.comment-item',
                '[class*="comment"]',
                '.woo-box-flex.woo-box-alignCenter.comment-item'
            ];
            
            let commentElements = [];
            for (const selector of commentSelectors) {
                commentElements = document.querySelectorAll(selector);
                if (commentElements.length > 0) {
                    break;
                }
            }
            
            commentElements.forEach((comment, index) => {
                try {
                    const authorElement = comment.querySelector('.WB_name, .comment-author, [class*="name"], [class*="author"]');
                    const contentElement = comment.querySelector('.WB_text, .comment-content, [class*="content"], [class*="text"]');
                    const timeElement = comment.querySelector('.WB_from, .comment-time, [class*="time"], [class*="from"]');
                    
                    const author = authorElement?.textContent?.trim() || '';
                    const content = contentElement?.textContent?.trim() || '';
                    const time = timeElement?.textContent?.trim() || '';
                    
                    if (content) {
                        comments.push({
                            id: `comment_${index}`,
                            author: { name: author },
                            content,
                            publishTime: time
                        });
                    }
                } catch (e) {
                    // 忽略单个评论提取错误
                }
            });
            
            return comments.slice(0, 10); // 最多10条评论
        });
    }

    async saveResults() {
        console.log('💾 保存捕获结果...');
        
        // 保存每条微博的详细信息
        for (let i = 0; i < this.results.posts.length; i++) {
            const post = this.results.posts[i];
            const postFilename = `post_${i + 1}_${post.id}.json`;
            const postPath = path.join(this.outputDir, 'posts', postFilename);
            
            await fs.writeFile(postPath, JSON.stringify(post, null, 2), 'utf8');
        }
        
        // 保存完整结果
        const resultsPath = path.join(this.outputDir, 'weibo_posts_complete.json');
        await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        console.log(`✅ 已保存 ${this.results.posts.length} 条微博到 ${this.outputDir}/posts/`);
        console.log(`✅ 完整结果保存在: ${resultsPath}`);
    }

    async generateSummaryReport() {
        console.log('📊 生成汇总报告...');
        
        const report = {
            summary: this.results.summary,
            posts: this.results.posts.map((post, index) => ({
                index: index + 1,
                id: post.id,
                title: post.title,
                author: post.author,
                publishTime: post.publishTime,
                contentLength: post.content?.length || 0,
                imageCount: post.images?.length || 0,
                savedImageCount: post.savedImages?.length || 0,
                linkCount: post.links?.length || 0,
                commentCount: post.comments?.length || 0,
                repostCount: post.repostCount,
                likeCount: post.likeCount,
                hasScreenshot: !!post.screenshot,
                filePath: `posts/post_${index + 1}_${post.id}.json`
            })),
            statistics: {
                authors: [...new Set(this.results.posts.map(p => p.author.name))].length,
                totalCharacters: this.results.posts.reduce((sum, p) => sum + (p.content?.length || 0), 0),
                averageImagesPerPost: (this.results.summary.totalImages / this.results.posts.length).toFixed(2),
                averageLinksPerPost: (this.results.summary.totalLinks / this.results.posts.length).toFixed(2),
                averageCommentsPerPost: (this.results.posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0) / this.results.posts.length).toFixed(2),
                postsWithScreenshots: this.results.posts.filter(p => p.screenshot).length,
                postsWithImages: this.results.posts.filter(p => p.savedImages && p.savedImages.length > 0).length,
                postsWithComments: this.results.posts.filter(p => p.comments && p.comments.length > 0).length
            }
        };
        
        const reportPath = path.join(this.outputDir, 'weibo_summary_report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
        
        // 生成简单HTML报告
        await this.generateHtmlReport(report);
        
        console.log(`✅ 汇总报告已生成: ${reportPath}`);
    }

    async generateHtmlReport(report) {
        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>微博首页捕获报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #e6162d; text-align: center; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; border-radius: 8px; padding: 15px; text-align: center; }
        .stat-value { font-size: 1.5em; font-weight: bold; color: #e6162d; }
        .post-item { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; }
        .post-title { font-weight: bold; color: #333; margin-bottom: 5px; }
        .post-content { color: #666; margin: 10px 0; }
        .post-stats { display: flex; gap: 15px; color: #888; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 微博首页捕获报告</h1>
        <div class="stats">
            <div class="stat-card"><div class="stat-value">${report.summary.totalPosts}</div><div>微博总数</div></div>
            <div class="stat-card"><div class="stat-value">${report.summary.totalImages}</div><div>图片总数</div></div>
            <div class="stat-card"><div class="stat-value">${report.summary.totalLinks}</div><div>链接总数</div></div>
            <div class="stat-card"><div class="stat-value">${report.statistics.authors}</div><div>作者数量</div></div>
        </div>
        <div>
            <h2>📝 微博列表</h2>
            ${report.posts.slice(0, 10).map(post => `
                <div class="post-item">
                    <div class="post-title">${post.title || '无标题'}</div>
                    <div class="post-content">${post.content ? post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '') : '无内容'}</div>
                    <div class="post-stats">
                        <span>👤 ${post.author.name}</span>
                        <span>🖼️ ${post.imageCount}图</span>
                        <span>🔗 ${post.linkCount}链</span>
                        <span>💬 ${post.commentCount}评</span>
                    </div>
                </div>
            `).join('')}
            ${report.posts.length > 10 ? `<p>... 还有 ${report.posts.length - 10} 条微博，请查看完整报告文件</p>` : ''}
        </div>
    </div>
</body>
</html>`;
        
        const htmlPath = path.join(this.outputDir, 'weibo_report.html');
        await fs.writeFile(htmlPath, html, 'utf8');
        
        console.log(`✅ HTML报告已生成: ${htmlPath}`);
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
    const capture = new WeiboHomepageCapture();
    
    try {
        await capture.initialize();
        await capture.execute();
        
        console.log('\n🎉 测试完成！');
        console.log(`📁 结果保存在: ${capture.outputDir}`);
        console.log(`📄 主要文件:`);
        console.log(`   - weibo_posts_complete.json (完整数据)`);
        console.log(`   - weibo_summary_report.json (汇总报告)`);
        console.log(`   - weibo_report.html (可视化报告)`);
        console.log(`   - posts/ (每条微博的详细信息)`);
        console.log(`   - images/ (捕获的图片)`);
        console.log(`   - screenshots/ (页面截图)`);
        
        console.log(`\n📊 捕获统计:`);
        console.log(`   - 微博总数: ${capture.results.summary.totalPosts}`);
        console.log(`   - 图片总数: ${capture.results.summary.totalImages}`);
        console.log(`   - 链接总数: ${capture.results.summary.totalLinks}`);
        console.log(`   - 执行时间: ${capture.results.summary.duration}ms`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    } finally {
        await capture.cleanup();
    }
}

// 运行测试
if (require.main === module) {
    main();
}

module.exports = WeiboHomepageCapture;