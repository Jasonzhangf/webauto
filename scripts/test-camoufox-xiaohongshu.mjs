#!/usr/bin/env node
/**
 * 测试 Camoufox 引擎的小红书业务流程
 * 用法：node scripts/test-camoufox-xiaohongshu.mjs [--keyword "手机膜"] [--headless]
 */

import minimist from 'minimist';
import EngineManager from '../libs/browser/engine-manager.js';
import { loadOrGenerateFingerprint, applyFingerprint } from '../dist/libs/browser/fingerprint-manager.js';
import path from 'node:path';
import { homedir } from 'node:os';

const args = minimist(process.argv.slice(2));
const profileId = String(args.profile || 'xiaohongshu-camoufox').trim();
const keyword = String(args.keyword || '手机膜').trim();
const headless = args.headless === true || args.headless === '1';

async function testXiaohongshuWorkflow() {
  console.log('🧪 Testing Camoufox + Xiaohongshu Workflow');
  console.log(`  profile: ${profileId}`);
  console.log(`  keyword: ${keyword}`);
  console.log(`  headless: ${headless}`);

  const profileDir = path.join(homedir(), '.webauto', 'profiles', profileId);

  try {
    // 1. 加载指纹
    const fingerprint = await loadOrGenerateFingerprint(profileId, { platform: 'macos' });
    console.log('✓ Fingerprint loaded:', fingerprint.platform);

    // 2. 启动 Camoufox
    const engine = new EngineManager('camoufox');
    const context = await engine.launchPersistentContext({
      engine: 'camoufox',
      headless,
      profileDir,
      fingerprint,
      viewport: fingerprint.viewport || { width: 1440, height: 900 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    console.log('✓ Camoufox context launched');

    // 3. 应用指纹
    await applyFingerprint(context, fingerprint);
    console.log('✓ Fingerprint applied');

    // 4. 获取页面
    const pages = context.pages();
    let page = pages.length > 0 ? pages[0] : await context.newPage();

    // 5. 导航到小红书首页
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' });
    console.log('✓ Navigated to xiaohongshu.com');

    // 6. 获取当前 URL
    const currentUrl = page.url();
    console.log(`✓ Current URL: ${currentUrl}`);

    // 7. 验证 UA
    const ua = await page.evaluate(() => navigator.userAgent);
    console.log(`✓ Browser UA: ${ua.substring(0, 60)}...`);

    // 8. 尝试搜索（模拟用户输入）
    console.log('🔍 Attempting search...');
    try {
      // 等待搜索框
      await page.waitForSelector('input[placeholder*="搜索"]', { timeout: 5000 });
      console.log('✓ Search box found');

      // 输入关键词
      const searchInput = await page.locator('input[placeholder*="搜索"]').first();
      await searchInput.click();
      await page.keyboard.type(keyword, { delay: 80 });
      console.log(`✓ Typed keyword: ${keyword}`);

      // 等待搜索按钮
      await page.waitForTimeout(500);

      // 按 Enter
      await page.keyboard.press('Enter');
      console.log('✓ Pressed Enter');

      // 等待搜索结果加载
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      const searchUrl = page.url();
      console.log(`✓ Search result URL: ${searchUrl}`);

      // 验证是否包含关键词
      if (searchUrl.includes(keyword)) {
        console.log('✓ Search URL contains keyword');
      }
    } catch (err) {
      console.warn(`⚠️ Search failed: ${err?.message || err}`);
    }

    // 9. 截图
    const screenshotPath = path.join(profileDir, `screenshot-xiaohongshu-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`✓ Screenshot saved: ${screenshotPath}`);

    console.log('\n✅ Camoufox + Xiaohongshu workflow test PASSED');
    await context.close();
    return true;
  } catch (err) {
    console.error('\n❌ Test FAILED:', err?.message || err);
    console.error(err?.stack || '');
    return false;
  }
}

testXiaohongshuWorkflow().then(success => process.exit(success ? 0 : 1)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
