/**
 * 调试登录状态检测
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function debugLogin() {
  console.log('🔍 调试登录状态检测...\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: false, // 不等待登录，让我们手动调试
    targetDomain: 'weibo.com'
  });
  
  try {
    await browserManager.initialize();
    
    // 检查是否有cookie
    const hasCookies = browserManager.hasValidLoginCookies();
    console.log(`是否有有效登录cookie: ${hasCookies}`);
    
    if (hasCookies) {
      console.log('📤 尝试自动注入cookie...');
      const success = await browserManager.autoLoginWithCookies('https://weibo.com');
      console.log(`自动登录结果: ${success}`);
      
      const page = await browserManager.getCurrentPage();
      const currentUrl = page.url();
      console.log(`当前URL: ${currentUrl}`);
      
      // 手动检查登录状态
      const content = await page.content();
      console.log('\n📄 页面内容检查:');
      console.log(`包含"微博": ${content.includes('微博')}`);
      console.log(`包含"新鲜事": ${content.includes('新鲜事')}`);
      console.log(`包含"个人中心": ${content.includes('个人中心')}`);
      console.log(`包含"首页": ${content.includes('首页')}`);
      console.log(`包含"消息": ${content.includes('消息')}`);
      console.log(`包含"发现": ${content.includes('发现')}`);
      
      // 检查是否在登录页面
      const isLoginPage = currentUrl.includes('newlogin') || 
                         currentUrl.includes('login') || 
                         currentUrl.includes('weibo.com/login');
      console.log(`是否在登录页面: ${isLoginPage}`);
      
      // 检查页面标题
      const title = await page.title();
      console.log(`页面标题: ${title}`);
      
      // 等待一下再检查
      console.log('\n⏳ 等待3秒后再次检查...');
      await page.waitForTimeout(3000);
      
      const isLoggedInAfterWait = await browserManager.checkLoginStatus();
      console.log(`等待后登录状态: ${isLoggedInAfterWait}`);
      
    } else {
      console.log('❌ 没有有效的登录cookie');
    }
    
    console.log('\n⏳ 浏览器将保持打开30秒供观察...');
    await browserManager.getCurrentPage().then(page => page.waitForTimeout(30000));
    
  } catch (error) {
    console.error('❌ 调试失败:', error);
  } finally {
    await browserManager.cleanup();
  }
}

debugLogin().catch(console.error);