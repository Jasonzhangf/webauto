#!/usr/bin/env node

/**
 * 1688稳定Cookie保存脚本
 * - 使用CookieManager进行完整的cookie管理
 * - 自动检测登录状态
 * - 创建完整备份
 * - 验证cookie有效性
 */

const { firefox } = require('playwright');
const CookieManager = require('./cookie-manager.cjs');
const path = require('path');

async function stableCookieSaver() {
    console.log('🚀 启动1688稳定Cookie保存流程...');

    const cookieManager = new CookieManager();

    // 检查当前cookie状态
    console.log('📊 检查当前cookie状态...');
    const currentStatus = cookieManager.checkMainCookieFile();

    if (currentStatus.exists && currentStatus.valid) {
        console.log(`✅ 发现有效cookie文件: ${currentStatus.cookieCount}个cookies`);
        console.log(`📅 最后修改: ${currentStatus.modifiedAt}`);
        console.log(`🔐 登录状态: ${currentStatus.loginStatus.isLoggedIn ? '已登录' : '未登录'}`);

        if (currentStatus.loginStatus.isLoggedIn) {
            console.log(`👤 用户ID: ${currentStatus.loginStatus.userId}`);
            console.log(`🏢 会员ID: ${currentStatus.loginStatus.memberId}`);
        }
    } else {
        console.log(`⚠️ Cookie文件状态: ${currentStatus.reason || '需要重新登录'}`);
    }

    // 启动Camoufox浏览器
    console.log('🌐 启动Camoufox浏览器...');
    const camoufoxPath = '/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';

    const browser = await firefox.launchPersistentContext('', {
        executablePath: camoufoxPath,
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-web-security",
            "--no-first-run",
            "--disable-default-apps",
            "--disable-sync",
            "--metrics-recording-only",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-features=TranslateUI",
            "--disable-features=Translate",
            "--lang=zh-CN",
            "--accept-lang=zh-CN,zh"
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

    // 先加载现有的cookies（如果存在）
    console.log('📦 加载现有cookies...');
    const existingCookies = cookieManager.loadCookies();
    if (existingCookies && existingCookies.length > 0) {
        // 过滤并注入有效的cookies
        const validCookies = existingCookies.filter(cookie => {
            // 只注入有效域名的cookies
            const validDomains = ['.1688.com', '.taobao.com', '.tmall.com', '.tmall.hk', '.fliggy.com', '.mmstat.com'];
            return validDomains.some(domain => cookie.domain && cookie.domain.includes(domain.replace('.', '')));
        });

        await browser.addCookies(validCookies);
        console.log(`✅ 已注入 ${validCookies.length} 个有效cookies`);
    }

    // 访问1688主页
    console.log('📍 访问1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 检查登录状态
    console.log('🔍 检查登录状态...');
    let loginSuccess = false;
    let checkCount = 0;
    const maxChecks = 60; // 最多检查5分钟

    while (!loginSuccess && checkCount < maxChecks) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        checkCount++;

        try {
            // 检查页面URL
            const currentUrl = page.url();
            const isOn1688 = currentUrl.includes('1688.com');
            const isNotLoginPage = !currentUrl.includes('login.1688.com') && !currentUrl.includes('signin.htm');

            // 检查页面元素
            const hasLoginElements = await page.evaluate(() => {
                const indicators = [
                    document.querySelector('.member-nick'),
                    document.querySelector('.user-info'),
                    document.querySelector('.head-user'),
                    document.querySelector('[data-spm="login"]')
                ];
                return indicators.some(el => el !== null);
            });

            // 检查cookies
            const cookies = await browser.cookies();
            const loginCookie = cookies.find(c => c.name === '__cn_logon__');
            const isLoggedIn = loginCookie && loginCookie.value === 'true';

            console.log(`🔍 检查 ${checkCount}/${maxChecks}: URL=${currentUrl.substring(0, 50)}..., 登录Cookie=${isLoggedIn}, 登录元素=${hasLoginElements}`);

            if (isOn1688 && isNotLoginPage && (isLoggedIn || hasLoginElements)) {
                loginSuccess = true;
                console.log('✅ 检测到登录成功！');
                break;
            }

        } catch (error) {
            console.log(`⚠️ 检查时出错: ${error.message}`);
        }
    }

    if (!loginSuccess) {
        console.log('⚠️ 未检测到登录成功，但继续保存当前cookies...');
        console.log('💡 提示: 如果需要重新登录，请在浏览器中手动登录');

        // 等待用户手动登录
        console.log('⏳ 等待手动登录完成，按回车键继续...');
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
    }

    // 获取所有cookies
    console.log('💾 保存cookies...');
    const finalCookies = await browser.cookies();
    console.log(`🍪 获取到 ${finalCookies.length} 个cookies`);

    // 使用CookieManager保存cookies
    const saveResult = cookieManager.saveCookies(finalCookies, {
        createBackup: true,
        validateLogin: true
    });

    if (saveResult.success) {
        console.log('✅ Cookie保存成功！');
        console.log(`📊 总计保存: ${saveResult.cookieCount} 个cookies`);

        if (saveResult.backupFile) {
            console.log(`📦 备份文件: ${path.basename(saveResult.backupFile)}`);
        }

        if (saveResult.loginStatus) {
            console.log(`🔐 登录状态: ${saveResult.loginStatus.isLoggedIn ? '已登录' : '未登录'}`);
            if (saveResult.loginStatus.isLoggedIn) {
                console.log(`👤 用户: ${saveResult.loginStatus.userId}`);
                console.log(`🏢 会员: ${saveResult.loginStatus.memberId}`);
            }
        }

        if (saveResult.stats) {
            console.log('\n📈 Cookie域名分布:');
            Object.entries(saveResult.stats.domains)
                .slice(0, 10)
                .forEach(([domain, count]) => {
                    console.log(`  ${domain}: ${count} 个`);
                });
        }

        // 清理旧备份
        const deletedCount = cookieManager.cleanupOldBackups();
        if (deletedCount > 0) {
            console.log(`🗑️ 清理了 ${deletedCount} 个旧备份文件`);
        }

    } else {
        console.error('❌ Cookie保存失败:', saveResult.error);
        if (saveResult.loginStatus) {
            console.log('🔐 登录验证失败:', saveResult.loginStatus);
        }
    }

    console.log('\n🎯 Cookie保存流程完成！');
    console.log('💡 浏览器将保持打开状态，您可以继续操作');
    console.log('🛑 按 Ctrl+C 退出浏览器');

    // 保持浏览器打开
    process.on('SIGINT', async () => {
        console.log('\n🛑 正在关闭浏览器...');
        await browser.close();
        process.exit(0);
    });

    await new Promise(() => {});
}

// 运行脚本
stableCookieSaver().catch(console.error);