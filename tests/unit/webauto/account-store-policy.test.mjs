import { afterEach, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addAccount,
  cleanupIncompleteProfiles,
  isProfileSaved,
  listAccountProfiles,
  listSavedProfiles,
  markProfileInvalid,
  markProfilePending,
  updateAccount,
  upsertProfileAccountState,
} from '../../../apps/webauto/entry/lib/account-store.mjs';

const tempRoots = [];
const envKeys = ['WEBAUTO_HOME', 'WEBAUTO_PATHS_PROFILES', 'WEBAUTO_PATHS_ACCOUNTS'];
let envSnapshot = null;

function useTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-account-store-'));
  tempRoots.push(root);
  if (!envSnapshot) {
    envSnapshot = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  }
  process.env.WEBAUTO_HOME = root;
  delete process.env.WEBAUTO_PATHS_PROFILES;
  delete process.env.WEBAUTO_PATHS_ACCOUNTS;
  fs.mkdirSync(path.join(root, 'profiles'), { recursive: true });
  return root;
}

afterEach(() => {
  if (envSnapshot) {
    for (const key of envKeys) {
      const prev = envSnapshot[key];
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
    envSnapshot = null;
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
  }
});

it('addAccount blocks auto profile creation and requires existing profile dir', async () => {
  const root = useTempRoot();
  await assert.rejects(
    () => addAccount({ platform: 'xiaohongshu', accountId: 'xhs-a' }),
    /profileId is required/i,
  );
  await assert.rejects(
    () => addAccount({ platform: 'xiaohongshu', profileId: 'missing-1', accountId: 'xhs-a' }),
    /profile not found/i,
  );

  fs.mkdirSync(path.join(root, 'profiles', 'existing-1'), { recursive: true });
  const result = await addAccount({
    platform: 'xiaohongshu',
    profileId: 'existing-1',
    accountId: 'xhs-a',
  });
  assert.equal(result.account.profileId, 'existing-1');
});

it('profile becomes saved once any platform account id is persisted', () => {
  const root = useTempRoot();
  fs.mkdirSync(path.join(root, 'profiles', 'dual-1'), { recursive: true });

  upsertProfileAccountState({
    profileId: 'dual-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-dual-1',
  });
  assert.equal(isProfileSaved('dual-1'), true);

  upsertProfileAccountState({
    profileId: 'dual-1',
    platform: 'weibo',
    accountId: 'wb-dual-1',
  });
  assert.equal(isProfileSaved('dual-1'), true);

  const snapshot = listAccountProfiles();
  assert.deepEqual(snapshot.savedProfiles, ['dual-1']);
  assert.deepEqual(listSavedProfiles(), ['dual-1']);
});

it('pending state without accountId is not persisted', () => {
  const root = useTempRoot();
  fs.mkdirSync(path.join(root, 'profiles', 'pending-1'), { recursive: true });

  const pending = markProfilePending('pending-1', 'waiting_login', 'xiaohongshu');
  assert.equal(pending.profileId, 'pending-1');
  assert.equal(pending.valid, false);
  assert.equal(pending.status, 'pending');
  assert.equal(listAccountProfiles().profiles.length, 0);
  assert.equal(isProfileSaved('pending-1'), false);
});

it('cleanup keeps profile when accountId exists even if markProfileInvalid is called', () => {
  const root = useTempRoot();
  fs.mkdirSync(path.join(root, 'profiles', 'stale-id-1'), { recursive: true });

  upsertProfileAccountState({
    profileId: 'stale-id-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-stale-id-1',
  });
  assert.equal(isProfileSaved('stale-id-1'), true);

  const invalid = markProfileInvalid('stale-id-1', 'login_guard', 'xiaohongshu');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.accountId, 'xhs-stale-id-1');

  const cleanup = cleanupIncompleteProfiles();
  assert.deepEqual(cleanup.removedProfiles, []);
  assert.equal(isProfileSaved('stale-id-1'), true);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'stale-id-1')), true);
});

it('cleanupIncompleteProfiles keeps profiles with any persisted binding and purges profiles with no binding', async () => {
  const root = useTempRoot();
  fs.mkdirSync(path.join(root, 'profiles', 'partial-1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'profiles', 'full-1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'profiles', 'invalid-1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'profiles', 'empty-1'), { recursive: true });

  upsertProfileAccountState({
    profileId: 'partial-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-partial-1',
  });

  upsertProfileAccountState({
    profileId: 'full-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-full-1',
  });
  upsertProfileAccountState({
    profileId: 'full-1',
    platform: 'weibo',
    accountId: 'wb-full-1',
  });

  const invalidState = upsertProfileAccountState({
    profileId: 'invalid-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-invalid-1',
  });
  await updateAccount(invalidState.accountRecordId, {
    status: 'invalid',
    valid: false,
    reason: 'login_guard',
  });

  const cleanup = cleanupIncompleteProfiles();
  assert.deepEqual(cleanup.removedProfiles, ['empty-1']);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'partial-1')), true);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'invalid-1')), true);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'full-1')), true);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'empty-1')), false);
  assert.deepEqual(listSavedProfiles(), ['full-1', 'invalid-1', 'partial-1']);
});

it('cleanupIncompleteProfiles tolerates EPERM when deleting stale profile dir', () => {
  const root = useTempRoot();
  const staleDir = path.join(root, 'profiles', 'stale-locked-1');
  fs.mkdirSync(staleDir, { recursive: true });

  const originalRmSync = fs.rmSync;
  fs.rmSync = (targetPath, options) => {
    if (String(targetPath) === staleDir) {
      const err = new Error(`EPERM: operation not permitted, unlink '${targetPath}'`);
      err.code = 'EPERM';
      throw err;
    }
    return originalRmSync(targetPath, options);
  };
  try {
    const cleanup = cleanupIncompleteProfiles();
    assert.deepEqual(cleanup.removedProfiles, ['stale-locked-1']);
    assert.equal(Array.isArray(cleanup.failedProfileDirDeletes), true);
    assert.equal(cleanup.failedProfileDirDeletes.length, 1);
    assert.equal(cleanup.failedProfileDirDeletes[0].profileId, 'stale-locked-1');
    assert.equal(fs.existsSync(staleDir), true);
  } finally {
    fs.rmSync = originalRmSync;
  }
});
