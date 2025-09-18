const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class SimpleWeiboCommentExtractor {
    constructor() {
        this.results = {
            url: '',
            title: '',
            author: '',
            content: '',
            comments: [],
            expandClicks: 0,
            pageLoads: 0,
            scrollActions: 0,
            startTime: '',
            endTime: ''
        };
    }

    async extractAllComments(url) {
        this.results.url = url;
        this.results.startTime = new Date().toISOString();
        
        console.log('🚀 开始简单微博评论提取...');
        
        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        try {
            // 设置超时
            page.setDefaultTimeout(30000);
            page.setDefaultNavigationTimeout(60000);
            
            // 加载cookie
            await this.loadCookies(context);
            
            console.log('📄 访问微博页面...');
            await page.goto(url, { waitUntil: 'networkidle' });
            
            // 获取基本信息
            const pageInfo = await page.evaluate(() => {
                const title = document.title;
                const author = document.querySelector('h1, h2, h3, [class*="title"], [class*="author"]')?.textContent || '';
                const content = document.body.textContent.substring(0, 500);
                return { title, author, content };
            });
            
            this.results.title = pageInfo.title;
            this.results.author = pageInfo.author;
            this.results.content = pageInfo.content;
            
            console.log(`📝 微博信息: ${pageInfo.author} - ${pageInfo.title}`);
            
            // 展开评论
            await this.expandComments(page);
            
            // 滚动加载
            await this.scrollForMoreComments(page);
            
            // 提取评论
            await this.extractComments(page);
            
        } catch (error) {
            console.error('❌ 提取失败:', error.message);
        } finally {
            await browser.close();
        }
        
        this.results.endTime = new Date().toISOString();
        
        // 保存结果
        await this.saveResults();
        
        console.log(`✅ 提取完成！共 ${this.results.comments.length} 条评论`);
        console.log(`📊 统计: 展开${this.results.expandClicks}次 | 滚动${this.results.scrollActions}次 | 加载${this.results.pageLoads}次`);
        
        return this.results.comments;
    }

    async loadCookies(context) {
        try {
            const cookiePath = path.join(process.env.HOME, '.webauto', 'weibo_cookies.json');
            const cookieData = await fs.readFile(cookiePath, 'utf8');
            const cookies = JSON.parse(cookieData);
            await context.addCookies(cookies);
            console.log('✅ 已加载微博cookie');
        } catch (error) {
            console.log('⚠️ 未找到cookie文件，可能需要手动登录');
        }
    }

    async expandComments(page) {
        console.log('🔽 展开评论...');
        
        // 展开按钮 - 多种可能的选择器
        const expandSelectors = [
            'text="展开"',
            'text="查看更多"',
            'text="更多评论"',
            'text="加载更多"',
            '[class*="expand"]',
            '[class*="more"]',
            '[class*="load"]',
            'button:has-text("展开")',
            'button:has-text("更多")',
            'button:has-text("加载")',
            'a:has-text("展开")',
            'a:has-text("更多")'
        ];
        
        for (const selector of expandSelectors) {
            try {
                const expandButtons = await page.$$(selector);
                for (const button of expandButtons) {
                    try {
                        await button.click();
                        this.results.expandClicks++;
                        console.log(`  点击展开按钮 (${selector})`);
                        await page.waitForTimeout(1000);
                    } catch (e) {
                        // 忽略点击错误
                    }
                }
            } catch (e) {
                // 忽略选择器错误
            }
        }
        
        console.log(`🎯 展开完成: 共展开 ${this.results.expandClicks} 个按钮`);
    }

    async scrollForMoreComments(page) {
        console.log('📜 滚动加载评论...');
        
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            this.results.scrollActions++;
            console.log(`  滚动 ${i + 1}/5`);
            await page.waitForTimeout(2000);
        }
        
        console.log(`🎯 滚动完成: 共滚动 ${this.results.scrollActions} 次`);
    }

    async extractComments(page) {
        console.log('💬 提取评论...');
        
        // 评论容器选择器 - 针对微博评论的具体结构
        const commentSelectors = [
            // 微博评论的主要容器
            '[class*="comment"]',
            '[class*="reply"]',
            '[class*="feed"]',
            '[class*="item"]',
            // 包含用户头像的评论
            'div:has(img):has-text(":")',
            'div:has(img):has-text("来自")',
            'div:has(img):has-text("赞")',
            // 针对微博特定的结构
            '[node-type*="comment"]',
            '[data-type*="comment"]',
            // 评论列表容器
            '[class*="list"] > div',
            '[class*="comments"] > div',
            '[class*="comment-list"] > div',
            // 深度嵌套的评论
            'div > div > div:has(img):has-text(":")'
        ];
        
        let allComments = [];
        
        for (const selector of commentSelectors) {
            try {
                const comments = await page.evaluate((sel) => {
                    const elements = document.querySelectorAll(sel);
                    const results = [];
                    
                    elements.forEach((element, index) => {
                        const text = element.textContent || '';
                        const rect = element.getBoundingClientRect();
                        
                        // 基本过滤
                        if (rect.width < 50 || rect.height < 20 || text.length < 10) return;
                        if (text.includes('热搜') || text.includes('榜单') || text.includes('排行')) return;
                        if (text.includes('播放视频') || text.includes('加载完毕')) return;
                        
                        // 查找用户名和内容
                        const avatar = element.querySelector('img');
                        const nameElement = element.querySelector('[class*="name"], [class*="user"], [class*="author"], a');
                        const timeElement = element.querySelector('time, [data-time], [class*="time"]');
                        
                        let authorName = '未知用户';
                        if (nameElement) {
                            authorName = nameElement.textContent.trim();
                        } else if (avatar) {
                            authorName = avatar.getAttribute('alt') || '未知用户';
                        }
                        
                        // 提取内容 - 排除用户名
                        let content = text;
                        if (authorName !== '未知用户' && content.includes(authorName)) {
                            content = content.replace(authorName, '').trim();
                        }
                        
                        // 提取时间
                        let publishTime = '';
                        if (timeElement) {
                            publishTime = timeElement.textContent.trim();
                        }
                        
                        // 验证是评论
                        if (authorName && content && content.length > 5 && content.includes(':')) {
                            results.push({
                                id: `${sel}_${index}`,
                                author: { name: authorName },
                                content: content,
                                publishTime: publishTime,
                                likes: '0',
                                replies: '0',
                                url: '',
                                score: 5,
                                interactionFeatures: {
                                    hasAvatar: !!avatar,
                                    hasTimestamp: !!timeElement,
                                    hasLikes: false,
                                    hasReply: false,
                                    hasLocation: false
                                }
                            });
                        }
                    });
                    
                    return results;
                }, selector);
                
                console.log(`  选择器 "${selector}": 找到 ${comments.length} 条评论`);
                allComments.push(...comments);
                
            } catch (error) {
                console.log(`  选择器 "${selector}": 出错 - ${error.message}`);
            }
        }
        
        // 去重
        this.results.comments = this.deduplicateComments(allComments);
        console.log(`🔍 去重后: ${this.results.comments.length} 条评论`);
        
        // 显示前几条评论
        if (this.results.comments.length > 0) {
            console.log('📝 样本评论:');
            this.results.comments.slice(0, 3).forEach((comment, index) => {
                console.log(`  ${index + 1}. ${comment.author.name}: ${comment.content.substring(0, 50)}...`);
            });
        }
    }

    deduplicateComments(comments) {
        const seen = new Set();
        return comments.filter(comment => {
            const key = `${comment.author.name}_${comment.content.substring(0, 50)}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    async saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseDir = '/Users/fanzhang/.webauto/simple-comments';
        
        await fs.mkdir(baseDir, { recursive: true });
        
        const dataPath = path.join(baseDir, `simple-comments-${timestamp}.json`);
        const reportPath = path.join(baseDir, `simple-comments-${timestamp}.md`);
        
        // 保存JSON数据
        await fs.writeFile(dataPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        // 生成报告
        const duration = (new Date(this.results.endTime) - new Date(this.results.startTime)) / 1000;
        const content = `# 简单微博评论提取报告

## 📊 基本信息
- **微博链接:** ${this.results.url}
- **提取时间:** ${new Date(this.results.startTime).toLocaleString()}
- **处理耗时:** ${duration.toFixed(1)} 秒
- **评论总数:** ${this.results.comments.length}

## 📝 微博信息
**标题:** ${this.results.title}
**作者:** ${this.results.author}
**内容:** ${this.results.content.substring(0, 200)}...

## 🎯 提取统计
- **展开点击次数:** ${this.results.expandClicks}
- **滚动动作次数:** ${this.results.scrollActions}
- **加载更多点击:** ${this.results.pageLoads}
- **平均每秒提取:** ${(this.results.comments.length / duration).toFixed(2)} 条评论

---

## 💬 评论内容 (${this.results.comments.length} 条)

${this.results.comments.slice(0, 50).map(comment => `
### 评论 ${comment.index}

**作者:** ${comment.author.name}
**时间:** ${comment.publishTime}

**内容:**
${comment.content}

---
`).join('')}

${this.results.comments.length > 50 ? `
... 还有 ${this.results.comments.length - 50} 条评论 ...
` : ''}

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 简单微博评论提取工具
`;
        
        await fs.writeFile(reportPath, content, 'utf8');
        
        console.log(`📄 详细报告: ${reportPath}`);
        console.log(`📄 原始数据: ${dataPath}`);
    }
}

// 主函数
async function main() {
    const url = 'https://weibo.com/2174585797/Q4fZgwfSy';
    const extractor = new SimpleWeiboCommentExtractor();
    
    try {
        const comments = await extractor.extractAllComments(url);
        console.log(`🎉 简单微博评论提取完成！`);
        console.log(`📊 提取了 ${comments.length} 条评论`);
    } catch (error) {
        console.error('❌ 执行失败:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = SimpleWeiboCommentExtractor;