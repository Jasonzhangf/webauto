#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * 微博页面结构分析工具
 * 手动检查页面结构，获取准确的选择器
 */
class WeiboStructureAnalyzer {
    constructor() {
        this.results = {
            pageInfo: {},
            elements: {},
            structure: {}
        };
    }
    
    /**
     * 分析页面结构
     */
    async analyzePage(page, url) {
        console.log(`🔍 分析页面结构: ${url}`);
        
        // 导航到页面
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        
        // 基础页面信息
        this.results.pageInfo = await page.evaluate(() => {
            return {
                title: document.title,
                url: window.location.href,
                scrollHeight: document.body.scrollHeight,
                clientHeight: window.innerHeight,
                allElementsCount: document.querySelectorAll('*').length
            };
        });
        
        // 分析主要结构
        await this.analyzeMainStructure(page);
        
        // 分析评论区结构
        await this.analyzeCommentStructure(page);
        
        // 分析可能的评论元素
        await this.analyzePotentialComments(page);
        
        // 保存分析结果
        await this.saveResults();
        
        return this.results;
    }
    
    /**
     * 分析主要结构
     */
    async analyzeMainStructure(page) {
        console.log('📊 分析主要结构...');
        
        const mainElements = await page.evaluate(() => {
            const analysis = {
                feedItems: [],
                containers: [],
                sections: []
            };
            
            // 查找主要容器
            const allElements = document.querySelectorAll('*');
            const importantElements = [];
            
            allElements.forEach(el => {
                const className = el.className || '';
                const id = el.id || '';
                const tagName = el.tagName.toLowerCase();
                
                // 安全检查className是否为字符串
                if (typeof className === 'string' && (
                    className.includes('feed') || 
                    className.includes('card') || 
                    className.includes('post') ||
                    className.includes('item') ||
                    (typeof id === 'string' && (
                        id.includes('feed') ||
                        id.includes('card')
                    ))
                )) {
                    
                    importantElements.push({
                        tagName,
                        className,
                        id,
                        children: el.children.length,
                        textContent: el.textContent?.substring(0, 100)
                    });
                }
            });
            
            return {
                importantElements: importantElements.slice(0, 20), // 限制数量
                totalImportant: importantElements.length
            };
        });
        
        this.results.structure.main = mainElements;
    }
    
    /**
     * 分析评论区结构
     */
    async analyzeCommentStructure(page) {
        console.log('💬 分析评论区结构...');
        
        const commentAnalysis = await page.evaluate(() => {
            const analysis = {
                commentContainers: [],
                commentItems: [],
                loadMoreButtons: [],
                textElements: []
            };
            
            // 查找所有可能的评论相关元素
            const allElements = document.querySelectorAll('*');
            
            allElements.forEach(el => {
                const className = el.className || '';
                const text = el.textContent?.trim() || '';
                
                // 安全检查className是否为字符串
                if (typeof className === 'string') {
                    // 评论容器
                    if (className.includes('comment') || 
                        className.includes('feedback') || 
                        className.includes('react')) {
                        analysis.commentContainers.push({
                            className,
                            tagName: el.tagName.toLowerCase(),
                            children: el.children.length,
                            text: text.substring(0, 50)
                        });
                    }
                    
                    // 加载更多按钮
                    if ((className.includes('more') || className.includes('load')) && 
                        (text.includes('更多') || text.includes('加载') || text.includes('查看'))) {
                        analysis.loadMoreButtons.push({
                            className,
                            tagName: el.tagName.toLowerCase(),
                            text: text,
                            visible: el.offsetParent !== null
                        });
                    }
                    
                    // 文本元素（可能包含评论内容）
                    if (text.length > 5 && text.length < 500 && 
                        !text.includes('首页') && !text.includes('关注') && 
                        !text.includes('粉丝') && !text.includes('微博')) {
                        analysis.textElements.push({
                            className,
                            tagName: el.tagName.toLowerCase(),
                            text: text.substring(0, 100),
                            parentClass: el.parentElement?.className || ''
                        });
                    }
                }
            });
            
            return analysis;
        });
        
        this.results.structure.comments = commentAnalysis;
    }
    
