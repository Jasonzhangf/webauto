import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runUnified } from '../../../apps/webauto/entry/xhs-unified.mjs';
import { upsertProfileAccountState } from '../../../apps/webauto/entry/lib/account-store.mjs';

const tempRoots = [];
const trackedEnvKeys = ['WEBAUTO_DOWNLOAD_ROOT', 'WEBAUTO_PATHS_ACCOUNTS', 'WEBAUTO_HOME', 'WEBAUTO_PATHS_PROFILES'];
let envSnapshot = null;

function useTempRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-xhs-unified-'));
  tempRoots.push(root);
  if (!envSnapshot) {
    envSnapshot = Object.fromEntries(trackedEnvKeys.map((key) => [key, process.env[key]]));
  }
  process.env.WEBAUTO_DOWNLOAD_ROOT = path.join(root, 'download');
  process.env.WEBAUTO_PATHS_ACCOUNTS = path.join(root, 'accounts');
  process.env.WEBAUTO_HOME = root;
  delete process.env.WEBAUTO_PATHS_PROFILES;
  return root;
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
    for (const key of trackedEnvKeys) {
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
      // ignore
    }
  }
});

describe('xhs-unified', () => {
  it('plan-only mode skips account sync and returns plan', async () => {
    const root = useTempRoots();
    fs.mkdirSync(path.join(root, 'profiles', 'xhs-qa-1'), { recursive: true });
    seedSavedProfile('xhs-qa-1');
    const result = await runUnified({
      profile: 'xhs-qa-1',
      keyword: 'plan-only-test',
      'plan-only': true,
      'dry-run': true,
      'max-notes': 5,
    });

    assert.equal(result.ok, true);
    assert.equal(result.planOnly, true);
    assert.ok(result.planPath);

    const plan = JSON.parse(fs.readFileSync(result.planPath, 'utf8'));
    assert.equal(Array.isArray(plan.accountStates), true);
    assert.equal(plan.accountStates.length, 1);
    assert.equal(plan.accountStates[0].profileId, 'xhs-qa-1');
    assert.equal(plan.accountStates[0].status, 'plan_only_unverified');
    assert.equal(plan.accountStates[0].reason, 'plan_only_skip_account_sync');
  });

  it('non plan-only mode fails fast when runtime cannot finish collection', async () => {
    const root = useTempRoots();
    fs.mkdirSync(path.join(root, 'profiles', 'xhs-qa-1'), { recursive: true });
    seedSavedProfile('xhs-qa-1');
    await assert.rejects(
      () => runUnified({
        profile: 'xhs-qa-1',
        keyword: 'need-account',
        'dry-run': true,
        'max-notes': 3,
        'service-reset': false,
      }),
      /no valid business accounts|unified finished with failures/i,
    );
  });

  it('links stage rejects multi-profile sharding', async () => {
    const root = useTempRoots();
    fs.mkdirSync(path.join(root, 'profiles', 'xhs-qa-1'), { recursive: true });
    fs.mkdirSync(path.join(root, 'profiles', 'xhs-qa-2'), { recursive: true });
    seedSavedProfile('xhs-qa-1');
    seedSavedProfile('xhs-qa-2');

    await assert.rejects(
      () => runUnified({
        profiles: 'xhs-qa-1,xhs-qa-2',
        keyword: 'links-single-account',
        stage: 'links',
        'plan-only': true,
      }),
      /stage=links requires exactly one profile/i,
    );
  });

  it('links stage rejects total-notes sharding flags', async () => {
    const root = useTempRoots();
    fs.mkdirSync(path.join(root, 'profiles', 'xhs-qa-1'), { recursive: true });
    seedSavedProfile('xhs-qa-1');

    await assert.rejects(
      () => runUnified({
        profile: 'xhs-qa-1',
        keyword: 'links-no-total-target',
        stage: 'links',
        'total-notes': 20,
        'plan-only': true,
      }),
      /stage=links does not support --total-notes\/--total-target sharding/i,
    );
  });

  it('links stage plan allocates seed collection to max-notes by default', async () => {
    const root = useTempRoots();
    fs.mkdirSync(path.join(root, 'profiles', 'xhs-qa-1'), { recursive: true });
    seedSavedProfile('xhs-qa-1');

    const result = await runUnified({
      profile: 'xhs-qa-1',
      keyword: 'links-seed-default',
      stage: 'links',
      'plan-only': true,
      'max-notes': 40,
    });
    const plan = JSON.parse(fs.readFileSync(result.planPath, 'utf8'));
    const firstWave = plan.waves?.[0];
    const firstSpec = firstWave?.specs?.[0];

    assert.equal(firstSpec.profileId, 'xhs-qa-1');
    assert.equal(firstSpec.seedCollectCount, 40);
    assert.equal(firstSpec.seedCollectMaxRounds, 20);
  });
});
