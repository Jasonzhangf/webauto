#!/usr/bin/env node
/**
 * 批量迁移已有 profile 的指纹
 * 扫描 ~/.webauto/profiles，为缺失指纹的 profile 生成指纹
 */

import { readdirSync, statSync } from 'fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { generateAndSaveFingerprint, getFingerprintPath, loadFingerprint } from '../dist/libs/browser/fingerprint-manager.js';

function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function migrateFingerprints() {
  const profilesRoot = path.join(homedir(), '.webauto', 'profiles');
  const entries = readdirSync(profilesRoot);

  console.log('🔄 Migrating fingerprints for existing profiles');
  console.log(`  profiles root: ${profilesRoot}`);

  const profiles = [];
  for (const entry of entries) {
    const entryPath = path.join(profilesRoot, entry);
    if (!isDirectory(entryPath)) continue;
    profiles.push(entry);
  }

  console.log(`  found ${profiles.length} profiles`);

  const migrated = [];
  const skipped = [];
  const failed = [];

  for (const profileId of profiles) {
    const fpPath = getFingerprintPath(profileId);

    // 检查是否已有指纹
    const existing = await loadFingerprint(fpPath);
    if (existing) {
      console.log(`  ⏭️  ${profileId}: already has fingerprint`);
      skipped.push(profileId);
      continue;
    }

    // 生成指纹（随机 Win/Mac）
    try {
      const { fingerprint } = await generateAndSaveFingerprint(profileId);
      console.log(`  ✅ ${profileId}: ${fingerprint.platform} (${fingerprint.osVersion})`);
      migrated.push(profileId);
    } catch (err) {
      console.error(`  ❌ ${profileId}: ${err?.message || err}`);
      failed.push(profileId);
    }
  }

  console.log(`\n--- Migration Summary ---`);
  console.log(`  Total profiles: ${profiles.length}`);
  console.log(`  Migrated: ${migrated.length}`);
  console.log(`  Skipped: ${skipped.length}`);
  console.log(`  Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log(`\n❌ Failed profiles: ${failed.join(', ')}`);
  }

  return failed.length === 0;
}

migrateFingerprints().then(success => process.exit(success ? 0 : 1)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
