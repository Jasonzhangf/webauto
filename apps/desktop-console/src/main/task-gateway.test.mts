import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runEphemeralTask, scheduleInvoke } from './task-gateway.mts';

function includesScript(value: any, baseName: string): boolean {
  return String(value || '').toLowerCase().includes(baseName.toLowerCase());
}

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
      if (args.some((item: string) => includesScript(item, 'account.mjs')) && args.includes('list')) {
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

test('scheduleInvoke save validates missing keyword', async () => {
  const { gateway } = createGateway();
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
      name: 'xhs-monitor',
      commandType: 'xhs-unified',
      scheduleType: 'interval',
      intervalMinutes: 30,
      argv: {
        profile: 'xhs-1',
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error || ''), /关键词/);
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
  assert.equal(result.ok, true, String(result.error));
  const saveCall = calls.runJson.find((c: any) => Array.isArray(c.args) && c.args.some((a: string) => includesScript(a, 'schedule.mjs')));
  assert.ok(saveCall, 'should call schedule.mjs');
  const argvIdx = saveCall.args.findIndex((a: string) => a === '--argv-json');
  assert.ok(argvIdx >= 0, 'should have --argv-json');
  const argvJson = saveCall.args[argvIdx + 1];
  const parsed = JSON.parse(argvJson);
  assert.equal(parsed.keyword, '春晚');
  assert.equal(parsed['max-notes'], 100);
  assert.equal(parsed.profile, 'xhs-1');
});

test('runEphemeralTask rejects missing profile', async () => {
  const { gateway } = createGateway();
  const result = await runEphemeralTask(gateway, {
    commandType: 'xhs-unified',
    argv: {
      keyword: 'test',
    },
  });
  assert.equal(result.ok, false);
  assert.ok(String(result.error || '').length > 0, 'should have error message');
});

test('runEphemeralTask passes with valid command and profile', async () => {
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
      keyword: '测试',
      'max-notes': 5,
    },
  });
  assert.equal(result.ok, true, String(result.error));
  assert.ok(result.runId, 'should have runId');
  const runCall = calls.spawn.find((c: any) => Array.isArray(c.args) && c.args.some((a: string) => includesScript(a, 'unified.mjs')));
  assert.ok(runCall, 'should call unified.mjs');
});

test('runEphemeralTask validates keyword requirement', async () => {
  const { gateway } = createGateway();
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
    },
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error || ''), /keyword|关键词/);
});
