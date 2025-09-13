/**
 * 测试真正的Camoufox反指纹浏览器
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function testRealCamoufox() {
  console.log('🦊 测试真正的Camoufox反指纹浏览器\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,  // 显示浏览器以便观察
    autoInjectCookies: false,  // 先不使用cookie，纯粹测试浏览器
    waitForLogin: false,
    targetDomain: 'weibo.com'
  });
  
  try {
    console.log('🚀 启动Camoufox浏览器...');
    await browserManager.initialize();
    
    const page = await browserManager.getCurrentPage();
    
    // 访问一个检测指纹的网站
    console.log('🌐 访问浏览器指纹检测网站...');
    await browserManager.navigate('https://browserleaks.com/javascript');
    
    await page.waitForTimeout(5000);
    
    // 获取页面标题
    const title = await page.title();
    console.log(`📄 页面标题: ${title}`);
    
    // 检查是否成功加载
    const content = await page.content();
    const hasFingerprintInfo = content.includes('fingerprint') || 
                               content.includes('BrowserLeaks') ||
                               content.includes('JavaScript');
    
    console.log(`✅ 指纹检测页面加载: ${hasFingerprintInfo ? '成功' : '失败'}`);
    
    console.log('\n🔍 检查浏览器特征...');
    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log(`📱 User Agent: ${userAgent.substring(0, 50)}...`);
    
    const platform = await page.evaluate(() => navigator.platform);
    console.log(`💻 平台: ${platform}`);
    
    const language = await page.evaluate(() => navigator.language);
    console.log(`🌐 语言: ${language}`);
    
    console.log('\n⏳ 浏览器将保持打开15秒供观察指纹检测结果...');
    console.log('💡 请观察页面显示的浏览器指纹信息');
    
    await page.waitForTimeout(15000);
    
    console.log('\n✅ Camoufox测试完成！');
    
  } catch (error) {
    console.error('❌ Camoufox测试失败:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n🧹 清理资源...');
    await browserManager.cleanup();
    console.log('✅ 清理完成');
  }
}

console.log('📖 测试说明:');
console.log('1. 此脚本将启动真正的Camoufox反指纹浏览器');
console.log('2. 访问BrowserLeaks.com检测浏览器指纹');
console.log('3. 观察是否能有效隐藏自动化特征');
console.log('4. 验证反爬虫能力\n');

testRealCamoufox().catch(console.error);