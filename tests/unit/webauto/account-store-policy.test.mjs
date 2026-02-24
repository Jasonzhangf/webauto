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
  markProfilePending,
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

it('profile becomes saved only after xiaohongshu + weibo account ids are both bound', () => {
  const root = useTempRoot();
  fs.mkdirSync(path.join(root, 'profiles', 'dual-1'), { recursive: true });

  upsertProfileAccountState({
    profileId: 'dual-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-dual-1',
  });
  assert.equal(isProfileSaved('dual-1'), false);

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

it('cleanupIncompleteProfiles removes partially bound profiles and keeps fully bound profiles', () => {
  const root = useTempRoot();
  fs.mkdirSync(path.join(root, 'profiles', 'partial-1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'profiles', 'full-1'), { recursive: true });

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

  const cleanup = cleanupIncompleteProfiles();
  assert.deepEqual(cleanup.removedProfiles, ['partial-1']);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'partial-1')), false);
  assert.equal(fs.existsSync(path.join(root, 'profiles', 'full-1')), true);
  assert.deepEqual(listSavedProfiles(), ['full-1']);
});
