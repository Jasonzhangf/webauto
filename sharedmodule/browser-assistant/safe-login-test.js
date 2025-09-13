/**
 * 安全的登录测试脚本
 * 避免触发反爬虫机制
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function safeLoginTest() {
  console.log('🔒 安全登录测试启动\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com',
    loginTimeout: 300  // 5分钟超时
  });
  
  try {
    console.log('🚀 初始化浏览器...');
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    
    const page = await browserManager.getCurrentPage();
    
    // 检查当前状态
    const currentUrl = page.url();
    console.log(`📍 当前URL: ${currentUrl}`);
    
    if (currentUrl.includes('newlogin')) {
      console.log('⚠️  检测到登录重定向，等待手动登录');
      console.log('🔐 请在浏览器中完成登录验证');
      console.log('💡 提示：不要进行任何自动化操作，让系统自然完成登录');
    } else {
      console.log('✅ 登录状态正常');
      
      // 简单验证是否可以访问页面
      const title = await page.title();
      console.log(`📄 页面标题: ${title}`);
    }
    
    console.log('\n⏳ 浏览器将保持打开，请手动完成登录流程...');
    console.log('📝 登录完成后，脚本会自动检测并保存cookie');
    
    // 等待用户登录
    await browserManager.waitForUserLogin();
    
    console.log('\n🎉 登录测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    console.log('\n🧹 清理资源...');
    await browserManager.cleanup();
  }
}

// 使用说明
console.log('📖 使用说明:');
console.log('1. 此脚本会安全地初始化浏览器并尝试自动登录');
console.log('2. 如果触发反爬虫，会等待手动登录');
console.log('3. 请在浏览器中自然完成登录流程');
console.log('4. 避免快速点击或自动化操作');
console.log('5. 登录完成后cookie会自动保存\n');

safeLoginTest().catch(console.error);