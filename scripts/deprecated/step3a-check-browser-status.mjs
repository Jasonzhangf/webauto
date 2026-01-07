#!/usr/bin/env node
/**
 * 检查浏览器状态并截图
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

async function checkBrowserStatus() {
  console.log('🔍 Checking Browser Status');
  console.log('==========================\n');

  try {
    // 1. 获取当前 URL
    console.log('1️⃣ Getting current URL...');
    const urlResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:currentUrl',
        payload: { sessionId: 'weibo_fresh' }
      })
    });

    const urlResult = await urlResponse.json();
    console.log(`   Current URL: ${urlResult.data?.url || 'N/A'}\n`);

    // 2. 获取页面标题
    console.log('2️⃣ Getting page title...');
    const titleResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: 'document.title'
        }
      })
    });

    const titleResult = await titleResponse.json();
    console.log(`   Page Title: ${titleResult.data || 'N/A'}\n`);

    // 3. 截图
    console.log('3️⃣ Taking screenshot...');
    const screenshotResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:screenshot',
        payload: { sessionId: 'weibo_fresh', fullPage: true }
      })
    });

    const screenshotResult = await screenshotResponse.json();
    
    if (screenshotResult.data?.image) {
      const base64Data = screenshotResult.data.image.replace(/^data:image\/\w+;base64,/, '');
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const screenshotPath = path.join(__dirname, 'browser-screenshot.png');
      
      await fs.writeFile(screenshotPath, Buffer.from(base64Data, 'base64'));
      console.log(`   ✅ Screenshot saved to: ${screenshotPath}\n`);
      
      // 在终端显示（macOS）
      const { execSync } = await import('child_process');
      try {
        execSync(`open "${screenshotPath}"`);
      } catch (e) {
        console.log('   Could not open screenshot automatically');
      }
    }

    // 4. 检查是否有登录状态
    console.log('4️⃣ Checking login status...');
    const loginCheckResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: `
            (function() {
              const hasLogin = document.querySelector('.LoginCard, [class*="LoginCard"]');
              const hasFeed = document.querySelector('[class*="Feed_wrap_"], [class*="Feed_body_"]');
              return { 
                isLoggedIn: !hasLogin, 
                hasFeed: !!hasFeed,
                pageTitle: document.title,
                bodyClass: document.body.className
              };
            })()
          `
        }
      })
    });

    const loginResult = await loginCheckResponse.json();
    console.log(`   Login Status:`);
    console.log(`     - Is Logged In: ${loginResult.data?.isLoggedIn || 'Unknown'}`);
    console.log(`     - Has Feed: ${loginResult.data?.hasFeed || 'Unknown'}`);
    console.log(`     - Body Class: ${loginResult.data?.bodyClass || 'N/A'}\n`);

    // 5. 总结
    console.log('📋 Summary:');
    if (loginResult.data?.isLoggedIn && loginResult.data?.hasFeed) {
      console.log('   ✅ Browser is logged in and feed is visible');
      console.log('   ✅ Ready to proceed with post extraction');
    } else if (loginResult.data?.isLoggedIn && !loginResult.data?.hasFeed) {
      console.log('   ⚠️  Logged in but no feed visible');
      console.log('   ⏳  Please wait for feed to load or navigate manually');
    } else {
      console.log('   ❌ Not logged in to Weibo');
      console.log('   📝 Please log in manually:');
      console.log('      1. View the screenshot above');
      console.log('      2. Use the browser window to log in');
      console.log('      3. Re-run this script to verify login');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkBrowserStatus().catch(console.error);
