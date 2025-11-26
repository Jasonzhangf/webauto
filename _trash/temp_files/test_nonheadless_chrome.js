import { chromium } from 'playwright';

async function testNonHeadlessChrome() {
  console.log('🧪 测试非headless Chrome...');
  
  try {
    // 尝试多种启动参数
    const launchOptions = [
      {
        headless: false,
        args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
      },
      {
        headless: 'new',  // 新版headless模式，支持GUI
        args: ['--start-maximized']
      },
      {
        headless: false,
        args: ['--start-fullscreen', '--disable-infobars']
      }
    ];
    
    for (let i = 0; i < launchOptions.length; i++) {
      console.log(`\n🚀 尝试启动方式 ${i + 1}:`, launchOptions[i]);
      
      try {
        const browser = await chromium.launch(launchOptions[i]);
        console.log('✅ 浏览器启动成功');
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.goto('https://www.baidu.com');
        const title = await page.title();
        console.log(`📰 页面标题: ${title}`);
        
        console.log('⏱️  等待5秒检查窗口...');
        await page.waitForTimeout(5000);
        
        await page.close();
        await context.close();
        await browser.close();
        
        console.log('✅ 启动方式成功，窗口应该可见');
        return;
        
      } catch (error) {
        console.log(`❌ 方式 ${i + 1} 失败: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('💥 测试失败:', error.message);
  }
}

testNonHeadlessChrome();
