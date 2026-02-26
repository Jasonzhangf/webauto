import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runEphemeralTask, scheduleInvoke } from './task-gateway.mts';

function createGateway() {
  const calls = {
    runJson: [] as any[],
    spawn: [] as any[],
  };
  let accountProfiles: any[] = [];
  const gateway = {
    repoRoot: '/repo',
    runJson: async (spec: any) => {
      calls.runJson.push(spec);
      const args = Array.isArray(spec?.args) ? spec.args.map((item: any) => String(item || '')) : [];
      if (args.some((item: string) => item.endsWith('/account.mjs')) && args.includes('list')) {
        return { ok: true, json: { profiles: accountProfiles } };
      }
      return { ok: true, json: { ok: true, spec } };
    },
    spawnCommand: async (spec: any) => {
      calls.spawn.push(spec);
      return { runId: `rid-${calls.spawn.length}` };
    },
    setAccountProfiles: (rows: any[]) => {
      accountProfiles = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
    },
  };
  return { calls, gateway };
}

test('scheduleInvoke save validates weibo monitor user-id', async () => {
  const { gateway } = createGateway();
  const result = await scheduleInvoke(gateway, {
    action: 'save',
    payload: {
      name: 'weibo-monitor',
      commandType: 'weibo-monitor',
      scheduleType: 'interval',
      intervalMinutes: 30,
      argv: {
        profile: 'weibo-1',
        keyword: 'k',
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error || ''), /user-id/);
});

test('scheduleInvoke save builds argv-json and command-type', async () => {
  const { calls, gateway } = createGateway();
  gateway.setAccountProfiles([
    {
      profileId: 'xhs-1',
      valid: true,
      accountId: 'xhs-u1',
      updatedAt: '2026-02-26T00:00:00.000Z',
    },
  ]);
  const result = await scheduleInvoke(gateway, {
    action: 'save',
    payload: {
      id: 'task-1',
      name: 'xhs-job',
      commandType: 'xhs-unified',
      scheduleType: 'interval',
      intervalMinutes: 15,
      argv: {
        profile: 'xhs-1',
        keyword: '春晚',
        'max-notes': 100,
      },
    },
  });
  assert.equal(result.ok, true);
  const scheduleCall = calls.runJson.find((item: any) =>
    Array.isArray(item?.args) && item.args.some((value: string) => String(value).endsWith('/schedule.mjs')),
  );
  const args = scheduleCall?.args || [];
  assert.equal(args.some((item: string) => item.endsWith('/schedule.mjs')), true);
  assert.equal(args.includes('update'), true);
  assert.equal(args.includes('task-1'), true);
  assert.equal(args.includes('--command-type'), true);
  assert.equal(args.includes('xhs-unified'), true);
  assert.equal(args.includes('--argv-json'), true);
});

test('scheduleInvoke run supports background spawn mode', async () => {
  const { calls, gateway } = createGateway();
  const result = await scheduleInvoke(gateway, {
    action: 'run',
    taskId: 'sched-0009',
    background: true,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.spawn.length, 1);
  assert.equal(calls.runJson.length, 0);
  const args = calls.spawn[0]?.args || [];
  assert.equal(args.some((item: string) => item.endsWith('/schedule.mjs')), true);
  assert.equal(args.includes('run'), true);
  assert.equal(args.includes('sched-0009'), true);
});

test('runEphemeralTask spawns xhs unified command', async () => {
  const { calls, gateway } = createGateway();
  gateway.setAccountProfiles([
    {
      profileId: 'xhs-1',
      valid: true,
      accountId: 'xhs-u1',
      updatedAt: '2026-02-26T00:00:00.000Z',
    },
  ]);
  const result = await runEphemeralTask(gateway, {
    commandType: 'xhs-unified',
    argv: {
      profile: 'xhs-1',
      keyword: '工作服',
      'max-notes': 88,
      env: 'debug',
      'do-comments': true,
      'fetch-body': true,
      'do-likes': true,
      'like-keywords': '购买链接',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.runId, 'rid-1');
  assert.match(String(result.uiTriggerId || ''), /^ui-\d+-[a-f0-9]+$/);
  const args = calls.spawn[0]?.args || [];
  assert.equal(args.some((item: string) => item.endsWith('/xhs-unified.mjs')), true);
  assert.equal(args.includes('--profile'), true);
  assert.equal(args.includes('xhs-1'), true);
  assert.equal(args.includes('--keyword'), true);
  assert.equal(args.includes('工作服'), true);
  assert.equal(args.includes('--ui-trigger-id'), true);
});

test('scheduleInvoke save replaces unavailable explicit profile with valid profile', async () => {
  const { calls, gateway } = createGateway();
  gateway.setAccountProfiles([
    {
      profileId: 'profile-0',
      valid: true,
      accountId: 'xhs-u0',
      updatedAt: '2026-02-26T00:00:00.000Z',
    },
  ]);
  const result = await scheduleInvoke(gateway, {
    action: 'save',
    payload: {
      id: 'task-fallback-1',
      name: 'xhs-fallback',
      commandType: 'xhs-unified',
      scheduleType: 'interval',
      intervalMinutes: 15,
      argv: {
        profile: 'legacy-xhs-9',
        keyword: '春晚',
        'max-notes': 20,
      },
    },
  });
  assert.equal(result.ok, true);
  const scheduleCall = calls.runJson.find((item: any) =>
    Array.isArray(item?.args) && item.args.some((value: string) => String(value).endsWith('/schedule.mjs')),
  );
  const args = scheduleCall?.args || [];
  const argvIdx = args.indexOf('--argv-json');
  assert.ok(argvIdx >= 0);
  const argvJson = JSON.parse(String(args[argvIdx + 1] || '{}'));
  assert.equal(argvJson.profile, 'profile-0');
});

test('runEphemeralTask replaces unavailable explicit profile with valid profile', async () => {
  const { calls, gateway } = createGateway();
  gateway.setAccountProfiles([
    {
      profileId: 'profile-0',
      valid: true,
      accountId: 'xhs-u0',
      updatedAt: '2026-02-26T00:00:00.000Z',
    },
  ]);
  const result = await runEphemeralTask(gateway, {
    commandType: 'xhs-unified',
    argv: {
      profile: 'legacy-xhs-9',
      keyword: '春晚',
      'max-notes': 20,
      env: 'debug',
    },
  });
  assert.equal(result.ok, true);
  const args = calls.spawn[0]?.args || [];
  const profileIdx = args.indexOf('--profile');
  assert.ok(profileIdx >= 0);
  assert.equal(args[profileIdx + 1], 'profile-0');
});
