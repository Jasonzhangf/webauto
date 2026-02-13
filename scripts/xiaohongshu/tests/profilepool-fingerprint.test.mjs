import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { stat, rm } from 'node:fs/promises';

import { addProfile, listProfilesForPool, resolveProfilesRoot } from '../lib/profilepool.mjs';
import { getFingerprintPath, loadFingerprint } from '../../../dist/libs/browser/fingerprint-manager.js';

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test('profilepool addProfile creates profile dir and fingerprint', async () => {
  const prefix = `test-pool-fp-${Date.now().toString(36)}`;
  const created = await addProfile(prefix);
  const profileRoot = resolveProfilesRoot();
  const profileDir = created.profileDir || path.join(profileRoot, created.profileId);
  const fingerprintPath = created.fingerprintPath || getFingerprintPath(created.profileId);

  try {
    assert.equal(created.profileId.startsWith(prefix), true);
    assert.equal(await fileExists(profileDir), true);
    assert.equal(await fileExists(fingerprintPath), true);
    const fp = await loadFingerprint(fingerprintPath);
    assert.ok(fp && fp.userAgent && fp.platform, 'fingerprint should include userAgent/platform');
    const pool = listProfilesForPool(prefix);
    assert.ok(pool.includes(created.profileId), 'profilepool should include new profile');
  } finally {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    await rm(fingerprintPath, { force: true }).catch(() => {});
  }
});
