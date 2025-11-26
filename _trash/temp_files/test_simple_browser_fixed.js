import { CamoufoxBrowserSimple } from './libs/browser/camoufox-simple.js';

async function test() {
  console.log('🧪 测试简化版浏览器...');
    
    try {
        const browser = new CamoufoxBrowserSimple({
            headless: false,
            locale: 'zh-CN'
        }, false);
        
        await browser.start();
        
        const page = await browser.goto('https://www.baidu.com', null, 2);
        console.log('✅ 页面导航成功');
        
        console.log('👀 请检查屏幕上是否有浏览器窗口');
        
        // 尝试获取页面信息
        const info = {
            title: await page.title(),
            url: page.url()
        };
        console.log(`📄 页面信息: ${info.title}`);
        
        // 等待用户观察
        console.log('👀 等待10秒让窗口显示...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        await browser.close();
        console.log('✅ 测试完成');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error('堆栈:', error.stack);
    }
}


test();
