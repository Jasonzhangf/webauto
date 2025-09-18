#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function extractWeiboContent() {
    console.log('🔥 提取微博热搜内容...\n');
    
    // 加载现有cookie
    const cookieFile = path.join(process.env.HOME || '~', '.webauto', 'cookies', 'weibo.com.json');
    let existingCookies = [];
    
    try {
        const cookieData = await fs.readFile(cookieFile, 'utf8');
        existingCookies = JSON.parse(cookieData);
        console.log(`✅ 加载了 ${existingCookies.length} 个Cookie`);
    } catch (error) {
        console.log('❌ 未找到Cookie文件');
        return;
    }
    
    const browser = await chromium.launch({ 
        headless: false,
        viewport: { width: 1920, height: 1080 }
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    await context.addCookies(existingCookies);
    
    const page = await context.newPage();
    
    try {
        // 导航到热搜页面
        console.log('🌐 导航到微博热搜页面...');
        await page.goto('https://weibo.com/hot/weibo/102803', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        
        console.log('✅ 成功访问热搜页面');
        
        // 滚动页面以加载更多内容
        console.log('\n📜 滚动页面加载内容...');
        
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(2000);
            console.log(`   滚动 ${i + 1}/5 完成`);
        }
        
        // 等待内容加载
        await page.waitForTimeout(3000);
        
        // 提取页面内容
        console.log('\n🎯 提取微博内容...');
        
        const content = await page.evaluate(() => {
            const results = {
                hotTopics: [],
                weiboPosts: [],
                userLinks: [],
                pageStats: {
                    totalLinks: 0,
                    scrollHeight: document.body.scrollHeight,
                    scrollTop: window.scrollY
                }
            };
            
            // 更精确的热搜话题选择器
            const hotSelectors = [
                '[data-hotrank]',
                '.hot-item',
                '.rank-item', 
                '.Feed_body__3R0rO',
                '.card-feed',
                '[class*="hot"]',
                '[class*="rank"]',
                '[data-sensor-item="topic"]',
                '.topic-item',
                '.hot-list-item',
                '.trend-item'
            ];
            
            // 提取热搜话题
            hotSelectors.forEach(selector => {
                const items = document.querySelectorAll(selector);
                items.forEach((item, index) => {
                    const titleElement = item.querySelector('a[href*="/search/"], a[href*="hashtag"], a[href*="topic"], .title, .text, h3, h4, [class*="title"]') || item;
                    const title = titleElement.textContent?.trim();
                    const linkElement = item.querySelector('a[href*="search"], a[href*="hashtag"], a[href*="topic"], a[href*="/hot/"]');
                    const link = linkElement?.href;
                    
                    if (title && link && title.length > 2 && !results.hotTopics.find(t => t.title === title)) {
                        results.hotTopics.push({
                            title: title.substring(0, 50),
                            link: link,
                            rank: results.hotTopics.length + 1
                        });
                    }
                });
            });
            
            // 更精确的微博帖子选择器
            const feedSelectors = [
                '[data-feedid]',
                '.Feed_body__3R0rO',
                '.card-feed',
                '.woo-box-flex.woo-box-alignCenter.Card_title__3Q_WA',
                '[class*="feed"]',
                '[class*="post"]',
                '[class*="content"]',
                '.feed-item',
                '.post-item'
            ];
            
            // 提取微博帖子
            feedSelectors.forEach(selector => {
                const items = document.querySelectorAll(selector);
                items.forEach((item, index) => {
                    const contentElement = item.querySelector('.text, .content, .Feed_body__3R0rO, [class*="content"], [class*="text"]') || item;
                    const content = contentElement.textContent?.trim();
                    
                    const linkElement = item.querySelector('a[href*="/status/"], a[href*="/detail/"], a[href*="/p/"]');
                    const link = linkElement?.href;
                    
                    const authorElement = item.querySelector('a[href*="/u/"], a[href*="/n/"], a[href*="/user/"]');
                    const authorLink = authorElement?.href;
                    const authorName = authorElement?.textContent?.trim();
                    
                    if (content && link && content.length > 5 && !results.weiboPosts.find(p => p.link === link)) {
                        results.weiboPosts.push({
                            content: content.substring(0, 200),
                            link: link,
                            author: authorName,
                            authorLink: authorLink,
                            index: results.weiboPosts.length + 1
                        });
                    }
                });
            });
            
            // 提取用户链接
            const userLinks = document.querySelectorAll('a[href*="/u/"], a[href*="/n/"], a[href*="/user/"]');
            userLinks.forEach(link => {
                const href = link.href;
                const text = link.textContent?.trim();
                if (href && text && text.length > 1 && !results.userLinks.find(u => u.url === href)) {
                    results.userLinks.push({
                        name: text.substring(0, 20),
                        url: href
                    });
                }
            });
            
            // 统计总链接数
            results.pageStats.totalLinks = document.querySelectorAll('a[href]').length;
            
            return results;
        });
        
        console.log('\n📊 提取结果:');
        console.log(`   页面高度: ${content.pageStats.scrollHeight}px`);
        console.log(`   总链接数: ${content.pageStats.totalLinks}`);
        console.log(`   热搜话题: ${content.hotTopics.length}`);
        console.log(`   微博帖子: ${content.weiboPosts.length}`);
        console.log(`   用户链接: ${content.userLinks.length}`);
        
        // 显示热搜话题
        if (content.hotTopics.length > 0) {
            console.log('\n🔥 热搜话题 (前10个):');
            console.log('=' * 60);
            content.hotTopics.slice(0, 10).forEach((topic, index) => {
                console.log(`${index + 1}. ${topic.title}`);
                console.log(`   链接: ${topic.link}`);
                console.log('');
            });
        }
        
        // 显示微博帖子
        if (content.weiboPosts.length > 0) {
            console.log('\n📝 微博帖子 (前5个):');
            console.log('=' * 60);
            content.weiboPosts.slice(0, 5).forEach((post, index) => {
                console.log(`${index + 1}. ${post.content}...`);
                console.log(`   链接: ${post.link}`);
                if (post.author) {
                    console.log(`   作者: ${post.author}`);
                }
                console.log('');
            });
        }
        
        // 保存结果到文件
        const resultFile = path.join(process.env.HOME || '~', '.webauto', 'weibo-hot-results.json');
        await fs.mkdir(path.dirname(resultFile), { recursive: true });
        await fs.writeFile(resultFile, JSON.stringify(content, null, 2));
        console.log(`\n✅ 结果已保存到: ${resultFile}`);
        
        console.log('\n🎉 微博热搜内容提取完成！');
        
    } catch (error) {
        console.error('❌ 提取过程中出错:', error.message);
    } finally {
        await browser.close();
        console.log('\n🧹 浏览器已关闭');
    }
}

extractWeiboContent().catch(console.error);