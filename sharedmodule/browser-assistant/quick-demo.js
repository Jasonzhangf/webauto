/**
 * 快速演示自动Cookie注入功能
 * 专门为演示优化，显示完整流程
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const { CookieManager } = require('./dist-simple/browser/SimpleCookieManager');

async function quickDemo() {
  console.log('🎯 快速演示：自动Cookie注入功能\n');

  // 1. 检查Cookie状态
  console.log('📋 步骤1：检查Cookie状态');
  const cookieManager = new CookieManager('./cookies');
  const hasCookies = cookieManager.hasLoginCookies('weibo.com');
  
  console.log(`  ✅ 检测到微博Cookie: ${hasCookies ? '是' : '否'}`);
  
  if (hasCookies) {
    const stats = cookieManager.getCookieStats();
    console.log(`  📊 Cookie数量: ${stats.totalCookies}个`);
    console.log(`  🏷️  涵盖域名: ${Object.keys(stats.domainStats).join(', ')}`);
  }
  
  console.log('');

  // 2. 创建浏览器管理器
  console.log('⚙️  步骤2：配置浏览器管理器');
  const browserManager = new CamoufoxManager({
    headless: false,              // 显示浏览器窗口，方便观察
    autoInjectCookies: true,      // 启用自动Cookie注入
    waitForLogin: true,           // 如果自动失败则等待手动登录
    loginTimeout: 60,             // 60秒超时
    targetDomain: 'weibo.com',    // 目标域名
    defaultTimeout: 10000         // 页面操作超时
  });
  
  console.log('  ✅ 配置完成:');
  console.log('     - 自动注入Cookie: 启用');
  console.log('     - 等待手动登录: 启用');
  console.log('     - 目标网站: 微博');
  console.log('     - 登录超时: 60秒');
  console.log('');

  try {
    // 3. 初始化浏览器
    console.log('🌐 步骤3：初始化浏览器...');
    await browserManager.initialize();
    console.log('  ✅ 浏览器初始化成功');
    console.log('');

    // 4. 执行自动登录流程
    console.log('🚀 步骤4：开始自动登录流程...');
    
    if (hasCookies) {
      console.log('📤 检测到已有Cookie，尝试自动登录...');
      const startTime = Date.now();
      
      const autoSuccess = await browserManager.autoLoginWithCookies('https://weibo.com');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (autoSuccess) {
        console.log(`  ✅ 自动登录成功！用时 ${elapsed} 秒`);
        
        // 5. 验证登录状态
        console.log('🔍 步骤5：验证登录状态...');
        const isLoggedIn = await browserManager.checkLoginStatus();
        console.log(`  ✅ 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
        
        // 6. 显示页面信息
        const page = await browserManager.getCurrentPage();
        const title = await page.title();
        const url = page.url();
        
        console.log('');
        console.log('📄 页面信息:');
        console.log(`  标题: ${title}`);
        console.log(`  URL: ${url}`);
        
        // 7. 测试导航
        console.log('');
        console.log('🧭 测试导航到个人主页...');
        await browserManager.navigate('https://weibo.com/home');
        console.log('  ✅ 导航完成');
        
        // 8. 等待观察
        console.log('');
        console.log('⏱️  浏览器将保持打开20秒供您观察...');
        console.log('   请检查:');
        console.log('   - 是否已登录微博');
        console.log('   - 页面是否正常显示');
        console.log('   - Cookie是否正常工作');
        
        await page.waitForTimeout(20000);
        
      } else {
        console.log('  ❌ 自动登录失败，Cookie可能已过期');
        console.log('🔄 切换到手动登录模式...');
        await browserManager.waitForUserLogin();
      }
    } else {
      console.log('🔐 未检测到登录Cookie，等待手动登录...');
      await browserManager.waitForUserLogin();
    }

    console.log('');
    console.log('🎉 演示完成！');

  } catch (error) {
    console.error('❌ 演示过程中发生错误:', error);
  } finally {
    console.log('🧹 清理资源...');
    await browserManager.cleanup();
    console.log('✅ 清理完成');
  }
}

// 运行演示
quickDemo().catch(console.error);