const { spawn } = require('child_process');
const { chromium } = require('playwright');

async function startBrowser() {
  console.log('🚀 启动前台浏览器...');
  
  try {
    // 启动Playwright Chromium
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--start-maximized',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-web-security',
        '--lang=zh-CN'
      ]
    });
    
    console.log('✅ Chromium启动成功');
    
    // 创建上下文
    const context = await browser.newContext({
      locale: 'zh-CN',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    console.log('✅ 上下文创建成功');
    
    // 创建页面
    const page = await context.newPage();
    console.log('✅ 页面创建成功');
    
    // 导航到百度
    await page.goto('https://www.baidu.com');
    const title = await page.title();
    console.log(`✅ 页面导航成功: ${title}`);
    
    // 等待5秒让窗口显示
    console.log('⏱️  等待5秒让窗口显示...');
    await page.waitForTimeout(5000);
    
    console.log('🎉 浏览器应该已经弹出');
    console.log('💡 可以进行页面操作');
    
    // 保持浏览器打开，等待用户操作
    console.log('⏳  浏览器将保持打开状态');
    console.log('按 Ctrl+C 关闭浏览器');
    
    // 监听退出信号
    process.on('SIGINT', async () => {
      console.log('\n正在关闭浏览器...');
      await context.close();
      await browser.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n正在关闭浏览器...');
      await context.close();
      await browser.close();
 process.exit(0);
    });
    
    // 保持进程运行
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// 直接启动
startBrowser();
