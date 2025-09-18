const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class ConfigurableCommentExtractor {
    constructor(configPath) {
        this.config = null;
        this.configPath = configPath;
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
            endTime: '',
            configInfo: {}
        };
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            this.results.configInfo = {
                site: this.config.site,
                name: this.config.name,
                version: this.config.version,
                loadedAt: new Date().toISOString()
            };
            console.log(`✅ 配置加载成功: ${this.config.name} v${this.config.version}`);
            return true;
        } catch (error) {
            console.error('❌ 配置加载失败:', error.message);
            return false;
        }
    }

    async extractAllComments(url) {
        // 加载配置
        if (!await this.loadConfig()) {
            throw new Error('配置加载失败');
        }

        this.results.url = url;
        this.results.startTime = new Date().toISOString();
        
        console.log('🚀 开始配置化评论提取...');
        console.log(`📋 使用配置: ${this.config.name}`);
        
        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        try {
            // 设置超时
            page.setDefaultTimeout(30000);
            page.setDefaultNavigationTimeout(60000);
            
            // 加载cookie
            await this.loadCookies(context);
            
            console.log('📄 访问页面...');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
            
            // 获取页面信息
            await this.extractPageInfo(page);
            
            // 执行展开动作
            await this.executeExpandActions(page);
            
            // 执行滚动动作
            await this.executeScrollActions(page);
            
            // 提取评论
            await this.extractCommentsWithConfig(page);
            
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
            // 尝试多个可能的cookie文件路径
            const cookiePaths = [
                path.join(process.env.HOME, '.webauto', 'weibo_cookies.json'),
                path.join(process.env.HOME, '.webauto', 'cookies', 'weibo.json'),
                path.join(process.env.HOME, '.config', 'webauto', 'cookies', 'weibo.json')
            ];
            
            for (const cookiePath of cookiePaths) {
                try {
                    const cookieData = await fs.readFile(cookiePath, 'utf8');
                    const cookies = JSON.parse(cookieData);
                    await context.addCookies(cookies);
                    console.log(`✅ 已加载cookie: ${cookiePath}`);
                    return;
                } catch (e) {
                    // 继续尝试下一个路径
                }
            }
            console.log('⚠️ 未找到cookie文件，可能需要手动登录');
        } catch (error) {
            console.log('⚠️ cookie加载失败');
        }
    }

    async extractPageInfo(page) {
        const pageInfo = await page.evaluate((config) => {
            const title = document.querySelector(config.pageInfo.titleSelector)?.textContent || '';
            const author = document.querySelector(config.pageInfo.authorSelector)?.textContent || '';
            const content = document.querySelector(config.pageInfo.contentSelector)?.textContent?.substring(0, 500) || '';
            return { title, author, content };
        }, this.config);
        
        this.results.title = pageInfo.title;
        this.results.author = pageInfo.author;
        this.results.content = pageInfo.content;
        
        console.log(`📝 页面信息: ${pageInfo.author} - ${pageInfo.title}`);
    }

    async executeExpandActions(page) {
        console.log('🔽 执行展开动作...');
        
        for (const action of this.config.expandActions) {
            console.log(`  执行动作: ${action.name}`);
            
            let clickedCount = 0;
            for (const selector of action.selectors) {
                try {
                    const elements = await page.$$(selector);
                    for (const element of elements) {
                        if (clickedCount >= action.maxClicks) break;
                        
                        try {
                            await element.click();
                            clickedCount++;
                            this.results.expandClicks++;
                            console.log(`    点击元素 (${selector})`);
                            await page.waitForTimeout(action.waitTime);
                        } catch (e) {
                            // 忽略点击错误
                        }
                    }
                } catch (e) {
                    // 忽略选择器错误
                }
            }
        }
        
        console.log(`🎯 展开完成: 共展开 ${this.results.expandClicks} 个按钮`);
    }

    async executeScrollActions(page) {
        if (!this.config.scrollActions.enabled) {
            console.log('📜 滚动动作已禁用');
            return;
        }
        
        console.log('📜 执行滚动动作...');
        
        for (let i = 0; i < this.config.scrollActions.scrollCount; i++) {
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            this.results.scrollActions++;
            console.log(`  滚动 ${i + 1}/${this.config.scrollActions.scrollCount}`);
            await page.waitForTimeout(this.config.scrollActions.scrollInterval);
        }
        
        console.log(`🎯 滚动完成: 共滚动 ${this.results.scrollActions} 次`);
    }

    async extractCommentsWithConfig(page) {
        console.log('💬 根据配置提取评论...');
        
        let allComments = [];
        
        // 按优先级排序选择器
        const sortedSelectors = this.config.commentSelectors.sort((a, b) => a.priority - b.priority);
        
        for (const selectorConfig of sortedSelectors) {
            try {
                const comments = await page.evaluate((config) => {
                    const elements = document.querySelectorAll(config.selector);
                    const results = [];
                    
                    elements.forEach((element, index) => {
                        const text = element.textContent || '';
                        const rect = element.getBoundingClientRect();
                        
                        // 应用过滤器
                        if (!config.filters) return;
                        
                        // 尺寸过滤
                        if (rect.width < config.filters.minWidth || 
                            rect.height < config.filters.minHeight) return;
                        
                        // 文本长度过滤
                        if (text.length < config.filters.minTextLength || 
                            text.length > config.filters.maxTextLength) return;
                        
                        // 关键词过滤
                        const hasExcludeKeyword = config.filters.excludeKeywords.some(keyword => 
                            text.includes(keyword)
                        );
                        if (hasExcludeKeyword) return;
                        
                        // 冒号要求
                        if (config.filters.requireColon && !text.includes(':')) return;
                        
                        // 查找用户信息
                        const avatar = element.querySelector(config.avatarSelector);
                        const nameElement = element.querySelector(config.authorSelector);
                        const timeElement = element.querySelector(config.timeSelector);
                        
                        // 头像要求
                        if (config.filters.requireAvatar && !avatar) return;
                        
                        // 时间戳要求
                        if (config.filters.requireTimestamp && !timeElement) return;
                        
                        // 提取用户名
                        let authorName = '未知用户';
                        if (nameElement) {
                            authorName = nameElement.textContent.trim();
                        } else if (avatar) {
                            authorName = avatar.getAttribute('alt') || '未知用户';
                        }
                        
                        // 提取内容
                        let content = text;
                        if (config.contentProcessing.removeAuthorFromContent && 
                            authorName !== '未知用户' && 
                            content.includes(authorName)) {
                            content = content.replace(authorName, '').trim();
                        }
                        
                        // 清理空白字符
                        if (config.contentProcessing.cleanWhitespace) {
                            content = content.replace(/\s+/g, ' ').trim();
                        }
                        
                        // 提取时间
                        let publishTime = '';
                        if (timeElement) {
                            publishTime = timeElement.textContent.trim();
                        }
                        
                        // 验证是有效评论
                        if (authorName && content && content.length > 0) {
                            results.push({
                                id: `${config.selector}_${index}`,
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
                }, {
                    selector: selectorConfig.selector,
                    filters: this.config.commentExtraction.filters,
                    avatarSelector: this.config.commentExtraction.avatarSelector,
                    authorSelector: this.config.commentExtraction.authorSelector,
                    timeSelector: this.config.commentExtraction.timeSelector,
                    contentProcessing: this.config.commentExtraction.contentProcessing
                });
                
                console.log(`  选择器 "${selectorConfig.name}" (优先级${selectorConfig.priority}): 找到 ${comments.length} 条评论`);
                allComments.push(...comments);
                
            } catch (error) {
                console.log(`  选择器 "${selectorConfig.name}": 出错 - ${error.message}`);
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
        const baseDir = '/Users/fanzhang/.webauto/config-comments';
        
        await fs.mkdir(baseDir, { recursive: true });
        
        const dataPath = path.join(baseDir, `config-comments-${timestamp}.json`);
        const reportPath = path.join(baseDir, `config-comments-${timestamp}.md`);
        
        // 保存JSON数据
        await fs.writeFile(dataPath, JSON.stringify(this.results, null, 2), 'utf8');
        
        // 生成报告
        const duration = (new Date(this.results.endTime) - new Date(this.results.startTime)) / 1000;
        const content = `# 配置化评论提取报告

## 📊 基本信息
- **目标网站:** ${this.config.site}
- **配置名称:** ${this.config.name}
- **配置版本:** ${this.config.version}
- **页面链接:** ${this.results.url}
- **提取时间:** ${new Date(this.results.startTime).toLocaleString()}
- **处理耗时:** ${duration.toFixed(1)} 秒
- **评论总数:** ${this.results.comments.length}

## 📝 页面信息
**标题:** ${this.results.title}
**作者:** ${this.results.author}
**内容:** ${this.results.content.substring(0, 200)}...

## 🎯 提取统计
- **展开点击次数:** ${this.results.expandClicks}
- **滚动动作次数:** ${this.results.scrollActions}
- **加载更多点击:** ${this.results.pageLoads}
- **平均每秒提取:** ${(this.results.comments.length / duration).toFixed(2)} 条评论

## ⚙️ 配置信息
- **选择器数量:** ${this.config.commentSelectors.length}
- **展开动作数量:** ${this.config.expandActions.length}
- **过滤关键词数量:** ${this.config.commentExtraction.filters.excludeKeywords.length}

---

## 💬 评论内容 (${this.results.comments.length} 条)

${this.results.comments.slice(0, Math.min(this.config.output.maxCommentsToShow, this.results.comments.length)).map((comment, index) => `
### 评论 ${index + 1}

**作者:** ${comment.author.name}
**时间:** ${comment.publishTime}

**内容:**
${comment.content}

---
`).join('')}

${this.results.comments.length > this.config.output.maxCommentsToShow ? `
... 还有 ${this.results.comments.length - this.config.output.maxCommentsToShow} 条评论 ...
` : ''}

---

**生成时间:** ${new Date().toLocaleString()}
**工具:** 配置化评论提取器 v1.0
**配置:** ${this.config.name} v${this.config.version}
`;
        
        await fs.writeFile(reportPath, content, 'utf8');
        
        console.log(`📄 详细报告: ${reportPath}`);
        console.log(`📄 原始数据: ${dataPath}`);
    }
}

// 主函数
async function main() {
    const url = 'https://weibo.com/2174585797/Q4fZgwfSy';
    const configPath = '/Users/fanzhang/Documents/github/webauto/sharedmodule/browser-assistant/config/weibo-comment-config.json';
    
    const extractor = new ConfigurableCommentExtractor(configPath);
    
    try {
        const comments = await extractor.extractAllComments(url);
        console.log(`🎉 配置化评论提取完成！`);
        console.log(`📊 提取了 ${comments.length} 条评论`);
    } catch (error) {
        console.error('❌ 执行失败:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = ConfigurableCommentExtractor;