#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function testWithExistingCookies() {
    console.log('🧪 测试微博热搜页面链接提取...\n');
    
    // 首先尝试加载现有cookie
    const cookieFile = path.join(process.env.HOME || '~', '.webauto', 'cookies', 'weibo.com.json');
    let existingCookies = [];
    
    try {
        const cookieData = await fs.readFile(cookieFile, 'utf8');
        existingCookies = JSON.parse(cookieData);
        console.log(`✅ 加载了 ${existingCookies.length} 个现有Cookie`);
    } catch (error) {
        console.log('📝 未找到现有Cookie，将启动浏览器进行登录');
    }
    
    const browser = await chromium.launch({ 
        headless: false,
        viewport: { width: 1920, height: 1080 }
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    // 如果有现有cookie，先添加它们
    if (existingCookies.length > 0) {
        await context.addCookies(existingCookies);
        console.log('✅ 已添加现有Cookie到浏览器');
    }
    
    const page = await context.newPage();
    
    try {
        // 直接导航到热搜页面
        console.log('🌐 导航到微博热搜页面...');
        await page.goto('https://weibo.com/hot/weibo/102803', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        
        // 检查页面状态
        const currentUrl = page.url();
        const pageTitle = await page.title();
        
        console.log(`📍 当前页面: ${pageTitle}`);
        console.log(`🔗 当前URL: ${currentUrl}`);
        
        // 检查是否需要登录
        if (currentUrl.includes('login') || currentUrl.includes('signin')) {
            console.log('⚠️ 需要登录，请手动完成登录...');
            console.log('💡 登录成功后页面会自动跳转，请等待...');
            
            // 等待用户登录，最多等待5分钟
            let loginAttempts = 0;
            const maxAttempts = 60; // 5分钟
            
            while (loginAttempts < maxAttempts) {
                await page.waitForTimeout(5000);
                loginAttempts++;
                
                const newUrl = page.url();
                if (!newUrl.includes('login') && !newUrl.includes('signin')) {
                    console.log('✅ 登录成功！');
                    break;
                }
                
                if (loginAttempts % 12 === 0) {
                    console.log(`⏳ 仍在等待登录... (${Math.floor(loginAttempts / 12)}分钟)`);
                }
            }
            
            if (loginAttempts >= maxAttempts) {
                console.log('❌ 登录超时');
                return;
            }
            
            // 登录成功后，获取新的cookie
            const newCookies = await context.cookies(['weibo.com', '.weibo.com']);
            if (newCookies.length > 0) {
                // 保存新cookie
                await fs.mkdir(path.dirname(cookieFile), { recursive: true });
                await fs.writeFile(cookieFile, JSON.stringify(newCookies, null, 2));
                console.log(`✅ 已保存 ${newCookies.length} 个新Cookie到: ${cookieFile}`);
            }
        }
        
        // 现在提取链接
        console.log('\n🎯 开始提取微博链接...');
        
        const extractionResult = await page.evaluate(() => {
            const results = {
                totalLinks: 0,
                weiboLinks: [],
                topicLinks: [],
                userLinks: [],
                otherLinks: []
            };
            
            // 提取所有链接
            const allLinks = document.querySelectorAll('a[href]');
            results.totalLinks = allLinks.length;
            
            allLinks.forEach((link, index) => {
                const href = link.href;
                const text = link.textContent?.trim() || '';
                
                if (href.includes('/status/') || href.includes('/detail/')) {
                    results.weiboLinks.push({
                        url: href,
                        text: text.substring(0, 100),
                        index: index + 1
                    });
                } else if (href.includes('/search?q=') || href.includes('/hashtag/') || href.includes('/topic/')) {
                    results.topicLinks.push({
                        url: href,
                        text: text.substring(0, 30),
                        index: index + 1
                    });
                } else if (href.includes('/u/') || href.includes('/n/') || href.includes('/user/')) {
                    results.userLinks.push({
                        url: href,
                        text: text.substring(0, 20),
                        index: index + 1
                    });
                }
            });
            
            return results;
        });
        
        console.log(`\n📊 提取结果:`);
        console.log(`   总链接数: ${extractionResult.totalLinks}`);
        console.log(`   微博链接: ${extractionResult.weiboLinks.length}`);
        console.log(`   话题链接: ${extractionResult.topicLinks.length}`);
        console.log(`   用户链接: ${extractionResult.userLinks.length}`);
        
        // 显示微博链接
        if (extractionResult.weiboLinks.length > 0) {
            console.log('\n🎯 成功提取的微博链接:');
            console.log('=' * 60);
            
            extractionResult.weiboLinks.slice(0, 10).forEach((link, index) => {
                console.log(`${index + 1}. ${link.url}`);
                if (link.text) {
                    console.log(`   文本: ${link.text}...`);
                }
                console.log('');
            });
            
            if (extractionResult.weiboLinks.length > 10) {
                console.log(`... 还有 ${extractionResult.weiboLinks.length - 10} 个链接`);
            }
            
            console.log('🎉 微博热搜页面链接提取测试成功！');
        } else {
            console.log('\n❌ 未找到微博链接');
            console.log('💡 可能原因:');
            console.log('   • 页面内容尚未完全加载');
            console.log('   • 需要滚动页面加载更多内容');
            console.log('   • 当前页面没有微博内容');
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出错:', error.message);
    } finally {
        await browser.close();
        console.log('\n🧹 浏览器已关闭');
    }
}

testWithExistingCookies().catch(console.error);