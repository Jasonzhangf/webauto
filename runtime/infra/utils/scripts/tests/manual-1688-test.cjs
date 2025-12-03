#!/usr/bin/env node

const { firefox } = require('playwright');
const path = require('path');
const fs = require('fs');

async function manualTest() {
    console.log('🚀 启动1688 Camoufox手动登录流程（保存完整Cookie）...');

    const cookiePath = path.join(process.env.HOME, '.webauto', 'cookies', '1688-domestic.json');

    // 备份现有cookie（如果存在）
    if (fs.existsSync(cookiePath)) {
        const backupPath = cookiePath.replace('.json', '.backup.' + Date.now() + '.json');
        fs.copyFileSync(cookiePath, backupPath);
        console.log(`📦 现有Cookie已备份到: ${backupPath}`);
    }

    console.log('💡 现在将启动Camoufox浏览器供您手动登录');

    // 启动Camoufox
    const camoufoxPath = '/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';

    const browser = await firefox.launchPersistentContext('', {
        executablePath: camoufoxPath,
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-sync',
            '--metrics-recording-only',
            '--disable-default-browser-check',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-extensions',
            '--disable-plugins-discovery',
            '--disable-ipc-flooding-protection',
            '--shuffle-messagetypes',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-features=TranslateUI',
            '--disable-features=Translate',
            '--lang=zh-CN',
            '--accept-lang=zh-CN,zh'
        ]
    });

    // 注入反检测脚本
    await browser.addInitScript(() => {
        try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
        try { window.chrome = window.chrome || { runtime: {} }; } catch {}
        try { Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] }); } catch {}
        try { Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); } catch {}
        try {
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(param) {
                if (param === 37445) return 'Intel Inc.';
                if (param === 37446) return 'Intel Iris OpenGL Engine';
                return getParameter.call(this, param);
            };
        } catch {}
    });

    // 设置请求头
    await browser.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
    });

    const page = await browser.newPage();

    // 导航到1688主页进行手动登录
    console.log('📍 导航到1688主页进行手动登录...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ 1688主页已打开');
    console.log('🔐 请手动完成登录流程');
    console.log('⏳ 正在检测登录状态，登录成功后将自动保存Cookie...');

    // 等待登录完成并自动检测
    let loginSuccessDetected = false;
    let checkCount = 0;
    const maxChecks = 60; // 最多检查60次 (5分钟)

    while (!loginSuccessDetected && checkCount < maxChecks) {
        try {
            // 检测登录成功的标志
            const isLoggedIn = await page.evaluate(() => {
                // 检查是否存在登录后的元素
                const loginIndicators = [
                    document.querySelector('.member-nick'),
                    document.querySelector('.user-info'),
                    document.querySelector('[data-spm="login"]'),
                    document.querySelector('.login-info'),
                    document.querySelector('.head-user')
                ];

                // 检查URL是否跳转到登录后页面
                const urlIndicators = [
                    window.location.href.includes('member'),
                    window.location.href.includes('user'),
                    !window.location.href.includes('signin.htm')
                ];

                return loginIndicators.some(el => el !== null) || urlIndicators.some(indicator => indicator);
            });

            if (isLoggedIn) {
                loginSuccessDetected = true;
                console.log('✅ 检测到登录成功！');
            } else {
                checkCount++;
                console.log(`⏳ 等待登录中... (${checkCount}/${maxChecks})`);
                await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
            }
        } catch (error) {
            console.log(`⚠️ 检测登录状态时出错: ${error.message}`);
            checkCount++;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    if (!loginSuccessDetected) {
        console.log('⚠️ 未检测到登录成功，请检查是否已完成登录');
        console.log('💡 继续保存当前Cookie...');
    }

    console.log('💾 正在保存所有Cookie（完整保存，不过滤）...');

    // 获取所有Cookie，不进行任何过滤
    const cookies = await browser.cookies();
    console.log(`🍪 获取到 ${cookies.length} 个Cookie`);

    // 保存原始Cookie到备份文件
    const backupPath = cookiePath.replace('.json', '.backup.' + Date.now() + '.json');
    fs.writeFileSync(backupPath, JSON.stringify(cookies, null, 2));
    console.log(`📦 备份Cookie已保存到: ${backupPath}`);

    // 保存完整Cookie到主文件
    fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
    console.log(`✅ 完整Cookie已保存到: ${cookiePath}`);
    console.log(`📊 Cookie总数: ${cookies.length}`);

    // 显示Cookie统计
    const domains = {};
    cookies.forEach(cookie => {
        const domain = cookie.domain || 'unknown';
        domains[domain] = (domains[domain] || 0) + 1;
    });

    console.log('\n📈 Cookie域名分布:');
    Object.entries(domains)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([domain, count]) => {
            console.log(`  ${domain}: ${count} 个`);
        });

    console.log('\n🎯 Cookie保存完成！');
    console.log('💡 提示: 浏览器将保持打开状态，您可以继续操作');
    console.log('🛑 按 Ctrl+C 退出浏览器');

    // 保持浏览器打开，直到用户主动关闭
    process.on('SIGINT', async () => {
        console.log('\n🛑 正在关闭浏览器...');
        await browser.close();
        process.exit(0);
    });

    // 保持进程运行
    await new Promise(() => {});
}

manualTest().catch(console.error);