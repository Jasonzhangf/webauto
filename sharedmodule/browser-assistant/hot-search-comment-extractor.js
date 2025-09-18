#!/usr/bin/env node

/**
 * 微博热搜评论提取工具
 * 从热搜榜中找到高评论微博并提取评论
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

class WeiboHotSearchCommentExtractor {
    constructor() {
        this.outputDir = path.join(process.env.HOME || '~', '.webauto', 'hot-search-comments');
        this.results = {
            hotSearchItems: [],
            processedPosts: [],
            totalComments: 0,
            startTime: null,
            endTime: null
        };
        this.browser = null;
    }

    async initialize() {
        console.log('🚀 初始化微博热搜评论提取工具...');
        
        // 创建输出目录
        await fs.ensureDir(this.outputDir);
        
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
        
        this.results.startTime = new Date();
        console.log('✅ 初始化完成');
    }

    async extractHotSearchComments() {
        console.log('🔥 开始提取微博热搜评论...');
        
        const page = await this.browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 加载微博cookie
        await this.loadCookies(page);
        
        try {
            // 访问微博热搜页面
            await page.goto('https://weibo.com/hot/weibo/102803', { waitUntil: 'networkidle2', timeout: 30000 });
            
            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 提取热搜榜信息
            await this.extractHotSearchList(page);
            
            // 选择前5个热搜进行深度评论提取
            const topHotSearches = this.results.hotSearchItems.slice(0, 5);
            
            for (let i = 0; i < topHotSearches.length; i++) {
                const hotSearch = topHotSearches[i];
                console.log(`\n📊 处理热搜 ${i + 1}/${topHotSearches.length}: ${hotSearch.title}`);
                
                // 尝试找到该热搜的微博链接
                const postLinks = await this.findPostLinksForHotSearch(page, hotSearch);
                
                if (postLinks.length > 0) {
                    // 选择第一个微博链接进行评论提取
                    const postLink = postLinks[0];
                    await this.extractCommentsFromPost(page, postLink, hotSearch);
                    
                    // 避免过于频繁的请求
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    console.log(`⚠️ 未找到热搜 "${hotSearch.title}" 的微博链接`);
                }
            }
            
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

    async extractHotSearchList(page) {
        console.log('📋 提取热搜榜信息...');
        
        const hotSearchItems = await page.evaluate(() => {
            const items = [];
            
            // 尝试多种热搜选择器
            const selectors = [
                '.hot-search-item',
                '.search-item',
                '[class*="hot"]',
                '[class*="search"]',
                'a[href*="hot"]',
                '.td-02',
                '.list-item'
            ];
            
            let foundElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    foundElements = elements;
                    console.log(`找到 ${elements.length} 个热搜元素，使用选择器: ${selector}`);
                    break;
                }
            }
            
            foundElements.forEach((element, index) => {
                try {
                    const titleElement = element.querySelector('a, .title, [class*="title"]') || element;
                    const title = titleElement?.textContent?.trim() || '';
                    const link = titleElement?.href || '';
                    const heatElement = element.querySelector('.heat, .num, [class*="heat"], [class*="num"]');
                    const heat = heatElement?.textContent?.trim() || '';
                    
                    if (title && title.length > 2) {
                        items.push({
                            rank: index + 1,
                            title: title,
                            link: link,
                            heat: heat,
                            index: index
                        });
                    }
                } catch (e) {
                    // 忽略单个元素提取错误
                }
            });
            
            return items;
        });
        
        this.results.hotSearchItems = hotSearchItems;
        console.log(`✅ 提取了 ${hotSearchItems.length} 个热搜项目`);
        
        // 显示前10个热搜
        console.log('\n🔥 当前热搜榜 Top 10:');
        hotSearchItems.slice(0, 10).forEach((item, index) => {
            console.log(`${index + 1}. ${item.title} (${item.heat})`);
        });
    }

    async findPostLinksForHotSearch(page, hotSearch) {
        console.log(`🔍 搜索热搜 "${hotSearch.title}" 的微博...`);
        
        // 方法1: 点击热搜链接
        try {
            await page.evaluate((title) => {
                // 查找包含标题的链接
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    if (link.textContent.includes(title)) {
                        link.click();
                        break;
                    }
                }
            }, hotSearch.title);
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 检查是否有微博出现
            const postLinks = await page.evaluate(() => {
                const postElements = document.querySelectorAll('.Feed_body, .weibo-post, [class*="post"], [class*="feed"]');
                return Array.from(postElements).map(el => {
                    const link = el.querySelector('a')?.href || '';
                    return link;
                }).filter(link => link && link.includes('weibo.com'));
            });
            
            if (postLinks.length > 0) {
                return postLinks;
            }
            
            // 如果没有找到，返回原页面
            await page.goBack();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.warn('点击热搜链接失败:', error.message);
        }
        
        // 方法2: 搜索相关微博
        try {
            const searchUrl = `https://weibo.com/search?q=${encodeURIComponent(hotSearch.title)}`;
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const postLinks = await page.evaluate(() => {
                const postElements = document.querySelectorAll('.Feed_body, .weibo-post, [class*="post"], [class*="feed"]');
                return Array.from(postElements).map(el => {
                    const link = el.querySelector('a')?.href || '';
                    return link;
                }).filter(link => link && link.includes('weibo.com'));
            });
            
            // 返回原页面
            await page.goto('https://weibo.com/hot/weibo/102803', { waitUntil: 'networkidle2', timeout: 20000 });
            
            return postLinks;
            
        } catch (error) {
            console.warn('搜索微博失败:', error.message);
        }
        
        return [];
    }

    async extractCommentsFromPost(page, postLink, hotSearch) {
        console.log(`💬 提取微博评论: ${postLink}`);
        
        try {
            // 创建新页面处理微博
            const postPage = await this.browser.newPage();
            await postPage.setViewport({ width: 1920, height: 1080 });
            
            // 加载cookie
            await this.loadCookies(postPage);
            
            // 访问微博页面
            await postPage.goto(postLink, { waitUntil: 'networkidle2', timeout: 20000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 提取微博信息
            const postInfo = await postPage.evaluate(() => {
                const authorElement = document.querySelector('.author, .user-name, [class*="author"], [class*="name"]');
                const contentElement = document.querySelector('.content, .text, .WB_text, [class*="content"]');
                
                return {
                    author: authorElement?.textContent?.trim() || '',
                    content: contentElement?.textContent?.trim() || ''
                };
            });
            
            // 尝试展开评论
            await this.expandComments(postPage);
            
            // 提取评论
            const comments = await this.extractComments(postPage);
            
            const postResult = {
                hotSearchTitle: hotSearch.title,
                hotSearchRank: hotSearch.rank,
                postLink: postLink,
                postAuthor: postInfo.author,
                postContent: postInfo.content,
                comments: comments,
                commentCount: comments.length
            };
            
            this.results.processedPosts.push(postResult);
            this.results.totalComments += comments.length;
            
            console.log(`✅ 提取了 ${comments.length} 条评论`);
            
            await postPage.close();
            
        } catch (error) {
            console.error(`❌ 提取微博评论失败: ${error.message}`);
        }
    }

    async expandComments(page) {
        console.log('🔽 展开评论...');
        
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a');
                buttons.forEach(btn => {
                    const text = btn.textContent || '';
                    if (text.includes('展开') || text.includes('评论') || text.includes('更多')) {
                        btn.click();
                    }
                });
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 滚动加载
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async extractComments(page) {
        const comments = await page.evaluate(() => {
            const comments = [];
            
            // 尝试多种评论选择器
            const selectors = [
                '.WB_comment',
                '.comment-item',
                '.weibo-comment',
                '[class*="comment"]'
            ];
            
            let commentElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    commentElements = elements;
                    break;
                }
            }
            
            commentElements.forEach((element, index) => {
                try {
                    const authorElement = element.querySelector('.WB_name, .author, [class*="author"], [class*="name"]');
                    const contentElement = element.querySelector('.WB_text, .content, [class*="content"], [class*="text"]');
                    const timeElement = element.querySelector('.WB_from, .time, [class*="time"]');
                    
                    const author = authorElement?.textContent?.trim() || '';
                    const content = contentElement?.textContent?.trim() || '';
                    const time = timeElement?.textContent?.trim() || '';
                    
                    if (content && author && content.length > 2) {
                        comments.push({
                            id: `comment_${index}`,
                            author: { name: author },
                            content: content,
                            publishTime: time,
                            index: index + 1
                        });
                    }
                } catch (e) {
                    // 忽略单个评论提取错误
                }
            });
            
            return comments;
        });
        
        return comments;
    }

    async saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(this.outputDir, `hot-search-comments-${timestamp}.md`);
        const dataPath = path.join(this.outputDir, `hot-search-comments-${timestamp}.json`);
        
        this.results.endTime = new Date();
        const duration = (this.results.endTime - this.results.startTime) / 1000;
        
        // 生成报告
        const report = `# 微博热搜评论分析报告

## 📊 基本统计
- **提取时间:** ${this.results.startTime.toLocaleString()}
- **处理耗时:** ${duration.toFixed(1)} 秒
- **热搜项目数:** ${this.results.hotSearchItems.length}
- **处理的微博数:** ${this.results.processedPosts.length}
- **总评论数:** ${this.results.totalComments}

## 🔥 热搜榜 Top 10
${this.results.hotSearchItems.slice(0, 10).map((item, index) => 
    `${index + 1}. **${item.title}** (${item.heat})`
).join('\n')}

---

## 📝 详细分析

${this.results.processedPosts.map((post, index) => `
### ${index + 1}. ${post.hotSearchTitle} (排名第${post.hotSearchRank})

**微博链接:** ${post.postLink}
**微博作者:** ${post.postAuthor}
**评论数量:** ${post.commentCount}

**微博内容:**
${post.postContent}

**热门评论:**
${post.comments.slice(0, 3).map(comment => `
- **${comment.author.name}:** ${comment.content}
`).join('')}

---
`).join('')}

## 📈 总结分析

### 评论数量分布
${this.results.processedPosts.map(post => 
    `- ${post.hotSearchTitle}: ${post.commentCount} 条评论`
).join('\n')}

### 平均评论数
${this.results.processedPosts.length > 0 ? 
    `平均每条微博: ${(this.results.totalComments / this.results.processedPosts.length).toFixed(1)} 条评论` : 
    '无数据'}

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 微博热搜评论提取工具 v1.0`;

        await fs.writeFile(reportPath, report, 'utf8');
        await fs.writeFile(dataPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        console.log(`\n📄 分析报告已保存: ${reportPath}`);
        console.log(`📄 原始数据已保存: ${dataPath}`);
        
        return reportPath;
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
    const extractor = new WeiboHotSearchCommentExtractor();
    
    try {
        await extractor.initialize();
        await extractor.extractHotSearchComments();
        
        // 保存结果
        const resultPath = await extractor.saveResults();
        
        console.log('\n🎉 微博热搜评论提取完成！');
        console.log(`📊 处理了 ${extractor.results.processedPosts.length} 个热搜微博`);
        console.log(`💬 总共提取了 ${extractor.results.totalComments} 条评论`);
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

module.exports = WeiboHotSearchCommentExtractor;