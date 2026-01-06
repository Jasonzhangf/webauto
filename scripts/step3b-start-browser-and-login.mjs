#!/usr/bin/env node
/**
 * 启动浏览器并导航到微博登录页面
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

async function startBrowserAndNavigate() {
  console.log('🌐 Starting Browser and Navigating to Weibo');
  console.log('============================================\n');

  try {
    // 1. 启动会话
    console.log('1️⃣ Starting browser session...');
    const startResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:start',
        payload: {
          profileId: 'weibo_fresh',
          headless: false,
          url: 'https://weibo.com'
        }
      })
    });

    const startResult = await startResponse.json();
    if (!startResult.success) {
      console.log(`⚠️  Session start response:`, startResult);
    }

    // 2. 导航到微博
    console.log('2️⃣ Navigating to Weibo...');
    const navResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:navigate',
        payload: {
          sessionId: 'weibo_fresh',
          url: 'https://weibo.com',
          waitUntil: 'domcontentloaded',
          timeoutMs: 30000
        }
      })
    });

    const navResult = await navResponse.json();
    console.log(`✅ Navigated to: ${navResult.data?.url || 'unknown'}\n`);

    // 3. 等待页面加载
    console.log('3️⃣ Waiting for page to load...');
    await new Promise(r => setTimeout(r, 10000)); // 等待 10 秒

    // 4. 检查页面状态
    console.log('4️⃣ Checking page status...');
    const checkResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: `
            (function() {
              return {
                url: window.location.href,
                title: document.title,
                hasLoginCard: !!document.querySelector('.LoginCard, [class*="LoginCard"]'),
                hasFrame: !!document.querySelector('[class*="Frame_wrap_"]'),
                hasFeed: !!document.querySelector('[class*="Feed_wrap_"], [class*="Feed_body_"]'),
                bodyClass: document.body.className,
                loginButtons: document.querySelectorAll('button, a').length
              };
            })()
          `
        }
      })
    });

    const checkResult = await checkResponse.json();
    const pageData = checkResult.data;

    console.log('📋 Page Status:');
    console.log(`   URL: ${pageData?.url || 'N/A'}`);
    console.log(`   Title: ${pageData?.title || 'N/A'}`);
    console.log(`   Has Login Card: ${pageData?.hasLoginCard || false}`);
    console.log(`   Has Frame: ${pageData?.hasFrame || false}`);
    console.log(`   Has Feed: ${pageData?.hasFeed || false}`);
    console.log(`   Body Class: ${pageData?.bodyClass || 'N/A'}`);
    console.log(`   Login Elements: ${pageData?.loginButtons || 0}\n`);

    if (pageData?.hasLoginCard) {
      console.log('🔐 Login page detected. Please log in manually.');
      console.log('💡 Use the opened browser window to complete login.');
    } else if (pageData?.hasFrame || pageData?.hasFeed) {
      console.log('✅ Already logged in or feed is visible.');
      console.log('✅ Ready for post extraction.');
    } else {
      console.log('❓ Unknown page state. Please check the browser.');
    }

    console.log('\n📋 Next Step: Wait for login completion then run extraction test.');
    console.log('⏰ Waiting 30 seconds for manual login...');
    await new Promise(r => setTimeout(r, 30000));

    // 5. 再次检查状态
    console.log('\n5️⃣ Re-checking status after login wait...');
    const finalCheck = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: `
            (function() {
              return {
                url: window.location.href,
                hasLoginCard: !!document.querySelector('.LoginCard, [class*="LoginCard"]'),
                hasFrame: !!document.querySelector('[class*="Frame_wrap_"]'),
                hasFeed: !!document.querySelector('[class*="Feed_wrap_"], [class*="Feed_body_"]')
              };
            })()
          `
        }
      })
    });

    const finalData = await finalCheck.json();
    console.log(`   Final URL: ${finalData.data?.url || 'N/A'}`);
    console.log(`   Has Login Card: ${finalData.data?.hasLoginCard || false}`);
    console.log(`   Has Frame: ${finalData.data?.hasFrame || false}`);
    console.log(`   Has Feed: ${finalData.data?.hasFeed || false}`);

    if (finalData.data?.hasFrame || finalData.data?.hasFeed) {
      console.log('\n✅ Browser is ready for extraction!');
    } else {
      console.log('\n❌ Still not ready. Please ensure you are logged in.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

startBrowserAndNavigate().catch(console.error);
