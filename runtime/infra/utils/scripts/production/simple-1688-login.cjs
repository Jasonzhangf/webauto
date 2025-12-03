#!/usr/bin/env node

const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

async function simpleLogin() {
    console.log('🚀 启动1688简单登录流程...');

    const cookiePath = path.join(process.env.HOME, '.webauto', 'cookies', '1688-domestic.json');

    // 备份现有cookie
    if (fs.existsSync(cookiePath)) {
        const backupPath = cookiePath.replace('.json', '.backup.' + Date.now() + '.json');
        fs.copyFileSync(cookiePath, backupPath);
        console.log(`📦 Cookie已备份到: ${backupPath}`);
    }

    // 启动Camoufox
    const camoufoxPath = '/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';

    console.log('🌐 启动浏览器...');
    const browser = await firefox.launchPersistentContext('', {
        executablePath: camoufoxPath,
        headless: false,
        viewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    console.log('📍 正在打开1688登录页面...');
    await page.goto('https://login.1688.com/member/signin.htm', { waitUntil: 'domcontentloaded' });

    console.log('✅ 登录页面已打开');
    console.log('🔐 请手动登录，完成后页面会自动跳转');
    console.log('⏳ 系统将在登录跳转后自动保存Cookie...');

    // 等待页面跳转到主页（登录成功的标志）
    let success = false;
    for (let i = 0; i < 120 && !success; i++) { // 最多等待10分钟
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            const currentUrl = page.url();
            console.log(`🔍 检查登录状态... (${i + 1}/120) 当前: ${currentUrl}`);

            if (!currentUrl.includes('signin.htm') || currentUrl.includes('1688.com')) {
                success = true;
                console.log('✅ 检测到登录成功！');

                // 再等待几秒确保页面完全加载
                await new Promise(resolve => setTimeout(resolve, 3000));

                // 保存所有Cookie
                const cookies = await browser.cookies();
                console.log(`💾 正在保存 ${cookies.length} 个Cookie...`);

                fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
                console.log(`✅ Cookie已保存到: ${cookiePath}`);
                console.log(`📊 总共保存了 ${cookies.length} 个Cookie`);

                break;
            }
        } catch (error) {
            console.log(`⚠️ 检查时出错: ${error.message}`);
        }
    }

    if (!success) {
        console.log('⚠️ 未检测到登录成功，但会话保持打开');
    }

    console.log('🎯 浏览器将保持打开状态，您可以继续操作');
    console.log('🛑 关闭此窗口或按 Ctrl+C 退出');

    // 保持浏览器打开
    process.on('SIGINT', async () => {
        console.log('\n🛑 正在关闭浏览器...');
        await browser.close();
        process.exit(0);
    });

    await new Promise(() => {});
}

simpleLogin().catch(console.error);