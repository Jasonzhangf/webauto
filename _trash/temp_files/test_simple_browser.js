import { CamoufoxBrowserSimple } from './libs/browser/camoufox-simple.js';

async function test() {
  console.log('🧪 测试简化版浏览器...');
  
  const browser = new CamoufoxBrowserSimple({
    headless: false,
    locale: 'zh-CN'
  }, false);
  
  try {
    await browser.start();
    
    const page = await browser.goto('https://www.baidu.com', null, 2);
    console.log('✅ 页面加载成功');
    
    console.log('⏱️  等待5秒观察浏览器窗口...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await browser.close();
    console.log('✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();
