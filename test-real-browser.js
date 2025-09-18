#!/usr/bin/env node

import { chromium } from 'playwright';

(async () => {
  console.log('🎯 Testing real browser launch with Weibo...');

  try {
    console.log('🚀 Starting browser (non-headless)...');
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });

    console.log('✅ Browser started successfully!');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    console.log('🌐 Navigating to Weibo homepage...');
    await page.goto('https://weibo.com', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('✅ Successfully navigated to Weibo!');
    console.log(`📄 Page title: ${await page.title()}`);
    console.log(`🔗 Page URL: ${page.url()}`);

    // Wait for user to see the result
    console.log('⏳ Keeping browser open for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    await browser.close();
    console.log('🛑 Browser closed successfully');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();