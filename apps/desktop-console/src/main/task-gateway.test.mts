import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runEphemeralTask, scheduleInvoke } from './task-gateway.mts';

function createGateway() {
  const calls = {
    runJson: [] as any[],
    spawn: [] as any[],
  };
  const gateway = {
    repoRoot: '/repo',
    runJson: async (spec: any) => {
      calls.runJson.push(spec);
      return { ok: true, json: { ok: true, spec } };
    },
    spawnCommand: async (spec: any) => {
      calls.spawn.push(spec);
      return { runId: `rid-${calls.spawn.length}` };
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
  const args = calls.runJson[0]?.args || [];
  assert.equal(args.some((item: string) => item.endsWith('/schedule.mjs')), true);
  assert.equal(args.includes('update'), true);
  assert.equal(args.includes('task-1'), true);
  assert.equal(args.includes('--command-type'), true);
  assert.equal(args.includes('xhs-unified'), true);
  assert.equal(args.includes('--argv-json'), true);
});

test('runEphemeralTask spawns xhs unified command', async () => {
  const { calls, gateway } = createGateway();
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
