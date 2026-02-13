#!/usr/bin/env node
/**
 * 测试 Camoufox 引擎启动
 * 用法：node scripts/test-camoufox-engine.mjs [--profile <profileId>] [--url <url>]
 */

import minimist from 'minimist';
import EngineManager from '../libs/browser/engine-manager.js';
import { loadOrGenerateFingerprint, getFingerprintPath, applyFingerprint } from '../dist/libs/browser/fingerprint-manager.js';
import path from 'node:path';
import { homedir } from 'node:os';

const args = minimist(process.argv.slice(2));
const profileId = String(args.profile || 'test-camoufox').trim();
const initialUrl = String(args.url || 'https://www.xiaohongshu.com').trim();
const headless = args.headless === true || args.headless === '1';

async function testCamoufoxEngine() {
  console.log('🦊 Testing Camoufox Engine');
  console.log(`  profile: ${profileId}`);
  console.log(`  url: ${initialUrl}`);
  console.log(`  headless: ${headless}`);

  const profileDir = path.join(homedir(), '.webauto', 'profiles', profileId);
  
  try {
    // 加载或生成指纹
    const fingerprint = await loadOrGenerateFingerprint(profileId, { platform: 'macos' });
    console.log('✓ Fingerprint loaded:');
    console.log(`  platform: ${fingerprint.platform}`);
    console.log(`  userAgent: ${fingerprint.userAgent?.substring(0, 60)}...`);
    console.log(`  path: ${getFingerprintPath(profileId)}`);

    // 使用 EngineManager 启动 Camoufox
    const engine = new EngineManager('camoufox');
    console.log('✓ EngineManager created (camoufox)');

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

    // 应用我们的指纹补丁（覆盖 navigator 字段，避免差异）
    await applyFingerprint(context, fingerprint);
    console.log('✓ Fingerprint applied');

    // 获取或创建页面
    const pages = context.pages();
    let page = pages.length > 0 ? pages[0] : await context.newPage();
    console.log('✓ Page ready');

    // 导航到目标 URL
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    console.log(`✓ Navigated to ${initialUrl}`);

    // 获取当前 URL 和标题
    const currentUrl = page.url();
    const title = await page.title();
    console.log(`✓ Current URL: ${currentUrl}`);
    console.log(`✓ Title: ${title}`);

    // 验证指纹是否应用
    const ua = await page.evaluate(() => navigator.userAgent);
    console.log(`✓ Browser UA: ${ua.substring(0, 60)}...`);
    
    const platform = await page.evaluate(() => navigator.platform);
    console.log(`✓ Platform: ${platform}`);

    // 截图
    if (!headless) {
      await page.screenshot({ path: path.join(profileDir, 'screenshot-camoufox.png'), fullPage: false });
      console.log(`✓ Screenshot saved to ${path.join(profileDir, 'screenshot-camoufox.png')}`);
    }

    console.log('\n✅ Camoufox engine test PASSED');
    await context.close();
    return true;
  } catch (err) {
    console.error('\n❌ Camoufox engine test FAILED:', err?.message || err);
    console.error(err?.stack || '');
    return false;
  }
}

testCamoufoxEngine().then(success => process.exit(success ? 0 : 1)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
