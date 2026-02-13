#!/usr/bin/env node
/**
 * 测试指纹生成与应用（Chromium 引擎）
 * 验证不同 profile 有不同的指纹
 */

import minimist from 'minimist';
import { generateAndSaveFingerprint, loadFingerprint, getFingerprintPath } from '../dist/libs/browser/fingerprint-manager.js';
import path from 'node:path';
import { homedir } from 'node:os';

const args = minimist(process.argv.slice(2));
const count = Math.max(2, Math.min(10, Number(args.count) || 3));
const prefix = String(args.prefix || 'test-fp').trim();
const platform = args.platform ? String(args.platform).trim() : null; // 'windows' | 'macos' | null

async function testFingerprints() {
  console.log('🧪 Testing Fingerprints');
  console.log(`  prefix: ${prefix}`);
  console.log(`  count: ${count}`);
  console.log(`  platform: ${platform || 'auto (win/mac random)'}`);

  const results = [];
  const fingerprints = new Map();

  for (let i = 0; i < count; i++) {
    const profileId = `${prefix}-${i + 1}`;
    console.log(`\n--- Profile ${i + 1}/${count}: ${profileId} ---`);

    try {
      const { fingerprint, path } = await generateAndSaveFingerprint(profileId, { platform });
      const fpPath = getFingerprintPath(profileId);

      const saved = await loadFingerprint(fpPath);
      const loaded = saved?.profileId === profileId && saved.platform === fingerprint.platform;

      const result = {
        profileId,
        path: fpPath,
        platform: fingerprint.platform,
        osVersion: fingerprint.osVersion,
        userAgent: fingerprint.userAgent.substring(0, 50) + '...',
        viewport: `${fingerprint.viewport.width}x${fingerprint.viewport.height}`,
        hardwareConcurrency: fingerprint.hardwareConcurrency,
        deviceMemory: fingerprint.deviceMemory,
        timezoneId: fingerprint.timezoneId,
        saved: path === fpPath,
        loaded,
        originalPlatform: fingerprint.originalPlatform,
      };

      results.push(result);
      fingerprints.set(profileId, fingerprint);

      console.log(`✓ Generated: ${fingerprint.platform} (${fingerprint.osVersion})`);
      console.log(`  UA: ${result.userAgent}`);
      console.log(`  Viewport: ${result.viewport}`);
      console.log(`  CPU: ${fingerprint.hardwareConcurrency}, RAM: ${fingerprint.deviceMemory}GB`);
      console.log(`  Path: ${fpPath}`);
      console.log(`  Saved: ${result.saved}`);
      console.log(`  Loaded: ${loaded}`);
    } catch (err) {
      console.error(`✗ Failed: ${err?.message || err}`);
      results.push({ profileId, error: err?.message || String(err) });
    }
  }

  // 验证指纹是否不同
  console.log('\n--- Verification ---');
  const uaSet = new Set();
  const platformSet = new Set();
  const viewportSet = new Set();

  for (const result of results) {
    if (!result.error) {
      uaSet.add(result.userAgent);
      platformSet.add(result.platform);
      viewportSet.add(result.viewport);
    }
  }

  console.log(`Unique User-Agents: ${uaSet.size}/${count}`);
  console.log(`Unique Platforms: ${platformSet.size}/${count}`);
  console.log(`Unique Viewports: ${viewportSet.size}/${count}`);

  const allUnique = uaSet.size === count && viewportSet.size === count;
  console.log(`\nAll fingerprints unique: ${allUnique ? '✅ YES' : '❌ NO'}`);

  // 详细对比
  if (!allUnique) {
    console.log('\n--- Duplicate Detection ---');
    const uaCounts = {};
    for (const ua of uaSet) {
      uaCounts[ua] = results.filter(r => r.userAgent === ua).map(r => r.profileId);
    }
    for (const [ua, profiles] of Object.entries(uaCounts)) {
      if (profiles.length > 1) {
        console.log(`⚠️ Same UA: ${profiles.join(', ')}`);
      }
    }
  }

  // Win/Mac 分布
  const platformCounts = { Win32: 0, MacIntel: 0 };
  for (const result of results) {
    if (result.platform) {
      platformCounts[result.platform] = (platformCounts[result.platform] || 0) + 1;
    }
  }
  console.log(`\nPlatform Distribution: Win32=${platformCounts.Win32}, MacIntel=${platformCounts.MacIntel}`);

  const success = results.every(r => !r.error) && allUnique;
  console.log(`\n${success ? '✅' : '❌'} Test ${success ? 'PASSED' : 'FAILED'}`);

  return success;
}

testFingerprints().then(success => process.exit(success ? 0 : 1)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
