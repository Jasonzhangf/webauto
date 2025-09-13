/**
 * 自动Cookie注入功能演示
 * 演示完整的自动登录流程
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const { CookieManager } = require('./dist-simple/browser/SimpleCookieManager');
const fs = require('fs');
const path = require('path');

async function demonstrateAutoCookieInjection() {
  console.log('🚀 开始演示自动Cookie注入功能\n');

  // 1. 检查现有Cookie状态
  const cookieManager = new CookieManager('./cookies');
  const hasWeiboCookies = cookieManager.hasLoginCookies('weibo.com');
  
  console.log('📋 Cookie状态检查:');
  console.log(`  微博Cookie状态: ${hasWeiboCookies ? '✅ 有有效登录Cookie' : '❌ 无有效登录Cookie'}`);
  
  if (hasWeiboCookies) {
    const stats = cookieManager.getCookieStats();
    console.log(`  总计域名数: ${stats.totalDomains}`);
    console.log(`  总计Cookie数: ${stats.totalCookies}`);
    console.log(`  微博Cookie数: ${stats.domainStats['weibo.com'] || 0}`);
  }
  
  console.log('');

  // 2. 创建配置好的浏览器管理器
  const browserManager = new CamoufoxManager({
    headless: false, // 使用有头模式以便观察
    targetDomain: 'weibo.com',
    autoInjectCookies: true,
    waitForLogin: true,
    loginTimeout: 120,
    defaultTimeout: 15000
  });

  try {
    // 3. 初始化并执行自动登录流程
    console.log('🌐 初始化浏览器...');
    await browserManager.initialize();
    
    console.log('\n🔄 开始自动登录流程...');
    
    if (hasWeiboCookies) {
      console.log('📤 检测到已有Cookie，尝试自动注入登录...');
      const autoLoginSuccess = await browserManager.autoLoginWithCookies('https://weibo.com');
      
      if (autoLoginSuccess) {
        console.log('✅ 自动登录成功！');
      } else {
        console.log('❌ 自动登录失败，Cookie可能已过期');
        console.log('🔄 切换到手动登录模式...');
        await browserManager.waitForUserLogin();
      }
    } else {
      console.log('🔐 未检测到登录Cookie，等待用户手动登录...');
      await browserManager.waitForUserLogin();
    }

    // 4. 验证登录状态
    console.log('\n🔍 验证登录状态...');
    const isLoggedIn = await browserManager.checkLoginStatus();
    console.log(`登录状态: ${isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

    // 5. 保存最终的Cookie状态
    console.log('\n💾 保存Cookie状态...');
    await browserManager.saveCookies();

    // 6. 显示页面信息
    const page = await browserManager.getCurrentPage();
    const title = await page.title();
    const url = page.url();
    
    console.log('\n📄 页面信息:');
    console.log(`  标题: ${title}`);
    console.log(`  URL: ${url}`);

    // 7. 测试导航功能
    console.log('\n🧭 测试导航功能...');
    await browserManager.navigate('https://weibo.com');
    console.log('✅ 导航完成');

    // 8. 等待用户观察
    console.log('\n⏳ 浏览器将保持打开30秒供观察...');
    await page.waitForTimeout(30000);

    console.log('\n✅ 演示完成！');

  } catch (error) {
    console.error('\n❌ 演示过程中发生错误:', error);
  } finally {
    console.log('\n🧹 清理资源...');
    await browserManager.cleanup();
  }
}

// 运行演示
if (require.main === module) {
  demonstrateAutoCookieInjection().catch(console.error);
}

module.exports = { demonstrateAutoCookieInjection };