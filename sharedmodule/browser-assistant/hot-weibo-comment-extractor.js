#!/usr/bin/env node

/**
 * 微博热门评论提取工具
 * 专门用于提取热门微博的大量评论
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

class HotWeiboCommentExtractor {
    constructor() {
        this.outputDir = path.join(process.env.HOME || '~', '.webauto', 'hot-weibo-comments');
        this.results = {
            url: '',
            title: '',
            author: '',
            content: '',
            comments: [],
            startTime: null,
            endTime: null
        };
        this.browser = null;
    }

    async initialize() {
        console.log('🚀 初始化微博热门评论提取工具...');
        
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

    async extractHotWeiboComments(url) {
        console.log(`🔍 开始提取热门微博评论: ${url}`);
        this.results.url = url;
        
        const page = await this.browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 加载微博cookie
        await this.loadCookies(page);
        
        try {
            // 访问热门微博页面
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 检查是否需要登录
            const loginRequired = await page.evaluate(() => {
                return document.querySelector('a[href*="login"], .login_btn') !== null;
            });
            
            if (loginRequired) {
                console.log('⚠️ 需要登录，请手动登录后继续...');
                // 等待用户手动登录
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
            
            // 提取微博基本信息
            await this.extractPostInfo(page);
            
            // 多次展开评论并加载更多
            await this.expandAllComments(page);
            
            // 提取评论
            await this.extractComments(page);
            
            console.log(`✅ 成功提取 ${this.results.comments.length} 条评论`);
            
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
        
        console.log(`📝 微博标题: ${postInfo.title}`);
        console.log(`👤 作者: ${postInfo.author}`);
        console.log(`📄 内容长度: ${postInfo.content.length} 字符`);
    }

    async expandAllComments(page) {
        console.log('🔽 展开所有评论...');
        
        // 多次尝试展开评论
        for (let round = 0; round < 5; round++) {
            console.log(`第 ${round + 1} 轮展开评论...`);
            
            await page.evaluate(() => {
                // 点击所有"展开评论"按钮
                const expandButtons = document.querySelectorAll('button, a');
                expandButtons.forEach(btn => {
                    const text = btn.textContent || '';
                    if (text.includes('展开') || text.includes('评论') || text.includes('更多')) {
                        btn.click();
                    }
                });
            });
            
            // 等待加载
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 滚动到底部加载更多
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    async extractComments(page) {
        console.log('💬 提取评论内容...');
        
        const comments = await page.evaluate(() => {
            const comments = [];
            
            // 尝试多种评论选择器
            const commentSelectors = [
                '.WB_comment',
                '.comment-item', 
                '.weibo-comment',
                '[class*="comment"]',
                '.Feed_body',
                '.woo-box-flex.woo-box-alignCenter.comment-item'
            ];
            
            let commentElements = [];
            for (const selector of commentSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`找到 ${elements.length} 个评论元素，使用选择器: ${selector}`);
                    commentElements = elements;
                    break;
                }
            }
            
            commentElements.forEach((element, index) => {
                try {
                    const authorElement = element.querySelector('.WB_name, .author, .user-name, [class*="name"], [class*="author"]');
                    const contentElement = element.querySelector('.WB_text, .content, .text, [class*="content"], [class*="text"]');
                    const timeElement = element.querySelector('.WB_from, .time, [class*="time"], [class*="from"]');
                    const likeElement = element.querySelector('.like, [class*="like"], .num');
                    
                    const author = authorElement?.textContent?.trim() || '';
                    const content = contentElement?.textContent?.trim() || '';
                    const time = timeElement?.textContent?.trim() || '';
                    const likes = likeElement?.textContent?.trim() || '';
                    
                    if (content && author && content.length > 2) {
                        comments.push({
                            id: `comment_${index}`,
                            author: { name: author },
                            content: content,
                            publishTime: time,
                            likes: likes,
                            index: index + 1
                        });
                    }
                } catch (e) {
                    // 忽略单个评论提取错误
                }
            });
            
            return comments;
        });
        
        this.results.comments = comments;
        console.log(`✅ 提取了 ${comments.length} 条评论`);
    }

    async saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `hot-weibo-comments-${timestamp}.md`;
        const filePath = path.join(this.outputDir, fileName);
        
        this.results.endTime = new Date();
        const duration = (this.results.endTime - this.results.startTime) / 1000;
        
        const content = `# 微博热门评论分析报告

## 📊 基本信息
- **原始链接:** ${this.results.url}
- **提取时间:** ${this.results.startTime.toLocaleString()}
- **处理耗时:** ${duration.toFixed(1)} 秒
- **评论总数:** ${this.results.comments.length} 条

## 📝 微博信息
**标题:** ${this.results.title}
**作者:** ${this.results.author}
**内容:** ${this.results.content}

---

## 💬 热门评论 (${this.results.comments.length} 条)

${this.results.comments.slice(0, 50).map(comment => `
### 评论 ${comment.index}

**作者:** ${comment.author.name}
**时间:** ${comment.publishTime}
**点赞:** ${comment.likes}

**内容:**
${comment.content}

---
`).join('')}

${this.results.comments.length > 50 ? `
... 还有 ${this.results.comments.length - 50} 条评论 ...

---

## 📈 评论统计
- **总评论数:** ${this.results.comments.length}
- **显示评论数:** 50 (完整评论请查看原始数据)
- **平均点赞数:** ${this.calculateAverageLikes()}
- **最热门评论:** ${this.getTopComment()}

---

## 🔍 分析要点
${this.generateAnalysis()}

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 微博热门评论提取工具 v1.0` : ''}`;

        await fs.writeFile(filePath, content, 'utf8');
        
        // 同时保存原始数据
        const rawDataPath = path.join(this.outputDir, `hot-weibo-comments-${timestamp}.json`);
        await fs.writeFile(rawDataPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        console.log(`📄 结果已保存: ${filePath}`);
        console.log(`📄 原始数据已保存: ${rawDataPath}`);
        
        return filePath;
    }

    calculateAverageLikes() {
        const validLikes = this.results.comments
            .map(c => parseInt(c.likes) || 0)
            .filter(likes => likes > 0);
        
        if (validLikes.length === 0) return '无点赞数据';
        
        const average = validLikes.reduce((sum, likes) => sum + likes, 0) / validLikes.length;
        return average.toFixed(1);
    }

    getTopComment() {
        const topComment = this.results.comments
            .filter(c => c.likes && parseInt(c.likes) > 0)
            .sort((a, b) => parseInt(b.likes) - parseInt(a.likes))[0];
        
        return topComment ? `${topComment.author.name} (${topComment.likes} 赞)` : '无点赞数据';
    }

    generateAnalysis() {
        const comments = this.results.comments;
        const analysis = [];
        
        // 评论长度分析
        const avgLength = comments.reduce((sum, c) => sum + c.content.length, 0) / comments.length;
        analysis.push(`- **平均评论长度:** ${avgLength.toFixed(1)} 字符`);
        
        // 情感倾向分析（简单关键词）
        const positiveWords = ['好', '棒', '赞', '喜欢', '支持', '优秀', '不错'];
        const negativeWords = ['差', '烂', '讨厌', '反对', '不好', '问题', '失望'];
        
        const positiveCount = comments.filter(c => 
            positiveWords.some(word => c.content.includes(word))
        ).length;
        
        const negativeCount = comments.filter(c => 
            negativeWords.some(word => c.content.includes(word))
        ).length;
        
        analysis.push(`- **正面评论:** ${positiveCount} 条 (${((positiveCount/comments.length)*100).toFixed(1)}%)`);
        analysis.push(`- **负面评论:** ${negativeCount} 条 (${((negativeCount/comments.length)*100).toFixed(1)}%)`);
        
        // 热词分析
        const words = comments.flatMap(c => c.content.split(/[\s，。！？、]+/));
        const wordCount = {};
        words.forEach(word => {
            if (word.length > 1) {
                wordCount[word] = (wordCount[word] || 0) + 1;
            }
        });
        
        const topWords = Object.entries(wordCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word, count]) => `${word}(${count}次)`);
        
        analysis.push(`- **热门词汇:** ${topWords.join(', ')}`);
        
        return analysis.join('\n');
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
    const extractor = new HotWeiboCommentExtractor();
    
    try {
        await extractor.initialize();
        
        // 使用您提供的热门微博URL
        const hotWeiboUrl = 'https://weibo.com/hot/weibo/102803';
        await extractor.extractHotWeiboComments(hotWeiboUrl);
        
        // 保存结果
        const resultPath = await extractor.saveResults();
        
        console.log('\n🎉 热门微博评论提取完成！');
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

module.exports = HotWeiboCommentExtractor;