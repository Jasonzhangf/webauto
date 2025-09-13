#!/usr/bin/env node

/**
 * 微博自动登录命令行工具
 * 使用保存的Cookie自动登录微博
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function autoLoginWeibo() {
  console.log('🔑 微博自动登录工具\n');

  const browserManager = new CamoufoxManager({
    headless: false,              // 显示浏览器窗口
    autoInjectCookies: true,      // 自动注入Cookie
    waitForLogin: false,          // 不等待手动登录，失败就失败
    targetDomain: 'weibo.com'     // 目标域名
  });

  try {
    console.log('🌐 初始化浏览器...');
    await browserManager.initialize();

    console.log('📤 尝试自动登录...');
    const success = await browserManager.autoLoginWithCookies('https://weibo.com');

    if (success) {
      console.log('✅ 自动登录成功！');
      console.log('🔍 验证登录状态...');
      
      const isLoggedIn = await browserManager.checkLoginStatus();
      console.log(`   登录状态: ${isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

      if (isLoggedIn) {
        const page = await browserManager.getCurrentPage();
        const title = await page.title();
        console.log(`   页面标题: ${title}`);
        
        console.log('\n🎉 登录成功！浏览器将保持打开状态...');
        console.log('按 Ctrl+C 关闭浏览器');
        
        // 保持浏览器打开
        process.on('SIGINT', async () => {
          console.log('\n🧹 正在关闭浏览器...');
          await browserManager.cleanup();
          process.exit(0);
        });
        
        // 无限等待
        await new Promise(() => {});
      } else {
        console.log('❌ 登录状态验证失败');
        await browserManager.cleanup();
      }
    } else {
      console.log('❌ 自动登录失败，可能需要重新手动登录');
      await browserManager.cleanup();
    }

  } catch (error) {
    console.error('❌ 登录过程中发生错误:', error);
    await browserManager.cleanup();
    process.exit(1);
  }
}

// 运行自动登录
autoLoginWeibo();