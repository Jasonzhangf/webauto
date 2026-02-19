import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runUnified } from '../../../apps/webauto/entry/xhs-unified.mjs';

const tempRoots = [];
const trackedEnvKeys = ['WEBAUTO_DOWNLOAD_ROOT', 'WEBAUTO_PATHS_ACCOUNTS'];
let envSnapshot = null;

function useTempRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-xhs-unified-'));
  tempRoots.push(root);
  if (!envSnapshot) {
    envSnapshot = Object.fromEntries(trackedEnvKeys.map((key) => [key, process.env[key]]));
  }
  process.env.WEBAUTO_DOWNLOAD_ROOT = path.join(root, 'download');
  process.env.WEBAUTO_PATHS_ACCOUNTS = path.join(root, 'accounts');
  return root;
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
    useTempRoots();
    const result = await runUnified({
      profile: 'test-profile',
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
    assert.equal(plan.accountStates[0].profileId, 'test-profile');
    assert.equal(plan.accountStates[0].status, 'plan_only_unverified');
    assert.equal(plan.accountStates[0].reason, 'plan_only_skip_account_sync');
  });

  it('non plan-only mode still requires valid business accounts', async () => {
    useTempRoots();
    await assert.rejects(
      () => runUnified({
        profile: 'test-profile',
        keyword: 'need-account',
        'dry-run': true,
        'max-notes': 3,
      }),
      /no valid business accounts/i,
    );
  });
});
