import { CamoufoxBrowserSimple } from './libs/browser/camoufox-simple.js';

async function test() {
  console.log('🧪 测试可见浏览器...');
  
  const browser = new CamoufoxBrowserSimple({
    headless: false,  // 确保非headless模式
    locale: 'zh-CN'
  }, false);
  
  try {
    await browser.start();
    console.log('✅ 浏览器启动成功');
    
    const page = await browser.goto('https://www.baidu.com', null, 1);
    console.log('✅ 页面加载成功');
    
    // 尝试强制显示窗口
    await page.evaluate(() => {
      window.focus();
      window.moveTo(100, 100);
      window.resizeTo(1200, 800);
    });
    
    console.log('👀 请检查是否有浏览器窗口弹出');
    console.log('⏱️  等待10秒...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await browser.close();
    console.log('✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

test();
