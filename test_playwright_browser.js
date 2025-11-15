import { chromium } from 'playwright';

async function testPlaywright() {
  console.log('🧪 测试 Playwright 浏览器...');
  
  try {
    // 检查可用的浏览器类型
    const browsers = await chromium.browsers();
    console.log('可用浏览器:', browsers);
    
    // 测试Chromium启动
    console.log('正在启动 Chromium...');
    
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--start-maximized',
            '--disable-infobars',
            '--lang=zh-CN'
        ]
    });
    
    console.log('✅ Chromium启动成功');
    
    // 创建上下文和页面
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 测试导航
    await page.goto('https://www.baidu.com');
    
 const title = await page.title();
    console.log(`✅ 页面标题: ${title}`);
    
    // 测试页面操作
    await page.fill('#kw', 'Playwright 测试');
    await page.click('#su');
    await page.waitForTimeout(2000);
    
    const newTitle = await page.title();
    
    console.log(`✅ 搜索后标题: ${newTitle}`);
    
    // 截图测试
    const screenshot = await page.screenshot({ fullPage: false });
    require('fs').writeFileSync('playwright_test.png', screenshot);
    console.log('✅ 截图保存为 playwright_test.png');
    
    // 清理
    await context.close();
    await browser.close();
 
    console.log('✅ Playwright 测试完成');
    
  } catch (error) {
    console.error('❌ Playwright 测试失败:', error.message);
  }
}


testPlaywright();
