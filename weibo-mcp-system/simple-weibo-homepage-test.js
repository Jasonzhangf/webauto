#!/usr/bin/env node

/**
 * 简化版微博首页捕获测试
 * 使用现有功能直接实现
 */

const path = require('path');
const fs = require('fs-extra');
const { CamoufoxManager } = require('./dist/managers/CamoufoxManager');
const { ContentCapturer } = require('webauto-content-capturer');

class SimpleWeiboHomepageTest {
    constructor() {
        this.outputDir = path.join(__dirname, 'output', 'weibo-homepage-capture');
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
    }

    async initialize() {
        console.log('🚀 初始化简化版微博首页捕获测试...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        await fs.ensureDir(path.join(this.outputDir, 'posts'));
        await fs.ensureDir(path.join(this.outputDir, 'images'));
        await fs.ensureDir(path.join(this.outputDir, 'screenshots'));
        
        console.log(`📁 输出目录: ${this.outputDir}`);
        
        // 初始化浏览器管理器
        this.browserManager = new CamoufoxManager({
            headless: false,
            stealth: true,
            viewport: { width: 1920, height: 1080 }
        });
        
        // 初始化内容捕获器
        this.contentCapturer = new ContentCapturer({
            captureImages: true,
            captureScreenshots: true,
            outputDir: this.outputDir
        });
        
        await this.browserManager.initialize();
        await this.contentCapturer.initialize();
        
        console.log('✅ 初始化完成');
    }

    async execute() {
        try {
            this.results.summary.startTime = new Date();
            console.log('🎯 开始执行微博首页捕获任务...');
            
            // 创建浏览器页面
            const page = await this.browserManager.createPage();
            
            // 访问微博首页
            console.log('🌐 访问微博首页...');
            await page.goto('https://weibo.com', { waitUntil: 'networkidle2' });
            
            // 检查是否需要登录
            const loginRequired = await page.$('a[href*="login"], .login_btn, .gn_login');
            if (loginRequired) {
                console.log('🔐 需要登录微博');
                console.log('请手动完成登录，然后按 Enter 继续...');
                
                // 等待用户手动登录
                await new Promise(resolve => {
                    process.stdin.once('data', resolve);
                });
                
                // 刷新页面
                await page.reload({ waitUntil: 'networkidle2' });
            }
            
            console.log('✅ 已登录微博，开始捕获内容...');
            
            // 滚动加载更多内容
            let posts = [];
            let scrollAttempts = 0;
            const maxScrollAttempts = 20;
            
            while (posts.length < 50 && scrollAttempts < maxScrollAttempts) {
                console.log(`📜 滚动加载第 ${scrollAttempts + 1} 次，当前 ${posts.length} 条微博...`);
                
                // 滚动到底部
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                // 等待新内容加载
                await page.waitForTimeout(2000);
                
                // 提取微博内容
                const newPosts = await this.extractPosts(page);
                posts = this.mergePosts(posts, newPosts);
                
                scrollAttempts++;
            }
            
            // 限制为50条
            posts = posts.slice(0, 50);
            
            console.log(`✅ 成功提取 ${posts.length} 条微博`);
            
            // 捕获每条微博的详细内容
            for (let i = 0; i < posts.length; i++) {
                console.log(`📝 捕获微博 ${i + 1}/${posts.length}: ${posts[i].title?.substring(0, 50)}...`);
                
                const postDetail = await this.capturePostDetail(page, posts[i], i);
                this.results.posts.push(postDetail);
                
                // 添加延迟避免被检测
                await page.waitForTimeout(1000);
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
            
            // 关闭页面
            await page.close();
            
            return this.results;
            
        } catch (error) {
            console.error('❌ 任务执行失败:', error);
            throw error;
        }
    }

    async extractPosts(page) {
        return await page.evaluate(() => {
            const posts = [];
            const feedItems = document.querySelectorAll('.Feed_body, .WB_feed, .weibo-post');
            
            feedItems.forEach((item, index) => {
                try {
                    const titleElement = item.querySelector('.Feed_body-title, .WB_text, .weibo-text');
                    const authorElement = item.querySelector('.Feed_body-author-name, .WB_name, .weibo-author');
                    const timeElement = item.querySelector('.Feed_body-time, .WB_from, .weibo-time');
                    const contentElement = item.querySelector('.Feed_body-content, .WB_text, .weibo-content');
                    const linkElements = item.querySelectorAll('a[href*="weibo.com"]');
                    const imageElements = item.querySelectorAll('img[src*="jpg"], img[src*="png"]');
                    
                    const title = titleElement?.textContent?.trim() || '';
                    const author = authorElement?.textContent?.trim() || '';
                    const time = timeElement?.textContent?.trim() || '';
                    const content = contentElement?.textContent?.trim() || '';
                    
                    const links = Array.from(linkElements).map(link => ({
                        url: link.href,
                        text: link.textContent?.trim() || ''
                    })).filter(link => link.url && link.url.includes('weibo.com'));
                    
                    const images = Array.from(imageElements).map(img => ({
                        url: img.src,
                        alt: img.alt || ''
                    })).filter(img => img.url && !img.url.includes('avatar'));
                    
                    const statsElement = item.querySelector('.Feed_body-action, .WB_handle, .weibo-actions');
                    const repostCount = this.extractStat(statsElement, '转发');
                    const commentCount = this.extractStat(statsElement, '评论');
                    const likeCount = this.extractStat(statsElement, '赞');
                    
                    if (title || content) {
                        posts.push({
                            id: `post_${Date.now()}_${index}`,
                            title,
                            author: { name: author },
                            publishTime: time,
                            content,
                            links,
                            images,
                            repostCount,
                            commentCount,
                            likeCount,
                            element: item.outerHTML.substring(0, 500) // 保存部分HTML用于定位
                        });
                    }
                } catch (e) {
                    console.warn('提取微博时出错:', e);
                }
            });
            
            return posts;
        });
    }

    extractStat(element, keyword) {
        if (!element) return 0;
        const text = element.textContent || '';
        const match = text.match(new RegExp(`${keyword}\\s*(\\d+)`));
        return match ? parseInt(match[1]) : 0;
    }

    mergePosts(existingPosts, newPosts) {
        const existingIds = new Set(existingPosts.map(p => p.id));
        const uniqueNewPosts = newPosts.filter(p => !existingIds.has(p.id));
        return [...existingPosts, ...uniqueNewPosts];
    }

    async capturePostDetail(page, post, index) {
        try {
            // 截图
            const screenshotPath = path.join(this.outputDir, 'screenshots', `post_${index + 1}_${post.id}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            
            // 查找并点击评论按钮展开评论
            const commentButton = await page.$('button:has-text("评论"), .WB_handle a:has-text("评论"), .weibo-action-comment');
            if (commentButton) {
                await commentButton.click();
                await page.waitForTimeout(2000);
                
                // 提取评论
                const comments = await this.extractComments(page);
                post.comments = comments;
            }
            
            // 下载图片
            const savedImages = [];
            for (let i = 0; i < Math.min(post.images.length, 5); i++) { // 限制最多5张图片
                try {
                    const imagePath = path.join(this.outputDir, 'images', `post_${index + 1}_img_${i + 1}.jpg`);
                    const response = await page.goto(post.images[i].url);
                    const buffer = await response.buffer();
                    await fs.writeFile(imagePath, buffer);
                    
                    savedImages.push({
                        originalUrl: post.images[i].url,
                        localPath: imagePath,
                        filename: `post_${index + 1}_img_${i + 1}.jpg`
                    });
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

    async extractComments(page) {
        return await page.evaluate(() => {
            const comments = [];
            const commentElements = document.querySelectorAll('.WB_comment, .weibo-comment, .comment-item');
            
            commentElements.forEach((comment, index) => {
                try {
                    const authorElement = comment.querySelector('.WB_name, .comment-author');
                    const contentElement = comment.querySelector('.WB_text, .comment-content');
                    const timeElement = comment.querySelector('.WB_from, .comment-time');
                    
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
            
            return comments.slice(0, 20); // 最多20条评论
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
        
        console.log(`✅ 汇总报告已生成: ${reportPath}`);
    }

    async cleanup() {
        if (this.browserManager) {
            await this.browserManager.shutdown();
        }
        if (this.contentCapturer) {
            await this.contentCapturer.shutdown();
        }
        console.log('🧹 清理完成');
    }
}

// 主执行函数
async function main() {
    const test = new SimpleWeiboHomepageTest();
    
    try {
        await test.initialize();
        await test.execute();
        
        console.log('\n🎉 测试完成！');
        console.log(`📁 结果保存在: ${test.outputDir}`);
        console.log(`📄 主要文件:`);
        console.log(`   - weibo_posts_complete.json (完整数据)`);
        console.log(`   - weibo_summary_report.json (汇总报告)`);
        console.log(`   - posts/ (每条微博的详细信息)`);
        console.log(`   - images/ (捕获的图片)`);
        console.log(`   - screenshots/ (页面截图)`);
        
        console.log(`\n📊 捕获统计:`);
        console.log(`   - 微博总数: ${test.results.summary.totalPosts}`);
        console.log(`   - 图片总数: ${test.results.summary.totalImages}`);
        console.log(`   - 链接总数: ${test.results.summary.totalLinks}`);
        console.log(`   - 执行时间: ${test.results.summary.duration}ms`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    } finally {
        await test.cleanup();
    }
}

// 运行测试
if (require.main === module) {
    main();
}

module.exports = SimpleWeiboHomepageTest;