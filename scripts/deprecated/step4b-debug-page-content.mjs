#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 调试页面内容
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

async function debugPageContent() {
  console.log('🔍 Debugging Page Content');
  console.log('============================\n');

  try {
    // 1. 获取页面 HTML 片段
    console.log('1️⃣ Getting page HTML snippet...');
    const htmlResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: `
            (function() {
              // 返回页面的关键信息
              return {
                url: window.location.href,
                title: document.title,
                bodyClass: document.body.className,
                hasLoginCard: !!document.querySelector('.LoginCard, [class*="LoginCard"]'),
                hasFrame: !!document.querySelector('[class*="Frame_wrap_"]'),
                hasFeed: !!document.querySelector('[class*="Feed_wrap_"], [class*="Feed_body_"]'),
                hasVueRecycle: !!document.querySelector('.vue-recycle-scroller'),
                allFeeds: document.querySelectorAll('[class*="Feed_wrap_"], [class*="Feed_body_"]').length,
                firstFeedHTML: document.querySelector('[class*="Feed_wrap_"], [class*="Feed_body_"]')?.innerHTML?.substring(0, 500) || '',
                bodyStart: document.body.innerHTML.substring(0, 2000)
              };
            })()
          `
        }
      })
    });

    const htmlResult = await htmlResponse.json();
    console.log('📋 Page Analysis:');
    console.log(`   URL: ${htmlResult.data?.url || 'N/A'}`);
    console.log(`   Title: ${htmlResult.data?.title || 'N/A'}`);
    console.log(`   Body Class: ${htmlResult.data?.bodyClass || 'N/A'}`);
    console.log(`   Has Login Card: ${htmlResult.data?.hasLoginCard || false}`);
    console.log(`   Has Frame: ${htmlResult.data?.hasFrame || false}`);
    console.log(`   Has Feed: ${htmlResult.data?.hasFeed || false}`);
    console.log(`   Has Vue Recycle: ${htmlResult.data?.hasVueRecycle || false}`);
    console.log(`   Feed Count: ${htmlResult.data?.allFeeds || 0}`);
    console.log(`\n   First Feed HTML (first 500 chars):`);
    console.log(`   ${htmlResult.data?.firstFeedHTML || 'N/A'}`);
    console.log(`\n   Body HTML (first 2000 chars):`);
    console.log(`   ${htmlResult.data?.bodyStart || 'N/A'}`);

    // 2. 截图保存
    console.log('\n2️⃣ Taking screenshot...');
    const screenshotResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:screenshot',
        payload: { sessionId: 'weibo_fresh', fullPage: false }
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
      const screenshotPath = path.join(__dirname, 'debug-screenshot.png');
      
      await fs.writeFile(screenshotPath, Buffer.from(base64Data, 'base64'));
      console.log(`   ✅ Screenshot saved to: ${screenshotPath}\n`);
    }

    // 3. 总结
    console.log('\n📋 Summary:');
    if (htmlResult.data?.hasFeed || htmlResult.data?.allFeeds > 0) {
      console.log('   ✅ Feed is present in page');
      console.log('   ✅ Ready to test post extraction');
    } else if (htmlResult.data?.hasFrame) {
      console.log('   ✅ Frame is present (logged in)');
      console.log('   ⚠️  But no feed visible - maybe still loading?');
    } else if (htmlResult.data?.hasLoginCard) {
      console.log('   ❌ Login page detected');
      console.log('   📝 Please log in manually');
    } else {
      console.log('   ❓ Unknown page state');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugPageContent().catch(console.error);
