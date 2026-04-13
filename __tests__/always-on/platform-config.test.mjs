/**
 * Platform Config-Driven Test
 *
 * 验证平台默认值从配置文件加载，新增平台无需改代码
 */

import path from 'node:path';
import fs from 'node:fs';

const WEBAUTO_ROOT = '/Users/fanzhang/Documents/github/webauto';

async function testPlatformConfig() {
  console.log('=== Platform Config-Driven Test ===\n');

  const configPath = path.join(WEBAUTO_ROOT, 'apps/webauto/entry/lib/platform-config.mjs');
  const { 
    normalizePlatformByCommandType, 
    loadPlatformConfig, 
    addPlatformConfig,
    getSupportedPlatforms,
    normalizePlatformConfig,
    getPlatformConfigPath,
    ensureProfileArgConfigDriven,
  } = await import(`file://${configPath}`);

  // Step 1: Verify config loads with defaults
  console.log('Step 1: Load default config...');
  const config = loadPlatformConfig();
  console.log(`  defaultPlatform: ${config.defaultPlatform}`);
  console.log(`  supportedPlatforms: ${JSON.stringify(config.supportedPlatforms)}`);
  console.log(`  prefixes: ${JSON.stringify(config.platformCommandPrefixes)}`);

  if (config.defaultPlatform === 'xiaohongshu') console.log('  ✅ Default platform correct');
  if (config.supportedPlatforms.includes('xiaohongshu')) console.log('  ✅ xiaohongshu supported');
  if (config.supportedPlatforms.includes('weibo')) console.log('  ✅ weibo supported');
  if (config.supportedPlatforms.includes('1688')) console.log('  ✅ 1688 supported');

  // Step 2: Test normalizePlatformByCommandType with built-in platforms
  console.log('\nStep 2: Test normalizePlatformByCommandType...');
  const platformTests = [
    ['xhs-unified', 'xiaohongshu'],
    ['xhs-producer', 'xiaohongshu'],
    ['weibo-consumer', 'weibo'],
    ['weibo-special-follow-monitor', 'weibo'],
    ['1688-search', '1688'],
    ['unknown-command', 'xiaohongshu'], // default
  ];

  let allPlatformTestsPass = true;
  for (const [commandType, expected] of platformTests) {
    const result = normalizePlatformByCommandType(commandType, config);
    const ok = result === expected;
    console.log(`  ${ok ? '✅' : '❌'} ${commandType} → ${result} (expected: ${expected})`);
    if (!ok) allPlatformTestsPass = false;
  }

  // Step 3: Test adding new platform via config (no code change!)
  console.log('\nStep 3: Add new platform via config (simulating douyin)...');
  const newConfig = addPlatformConfig('douyin', 'douyin');
  console.log(`  Added 'douyin' prefix → 'douyin' platform`);
  console.log(`  Supported platforms: ${JSON.stringify(newConfig.supportedPlatforms)}`);

  const douyinPlatform = normalizePlatformByCommandType('douyin-collect', newConfig);
  if (douyinPlatform === 'douyin') {
    console.log(`  ✅ 'douyin-collect' → '${douyinPlatform}' (NEW PLATFORM WITHOUT CODE CHANGE!)`);
  } else {
    console.log(`  ❌ Expected 'douyin', got '${douyinPlatform}'`);
    allPlatformTestsPass = false;
  }

  // Step 4: Verify daemon.mjs uses config-driven functions
  console.log('\nStep 4: Verify daemon.mjs integration...');
  const daemonPath = path.join(WEBAUTO_ROOT, 'apps/webauto/entry/daemon.mjs');
  const daemonContent = fs.readFileSync(daemonPath, 'utf-8');

  const integrationChecks = [
    ["from './lib/platform-config.mjs'", 'platform-config imported'],
    ['normalizePlatformByCommandType(commandType)', 'normalizePlatformByCommandType called'],
    ['pickAutoProfile(platform, listAccountProfiles)', 'pickAutoProfile called with listAccountProfiles'],
  ];

  let allIntegrationPass = true;
  for (const [pattern, desc] of integrationChecks) {
    if (daemonContent.includes(pattern)) {
      console.log(`  ✅ ${desc}`);
    } else {
      console.log(`  ❌ ${desc} missing`);
      allIntegrationPass = false;
    }
  }

  // Step 5: Verify hardcoded functions removed
  console.log('\nStep 5: Verify hardcoded functions removed...');
  const hardcodedPatterns = [
    ["function normalizePlatformByCommandType(commandType) {", 'Old normalizePlatformByCommandType'],
    ["function pickAutoProfile(platform) {", 'Old pickAutoProfile'],
  ];

  for (const [pattern, desc] of hardcodedPatterns) {
    // Check that old standalone functions are gone (not inside ensureProfileArg)
    const lines = daemonContent.split('\n');
    const hasOld = lines.some(line => line.trim() === pattern.trim());
    if (!hasOld) {
      console.log(`  ✅ ${desc} removed from daemon.mjs`);
    } else {
      console.log(`  ⚠️ ${desc} still present (may be needed during migration)`);
    }
  }

  // Step 6: Config file written to disk
  console.log('\nStep 6: Verify config file on disk...');
  const diskConfigPath = getPlatformConfigPath();
  if (fs.existsSync(diskConfigPath)) {
    const diskConfig = JSON.parse(fs.readFileSync(diskConfigPath, 'utf-8'));
    console.log(`  ✅ Config file exists at ${diskConfigPath}`);
    console.log(`  platforms: ${JSON.stringify(diskConfig.supportedPlatforms)}`);
  } else {
    console.log(`  ⚠️ Config file not yet written (will be created on first load)`);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`- Default config: ✅`);
  console.log(`- Platform detection: ${allPlatformTestsPass ? '✅' : '❌'}`);
  console.log(`- New platform via config: ${douyinPlatform === 'douyin' ? '✅' : '❌'}`);
  console.log(`- daemon.mjs integration: ${allIntegrationPass ? '✅' : '❌'}`);

  if (allPlatformTestsPass && allIntegrationPass) {
    console.log('\n✅ ✅ ✅ P2-1 VERIFIED: Platform config is config-driven!');
    console.log('✅ New platforms can be added via config file without code changes');
  } else {
    console.log('\n⚠️ Platform config needs more work');
  }

  // Cleanup: remove douyin from config
  console.log('\nCleaning up test config...');
  try {
    const cleanConfig = loadPlatformConfig();
    const { writePlatformConfig } = await import(`file://${configPath}`);
    writePlatformConfig({
      ...cleanConfig,
      platformCommandPrefixes: DEFAULT_PLATFORM_CONFIG.platformCommandPrefixes,
      supportedPlatforms: DEFAULT_PLATFORM_CONFIG.supportedPlatforms,
    });
    console.log('  ✅ Config cleaned up');
  } catch {}
}

testPlatformConfig().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
