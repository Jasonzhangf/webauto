#!/usr/bin/env node

const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

async function properLogin() {
    console.log('🚀 启动1688完整登录流程...');

    const cookiePath = path.join(process.env.HOME, '.webauto', 'cookies', '1688-domestic.json');

    // 恢复之前的备份Cookie
    const backupFiles = fs.readdirSync(path.dirname(cookiePath))
        .filter(file => file.startsWith('1688-domestic.backup.') && file.endsWith('.json'))
        .sort()
        .reverse();

    if (backupFiles.length > 0) {
        const latestBackup = path.join(path.dirname(cookiePath), backupFiles[0]);
        fs.copyFileSync(latestBackup, cookiePath);
        console.log(`📦 已恢复备份: ${backupFiles[0]}`);
    } else {
        console.log('⚠️ 未找到备份文件');
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

    console.log('📍 直接访问1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded' });

    console.log('✅ 1688主页已打开');
    console.log('🔐 请手动登录（如果已经登录请忽略）');
    console.log('⏳ 系统将检测真正的登录状态...');

    // 等待真正的1688登录成功
    let success = false;
    let checkCount = 0;
    const maxChecks = 240; // 最多等待20分钟

    while (!success && checkCount < maxChecks) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        checkCount++;

        try {
            // 检查Cookie中的登录状态
            const cookies = await browser.cookies();
            const loginCookie = cookies.find(c => c.name === '__cn_logon__');

            // 检查URL和登录状态
            const currentUrl = page.url();
            const isOn1688 = currentUrl.includes('1688.com');
            const isLoggedIn = loginCookie && loginCookie.value === 'true';

            console.log(`🔍 检查登录状态... (${checkCount}/${maxChecks}) URL: ${currentUrl}, 登录状态: ${isLoggedIn ? '是' : '否'}`);

            if (isOn1688 && isLoggedIn) {
                success = true;
                console.log('✅ 检测到1688登录成功！');

                // 再等待几秒确保所有Cookie都加载完成
                await new Promise(resolve => setTimeout(resolve, 5000));

                // 获取最终的所有Cookie
                const finalCookies = await browser.cookies();
                console.log(`💾 正在保存 ${finalCookies.length} 个Cookie...`);

                // 备份当前Cookie
                const backupPath = cookiePath.replace('.json', '.backup.' + Date.now() + '.json');
                fs.writeFileSync(backupPath, JSON.stringify(finalCookies, null, 2));
                console.log(`📦 已备份到: ${backupPath}`);

                // 保存到主文件
                fs.writeFileSync(cookiePath, JSON.stringify(finalCookies, null, 2));
                console.log(`✅ Cookie已保存到: ${cookiePath}`);
                console.log(`📊 总共保存了 ${finalCookies.length} 个Cookie`);

                // 显示域名统计
                const domains = {};
                finalCookies.forEach(cookie => {
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

                break;
            }
        } catch (error) {
            console.log(`⚠️ 检查时出错: ${error.message}`);
        }
    }

    if (!success) {
        console.log('⚠️ 未检测到1688登录成功');
        console.log('💡 请确保您已成功登录到1688主页');
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

properLogin().catch(console.error);