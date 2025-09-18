#!/usr/bin/env node

/**
 * 快速获取当前浏览器cookie的脚本
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function quickCookieExtract() {
    console.log('🚀 快速提取微博Cookie...\n');
    
    const browser = await chromium.launch({ 
        headless: false,
        viewport: { width: 1920, height: 1080 }
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
    });
    
    const page = await context.newPage();
    
    try {
        // 导航到微博首页
        console.log('🌐 打开微博首页...');
        await page.goto('https://weibo.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        // 等待页面稳定
        await page.waitForTimeout(3000);
        
        // 检查当前URL和标题
        const currentUrl = page.url();
        const pageTitle = await page.title();
        
        console.log(`📍 当前页面: ${pageTitle}`);
        console.log(`🔗 当前URL: ${currentUrl}`);
        
        // 检查是否在登录页面
        if (currentUrl.includes('login') || currentUrl.includes('signin')) {
            console.log('⚠️ 检测到登录页面，请手动完成登录...');
            console.log('💡 登录完成后按回车键继续...');
            
            // 等待用户登录
            await page.waitForTimeout(10000);
            
            // 再次检查URL
            const newUrl = page.url();
            if (newUrl.includes('login') || newUrl.includes('signin')) {
                console.log('❌ 仍在登录页面，请完成登录后再试');
                return;
            }
        }
        
        // 获取cookie
        console.log('🍪 获取Cookie...');
        const cookies = await context.cookies(['weibo.com', '.weibo.com']);
        
        if (cookies.length === 0) {
            console.log('❌ 未找到Cookie');
            return;
        }
        
        console.log(`✅ 找到 ${cookies.length} 个Cookie`);
        
        // 显示重要cookie
        const importantCookies = cookies.filter(cookie => 
            cookie.name.includes('SUB') || 
            cookie.name.includes('SUHB') ||
            cookie.name.includes('SINAGLOBAL') ||
            cookie.name.includes('WB') ||
            cookie.name.includes('XSRF-TOKEN')
        );
        
        if (importantCookies.length > 0) {
            console.log('🔑 重要认证Cookie:');
            importantCookies.forEach(cookie => {
                console.log(`   • ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
            });
        }
        
        // 保存cookie
        const cookieDir = path.join(process.env.HOME || '~', '.webauto', 'cookies');
        await fs.mkdir(cookieDir, { recursive: true });
        
        const cookieFile = path.join(cookieDir, 'weibo.com.json');
        await fs.writeFile(cookieFile, JSON.stringify(cookies, null, 2));
        
        console.log(`\n✅ Cookie已保存到: ${cookieFile}`);
        
        // 立即测试链接提取
        console.log('\n🧪 立即测试链接提取功能...');
        
        // 导航到热搜页面
        await page.goto('https://weibo.com/hot/weibo/102803', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        
        // 检查是否被重定向
        const hotPageUrl = page.url();
        if (hotPageUrl.includes('login')) {
            console.log('❌ 热搜页面需要登录，Cookie可能无效');
            return;
        }
        
        console.log('✅ 成功访问热搜页面，开始提取链接...');
        
        // 提取链接
        const links = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll('a[href]'));
            return allLinks
                .map(link => ({
                    url: link.href,
                    text: link.textContent?.trim() || '',
                    isWeibo: link.href.includes('/status/') || link.href.includes('/detail/')
                }))
                .filter(link => link.isWeibo && link.url.includes('weibo.com'))
                .slice(0, 5);
        });
        
        console.log(`🎯 成功提取 ${links.length} 个微博链接:`);
        links.forEach((link, index) => {
            console.log(`   ${index + 1}. ${link.text.substring(0, 50)}...`);
            console.log(`      ${link.url}`);
        });
        
    } catch (error) {
        console.error('❌ 出错:', error.message);
    } finally {
        await browser.close();
        console.log('\n🧹 浏览器已关闭');
    }
}

quickCookieExtract().catch(console.error);