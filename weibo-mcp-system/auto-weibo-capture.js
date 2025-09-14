#!/usr/bin/env node

/**
 * 自动微博首页捕获测试
 * 使用现有cookie，无需用户交互
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs-extra');

// 使用基本的puppeteer

class AutoWeiboCapture {
    constructor() {
        this.outputDir = path.join(__dirname, 'output', 'auto-weibo-capture');
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
        console.log('🚀 初始化自动微博捕获测试...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        await fs.ensureDir(path.join(this.outputDir, 'posts'));
        await fs.ensureDir(path.join(this.outputDir, 'images'));
        
        console.log(`📁 输出目录: ${this.outputDir}`);
        
        // 启动浏览器
        this.browser = await puppeteer.launch({
            headless: true, // 无头模式
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        // 创建新页面
        this.page = await this.browser.newPage();
        
        // 设置视口
        await this.page.setViewport({ width: 1920, height: 1080 });
        
        // 设置用户代理
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 加载微博cookie
        await this.loadWeiboCookies();
        
        console.log('✅ 初始化完成');
    }

    async loadWeiboCookies() {
        try {
            const cookieFile = '/Users/fanzhang/Documents/github/webauto/cookies/weibo.com.json';
            
            if (await fs.pathExists(cookieFile)) {
                console.log(`🍪 加载微博cookie: ${cookieFile}`);
                
                const cookies = await fs.readJson(cookieFile);
                
                // 转换cookie格式为puppeteer格式
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
                
                // 设置cookie
                await this.page.setCookie(...puppeteerCookies);
                console.log(`✅ 成功加载 ${cookies.length} 个微博cookie`);
            } else {
                console.log('⚠️ 未找到微博cookie文件');
            }
            
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
            
            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 检查登录状态
            const isLoggedIn = await this.page.evaluate(() => {
                // 检查是否有登录按钮或登录提示
                const loginElements = document.querySelectorAll('a[href*="login"], .login_btn, .gn_login, .woo-modal-main');
                return loginElements.length === 0;
            });
            
            if (!isLoggedIn) {
                console.log('❌ 未登录，无法继续执行');
                return null;
            }
            
            console.log('✅ 已登录微博，开始捕获内容...');
            
            // 滚动加载更多内容
            let posts = [];
            let scrollAttempts = 0;
            const maxScrollAttempts = 15;
            
            while (posts.length < 30 && scrollAttempts < maxScrollAttempts) { // 减少到30条以加快速度
                console.log(`📜 滚动加载第 ${scrollAttempts + 1} 次，当前 ${posts.length} 条微博...`);
                
                // 滚动到底部
                await this.page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                // 等待新内容加载
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 提取微博内容
                const newPosts = await this.extractPosts();
                posts = this.mergePosts(posts, newPosts);
                
                scrollAttempts++;
            }
            
            // 限制为30条
            posts = posts.slice(0, 30);
            
            console.log(`✅ 成功提取 ${posts.length} 条微博`);
            
            // 捕获每条微博的详细内容
            for (let i = 0; i < posts.length; i++) {
                console.log(`📝 处理微博 ${i + 1}/${posts.length}: ${posts[i].title?.substring(0, 50)}...`);
                
                const postDetail = await this.capturePostDetail(posts[i], i);
                this.results.posts.push(postDetail);
                
                // 添加延迟避免被检测
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            this.results.summary.endTime = new Date();
            this.results.summary.duration = this.results.summary.endTime - this.results.summary.startTime;
            this.results.summary.totalPosts = posts.length;
            this.results.summary.totalImages = this.results.posts.reduce((sum, p) => sum + (p.images?.length || 0), 0);
            this.results.summary.totalLinks = this.results.posts.reduce((sum, p) => sum + (p.links?.length || 0), 0);
            
            console.log('🎉 任务执行完成！');
            
            // 保存结果
            await this.saveResults();
            
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
                '[class*="Feed"]',
                '[class*="weibo"]',
                'article'
            ];
            
            let feedItems = [];
            for (const selector of selectors) {
                feedItems = document.querySelectorAll(selector);
                if (feedItems.length > 0) {
                    break;
                }
            }
            
            feedItems.forEach((item, index) => {
                try {
                    // 使用多种选择器来提取内容
                    const titleElement = item.querySelector('.Feed_body-title, .WB_text, .weibo-text, [class*="text"]');
                    const authorElement = item.querySelector('.Feed_body-author-name, .WB_name, .weibo-author, [class*="name"]');
                    const timeElement = item.querySelector('.Feed_body-time, .WB_from, .weibo-time, [class*="time"]');
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
                    })).filter(img => img.url && !img.url.includes('avatar'));
                    
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
                            elementId: item.id || `item_${index}`
                        });
                    }
                } catch (e) {
                    // 忽略单个微博提取错误
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
            // 下载图片
            const savedImages = [];
            for (let i = 0; i < Math.min(post.images.length, 3); i++) { // 限制最多3张图片
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

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🧹 清理完成');
    }
}

// 主执行函数
async function main() {
    const capture = new AutoWeiboCapture();
    
    try {
        await capture.initialize();
        const results = await capture.execute();
        
        if (results) {
            console.log('\n🎉 测试完成！');
            console.log(`📁 结果保存在: ${capture.outputDir}`);
            console.log(`📊 捕获统计:`);
            console.log(`   - 微博总数: ${results.summary.totalPosts}`);
            console.log(`   - 图片总数: ${results.summary.totalImages}`);
            console.log(`   - 链接总数: ${results.summary.totalLinks}`);
            console.log(`   - 执行时间: ${results.summary.duration}ms`);
            
            console.log(`\n📄 主要文件:`);
            console.log(`   - weibo_posts_complete.json (完整数据)`);
            console.log(`   - posts/ (每条微博的详细信息)`);
            console.log(`   - images/ (捕获的图片)`);
        } else {
            console.log('❌ 测试失败：未登录微博');
        }
        
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

module.exports = AutoWeiboCapture;