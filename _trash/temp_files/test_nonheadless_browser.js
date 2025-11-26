import { CamoufoxBrowserNonHeadless } from './libs/browser/camoufox-nonheadless.js';

async function test() {
  console.log('🧪 测试非headless浏览器...');
  
  const browser = new CamoufoxBrowserNonHeadless({
    headless: false,
    locale: 'zh-CN'
  }, false);
  
  try {
    await browser.start();
    
    const page = await browser.goto('https://www.baidu.com', null, 2);
    console.log('✅ 页面加载成功');
    
    // 尝试操作页面
    await page.fill('#kw', 'WebAuto 测试');
    await page.click('#su');
    
    console.log('👀 请检查是否有浏览器窗口');
    console.log('⏱️  等待5秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await browser.close();
    console.log('✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

test();
