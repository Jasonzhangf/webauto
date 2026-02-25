import { afterEach, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { assertProfileUsable, assertProfilesUsable, isTemporaryProfileId } from '../../../apps/webauto/entry/lib/profile-policy.mjs';
import { upsertProfileAccountState } from '../../../apps/webauto/entry/lib/account-store.mjs';

const envKeys = ['WEBAUTO_HOME', 'WEBAUTO_PATHS_PROFILES', 'WEBAUTO_PATHS_ACCOUNTS'];
let envSnapshot = null;
const tempRoots = [];

function withTempProfileRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-profile-policy-'));
  tempRoots.push(root);
  if (!envSnapshot) {
    envSnapshot = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  }
  process.env.WEBAUTO_HOME = root;
  delete process.env.WEBAUTO_PATHS_PROFILES;
  delete process.env.WEBAUTO_PATHS_ACCOUNTS;
  const profilesRoot = path.join(root, 'profiles');
  fs.mkdirSync(profilesRoot, { recursive: true });
  return profilesRoot;
}

function seedSavedProfile(profileId) {
  upsertProfileAccountState({
    profileId,
    platform: 'xiaohongshu',
    accountId: `xhs-${profileId}`,
    detectedAt: '2026-01-01T00:00:00.000Z',
  });
  upsertProfileAccountState({
    profileId,
    platform: 'weibo',
    accountId: `wb-${profileId}`,
    detectedAt: '2026-01-01T00:00:00.000Z',
  });
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

it('accepts only pre-created non-temporary profiles', () => {
  const profilesRoot = withTempProfileRoot();
  fs.mkdirSync(path.join(profilesRoot, 'xiaohongshu-batch-3'), { recursive: true });
  seedSavedProfile('xiaohongshu-batch-3');

  assert.equal(assertProfileUsable('xiaohongshu-batch-3'), 'xiaohongshu-batch-3');
  assert.deepEqual(assertProfilesUsable(['xiaohongshu-batch-3', 'xiaohongshu-batch-3']), ['xiaohongshu-batch-3']);
});

it('rejects missing profiles', () => {
  withTempProfileRoot();
  assert.throws(
    () => assertProfileUsable('xiaohongshu-batch-3'),
    /profile not found/i,
  );
});

it('rejects temporary profile ids even when directory exists', () => {
  const profilesRoot = withTempProfileRoot();
  fs.mkdirSync(path.join(profilesRoot, 'test-profile'), { recursive: true });
  fs.mkdirSync(path.join(profilesRoot, 'profile-0'), { recursive: true });
  seedSavedProfile('test-profile');
  seedSavedProfile('profile-0');

  assert.equal(isTemporaryProfileId('test-profile'), true);
  assert.equal(isTemporaryProfileId('profile-0'), true);
  assert.throws(() => assertProfileUsable('test-profile'), /forbidden temporary profileId/i);
  assert.throws(() => assertProfileUsable('profile-0'), /forbidden temporary profileId/i);
});

it('accepts profile with one valid platform binding', () => {
  const profilesRoot = withTempProfileRoot();
  fs.mkdirSync(path.join(profilesRoot, 'xhs-only-1'), { recursive: true });
  upsertProfileAccountState({
    profileId: 'xhs-only-1',
    platform: 'xiaohongshu',
    accountId: 'xhs-only',
  });

  assert.equal(assertProfileUsable('xhs-only-1'), 'xhs-only-1');
});
