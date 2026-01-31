#!/usr/bin/env node
/**
 * Camoufox 基础 API 回归测试
 *
 * 目标：在不依赖浏览器服务的情况下，验证 Camoufox 作为默认引擎时
 * Playwright 常用 API 是否可用（goto/evaluate/screenshot/mouse/keyboard/cookies）。
 *
 * 注意：遵守“系统级点击/输入”原则，这里只使用 page.mouse/page.keyboard。
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Camoufox } = require('camoufox');

async function main() {
  console.log('🧪 Testing Camoufox Basic APIs\n');

  const context = await Camoufox({
    headless: true,
    os: ['macos', 'windows'],
    window: [1280, 720],
    data_dir: '/tmp/test-camoufox-single',
  });

  try {
    const page = context.pages()[0] || (await context.newPage());

    console.log('Testing page.goto...');
    await page.goto('https://www.baidu.com', { waitUntil: 'domcontentloaded' });
    console.log(`✅ URL: ${page.url()}`);

    console.log('\nTesting page.title...');
    const title = await page.title();
    console.log(`✅ Title: ${title}`);

    console.log('\nTesting page.evaluate...');
    const info = await page.evaluate(() => ({
      ua: navigator.userAgent.substring(0, 80),
      platform: navigator.platform,
    }));
    console.log(`✅ UA: ${info.ua}...`);
    console.log(`✅ Platform: ${info.platform}`);

    console.log('\nTesting page.screenshot...');
    const buffer = await page.screenshot({ fullPage: false });
    console.log(`✅ Screenshot size: ${buffer.length} bytes`);

    console.log('\nTesting page.$...');
    const input = await page.$('#kw');
    if (!input) throw new Error('input not found (#kw)');
    console.log('✅ Found input');

    console.log('\nTesting page.mouse.click...');
    const rect = await page.evaluate(() => {
      const el = document.querySelector('#kw');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (!rect) throw new Error('input rect not found');
    await page.mouse.click(rect.x + Math.max(5, rect.width / 2), rect.y + Math.max(5, rect.height / 2));
    console.log('✅ Mouse clicked input');

    console.log('\nTesting page.keyboard.type...');
    await page.keyboard.type('test');
    const value = await page.evaluate(() => document.querySelector('#kw')?.value);
    if (value !== 'test') throw new Error(`unexpected input value: ${value}`);
    console.log(`✅ Input value: ${value}`);

    console.log('\nTesting context.cookies...');
    const cookies = await context.cookies();
    console.log(`✅ Cookies count: ${cookies.length}`);

    console.log('\nTesting context.addCookies...');
    await context.addCookies([{ name: 'test_cookie', value: 'test_value', domain: '.baidu.com', path: '/' }]);
    const newCookies = await context.cookies();
    const hasTest = newCookies.some((c) => c.name === 'test_cookie');
    if (!hasTest) throw new Error('failed to add cookie');
    console.log('✅ Added cookie');

    console.log('\n✅ All API tests passed!');
    await context.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed:', err?.message || err);
    await context.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
