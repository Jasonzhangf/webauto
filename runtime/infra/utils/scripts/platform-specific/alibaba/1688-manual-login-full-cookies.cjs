#!/usr/bin/env node

/*
 * 1688 Camoufox 手动登录脚本 - 保存完整Cookie
 * - 使用Camoufox浏览器
 * - 打开 https://www.1688.com/（非无头）
 * - 等待用户手动登录
 * - 保存所有Cookie，不进行任何过滤
 * - 确保保存完整的cookie集合
 */

const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function manualLoginWithCamoufox() {
    console.log('🚀 启动1688 Camoufox手动登录流程...');

    // Cookie路径
    const cookiePath = path.join(os.homedir(), '.webauto', 'cookies', '1688-domestic.json');

    // 确保目录存在
    const cookieDir = path.dirname(cookiePath);
    if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
    }

    // 启动Camoufox
    const camoufoxPath = '/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';

    console.log('🌐 启动Camoufox浏览器...');
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

    // 导航到1688主页
    console.log('📍 导航到1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('✅ 1688主页已打开');
    console.log('🔐 请手动完成登录流程');
    console.log('⏳ 系统将等待您完成登录，然后按回车键保存所有Cookie...');

    // 等待用户输入
    await new Promise(resolve => {
        process.stdin.once('data', resolve);
    });

    console.log('💾 正在保存所有Cookie...');

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

manualLoginWithCamoufox().catch(console.error);