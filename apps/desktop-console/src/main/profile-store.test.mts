import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createProfileStore } from './profile-store.mts';

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-desktop-console-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

await withTempDir(async (homeDir) => {
  const store = createProfileStore({ repoRoot: process.cwd(), homeDir });

  const list0 = await store.listProfiles();
  assert.deepStrictEqual(list0.profiles, []);

  const scan0 = await store.scanProfiles();
  assert.equal(scan0.ok, true);
  assert.equal(scan0.entries.length, 0);

  await store.profileCreate({ profileId: 'xiaohongshu_fresh' });
  const scan1 = await store.scanProfiles();
  assert.equal(scan1.entries.length, 1);
  assert.equal(scan1.entries[0]!.profileId, 'xiaohongshu_fresh');
  assert.equal(!!scan1.entries[0]!.fingerprint, false);

  const regen = await store.fingerprintRegenerate({ profileId: 'xiaohongshu_fresh', platform: 'random' });
  assert.equal(regen.ok, true);
  assert.ok(regen.fingerprint.userAgent);

  const scan2 = await store.scanProfiles();
  assert.equal(scan2.entries.length, 1);
  assert.equal(!!scan2.entries[0]!.fingerprint, true);

  const delFp = await store.fingerprintDelete({ profileId: 'xiaohongshu_fresh' });
  assert.equal(delFp.ok, true);
  const scan3 = await store.scanProfiles();
  assert.equal(!!scan3.entries[0]!.fingerprint, false);

  const delProfile = await store.profileDelete({ profileId: 'xiaohongshu_fresh', deleteFingerprint: true });
  assert.equal(delProfile.ok, true);
  const scan4 = await store.scanProfiles();
  assert.equal(scan4.entries.length, 0);

  await assert.rejects(() => store.profileCreate({ profileId: '../bad' }), /profileId/);
  await assert.rejects(() => store.profileCreate({ profileId: '' }), /profileId/);
});

