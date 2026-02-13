#!/usr/bin/env node
/**
 * 测试 ProfilePool + 指纹管理集成
 * 验证：创建 profile 时自动生成指纹，不同 profile 有不同指纹
 */

import { addProfile, listProfilesForPool, resolveProfilesRoot } from './xiaohongshu/lib/profilepool.mjs';
import { loadFingerprint, getFingerprintPath } from '../libs/browser/fingerprint-manager.js';
import path from 'node:path';

async function testProfilePoolFingerprint() {
  console.log('🧪 Testing ProfilePool + Fingerprint Integration');

  const prefix = 'test-pool-fp';
  const count = 3;

  // 1. 创建多个 profile
  console.log(`\n--- Creating ${count} profiles with prefix "${prefix}" ---`);
  const createdProfiles = [];
  for (let i = 0; i < count; i++) {
    const { profileId, profileDir, fingerprintPath } = await addProfile(prefix);
    console.log(`✓ Created: ${profileId}`);
    createdProfiles.push({ profileId, profileDir, fingerprintPath });
  }

  // 2. 验证 ProfilePool 列表
  console.log(`\n--- Verifying ProfilePool list ---`);
  const profiles = listProfilesForPool(prefix);
  console.log(`✓ Total profiles: ${profiles.length}`);
  profiles.forEach(p => console.log(`  - ${p}`));

  if (profiles.length !== count) {
    console.error(`❌ Expected ${count} profiles, got ${profiles.length}`);
    return false;
  }

  // 3. 验证指纹文件
  console.log(`\n--- Verifying fingerprints ---`);
  const fingerprints = new Map();
  for (const profileId of profiles) {
    const fpPath = getFingerprintPath(profileId);
    const fp = await loadFingerprint(fpPath);

    if (!fp) {
      console.error(`✗ No fingerprint for ${profileId}`);
      return false;
    }

    fingerprints.set(profileId, fp);
    console.log(`✓ ${profileId}: ${fp.platform} (${fp.osVersion})`);
    console.log(`  UA: ${fp.userAgent.substring(0, 50)}...`);
  }

  // 4. 验证指纹唯一性
  console.log(`\n--- Verifying fingerprint uniqueness ---`);
  const uaSet = new Set();
  const platformSet = new Set();
  const viewportSet = new Set();

  for (const [profileId, fp] of fingerprints) {
    uaSet.add(fp.userAgent);
    platformSet.add(fp.platform);
    viewportSet.add(`${fp.viewport.width}x${fp.viewport.height}`);
  }

  console.log(`Unique User-Agents: ${uaSet.size}/${count}`);
  console.log(`Unique Platforms: ${platformSet.size}/${count}`);
  console.log(`Unique Viewports: ${viewportSet.size}/${count}`);

  // UA 可能在同一平台下重复（这是可接受的），核心要求是整体指纹参数不一致
  const allUnique = viewportSet.size === count;
  console.log(`\nAll fingerprints unique: ${allUnique ? '✅ YES' : '❌ NO'}`);

  // 5. 平台分布
  console.log(`\n--- Platform distribution ---`);
  const platformCounts = { Win32: 0, MacIntel: 0 };
  for (const fp of fingerprints.values()) {
    platformCounts[fp.platform] = (platformCounts[fp.platform] || 0) + 1;
  }
  console.log(`Win32: ${platformCounts.Win32}, MacIntel: ${platformCounts.MacIntel}`);

  // 6. 清理测试数据
  console.log(`\n--- Cleaning up ---`);
  const fs = await import('fs/promises');
  const profileRoot = resolveProfilesRoot();

  for (const profileId of profiles) {
    // 删除 profile 目录
    const profilePath = path.join(profileRoot, profileId);
    try {
      await fs.rm(profilePath, { recursive: true, force: true });
      console.log(`✓ Removed profile: ${profileId}`);
    } catch {}

    // 删除指纹文件
    const fpPath = getFingerprintPath(profileId);
    try {
      await fs.unlink(fpPath);
      console.log(`✓ Removed fingerprint: ${profileId}`);
    } catch {}
  }

  const success = profiles.length === count && allUnique;
  console.log(`\n${success ? '✅' : '❌'} Test ${success ? 'PASSED' : 'FAILED'}`);

  return success;
}

testProfilePoolFingerprint().then(success => process.exit(success ? 0 : 1)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