    /**
     * 分析可能的评论元素
     */
    async analyzePotentialComments(page) {
        console.log('🔍 分析可能的评论元素...');
        
        // 滚动到页面中部，看看是否能找到更多评论
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight * 0.6);
        });
        
        await page.waitForTimeout(2000);
        
        const potentialComments = await page.evaluate(() => {
            const potential = [];
            
            // 查找包含用户链接的元素
            const userLinks = document.querySelectorAll('a[href*="/u/"], a[href*="/n/"]');
            
            userLinks.forEach(link => {
                const parent = link.parentElement;
                const grandParent = parent?.parentElement;
                
                if (parent) {
                    const parentClass = parent.className || '';
                    const parentText = parent.textContent?.trim() || '';
                    
                    if (parentText.length > 10 && parentText.length < 1000) {
                        potential.push({
                            userLink: link.href,
                            userText: link.textContent?.trim() || '',
                            parentClass,
                            parentText: parentText.substring(0, 200),
                            hasNumbers: /\d+/.test(parentText), // 是否包含数字（可能是点赞数）
                            hasTime: /(\d+:\d+)|(刚刚)|(分钟前)|(小时前)/.test(parentText) // 是否包含时间
                        });
                    }
                }
            });
            
            return potential.slice(0, 10); // 限制数量
        });
        
        this.results.elements.potentialComments = potentialComments;
    }
    
    /**
     * 保存分析结果
     */
    async saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `weibo-structure-analysis-${timestamp}.json`;
        const filepath = path.join(process.env.HOME || '~', '.webauto', filename);
        
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
        
        console.log(`📁 分析结果已保存到: ${filepath}`);
    }
    
    /**
     * 打印分析结果
     */
    printResults() {
        console.log('\n📋 页面结构分析结果:');
        console.log('=' * 60);
        
        // 页面基本信息
        console.log('📄 页面信息:');
        console.log(`   标题: ${this.results.pageInfo.title}`);
        console.log(`   URL: ${this.results.pageInfo.url}`);
        console.log(`   页面高度: ${this.results.pageInfo.scrollHeight}px`);
        console.log(`   元素总数: ${this.results.pageInfo.allElementsCount}`);
        
        // 主要结构
        console.log('\n🏗️ 主要结构:');
        const mainStructures = this.results.structure.main.importantElements || [];
        mainStructures.forEach((el, index) => {
            console.log(`   ${index + 1}. ${el.tagName} - ${el.className}`);
            console.log(`      子元素: ${el.children} | 文本: ${el.textContent?.substring(0, 50)}...`);
        });
        
        // 评论区结构
        console.log('\n💬 评论区结构:');
        const commentStructures = this.results.structure.comments || {};
        console.log(`   评论容器: ${commentStructures.commentContainers?.length || 0} 个`);
        console.log(`   加载更多按钮: ${commentStructures.loadMoreButtons?.length || 0} 个`);
        console.log(`   文本元素: ${commentStructures.textElements?.length || 0} 个`);
        
        // 潜在评论
        console.log('\n🔍 潜在评论元素:');
        const potentialComments = this.results.elements.potentialComments || [];
        potentialComments.forEach((comment, index) => {
            console.log(`   ${index + 1}. 用户: ${comment.userText}`);
            console.log(`      链接: ${comment.userLink}`);
            console.log(`      父容器: ${comment.parentClass}`);
            console.log(`      内容: ${comment.parentText}...`);
            console.log(`      包含数字: ${comment.hasNumbers} | 包含时间: ${comment.hasTime}`);
            console.log('');
        });
    }
}

// 主函数
async function main() {
    console.log('🔧 微博页面结构分析工具\n');
    
    // 测试链接 - 使用评论较少的帖子
    const testUrls = [
        'https://weibo.com/2656274875/Q4qEJBc6z#comment',  // 央视新闻帖子（评论较多）
        'https://weibo.com/5612207435',                   // 央视新闻主页
    ];
    
    // 加载cookie
    const cookieFile = path.join(process.env.HOME || '~', '.webauto', 'cookies', 'weibo.com.json');
    let cookies = [];
    
    try {
        const cookieData = await fs.readFile(cookieFile, 'utf8');
        cookies = JSON.parse(cookieData);
        console.log(`✅ 加载了 ${cookies.length} 个Cookie`);
    } catch (error) {
        console.log('❌ 未找到Cookie文件');
        return;
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
        // 分析每个URL
        for (const url of testUrls) {
            console.log(`\n🌐 分析URL: ${url}`);
            console.log('-' * 60);
            
            const analyzer = new WeiboStructureAnalyzer();
            const results = await analyzer.analyzePage(page, url);
            analyzer.printResults();
            
            // 等待用户确认
            console.log('\n⏳ 按回车键继续分析下一个URL...');
            await page.waitForTimeout(1000);
        }
        
    } catch (error) {
        console.error('❌ 分析过程中出错:', error.message);
    } finally {
        await browser.close();
        console.log('\n🧹 浏览器已关闭');
    }
}

main().catch(console.error);