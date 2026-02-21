import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scheduleCliPath = path.join(repoRoot, 'apps', 'webauto', 'entry', 'schedule.mjs');
const roots = [];

function makeEnv(root) {
  return {
    ...process.env,
    WEBAUTO_PATHS_SCHEDULES: root,
  };
}

function runScheduleRaw(args, root) {
  return spawnSync(process.execPath, [scheduleCliPath, ...args], {
    cwd: repoRoot,
    env: makeEnv(root),
    encoding: 'utf8',
  });
}

function runSchedule(args, root, expectCode = 0) {
  const ret = runScheduleRaw(args, root);
  if (ret.status !== expectCode) {
    throw new Error(`schedule command failed (${ret.status}): ${ret.stderr || ret.stdout}`);
  }
  const text = (ret.stdout || '').trim();
  return text ? JSON.parse(text) : null;
}

function newRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-schedule-cli-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('schedule cli', () => {
  it('supports add/update/list with daily/weekly and max-runs', () => {
    const root = newRoot();
    const addRes = runSchedule([
      'add',
      '--name', 'daily-job',
      '--schedule-type', 'daily',
      '--run-at', '2026-02-20T09:00:00+08:00',
      '--max-runs', '3',
      '--profile', 'p1',
      '--keyword', 'k1',
      '--json',
    ], root);

    assert.equal(addRes.ok, true);
    assert.equal(addRes.task.scheduleType, 'daily');
    assert.equal(addRes.task.maxRuns, 3);

    const taskId = addRes.task.id;
    const updateRes = runSchedule([
      'update',
      taskId,
      '--schedule-type', 'weekly',
      '--run-at', '2026-02-21T10:30:00+08:00',
      '--max-runs', '5',
      '--profile', 'p1',
      '--keyword', 'k1',
      '--json',
    ], root);

    assert.equal(updateRes.ok, true);
    assert.equal(updateRes.task.scheduleType, 'weekly');
    assert.equal(updateRes.task.maxRuns, 5);

    const listRes = runSchedule(['list', '--json'], root);
    assert.equal(listRes.ok, true);
    assert.equal(listRes.count, 1);
    assert.equal(listRes.tasks[0].scheduleType, 'weekly');
    assert.equal(listRes.tasks[0].maxRuns, 5);
  });

  it('supports import/export for extended schedule fields', () => {
    const root = newRoot();
    const imported = runSchedule([
      'import',
      '--payload-json',
      JSON.stringify({
        tasks: [
          {
            id: 'sched-9999',
            name: 'weekly-imported',
            scheduleType: 'weekly',
            runAt: '2026-02-22T08:00:00+08:00',
            maxRuns: 7,
            commandType: 'xhs-unified',
            commandArgv: { profile: 'p9', keyword: 'k9' },
          },
        ],
      }),
      '--mode', 'merge',
      '--json',
    ], root);

    assert.equal(imported.ok, true);
    assert.equal(imported.count, 1);

    const exported = runSchedule(['export', 'sched-9999', '--json'], root);
    assert.equal(exported.ok, true);
    assert.equal(exported.count, 1);
    assert.equal(exported.tasks[0].scheduleType, 'weekly');
    assert.equal(exported.tasks[0].maxRuns, 7);

    const exportPath = path.join(root, 'exports', 'sched-9999.json');
    const exportedToFile = runSchedule(['export', 'sched-9999', '--file', exportPath, '--json'], root);
    assert.equal(exportedToFile.ok, true);
    assert.equal(exportedToFile.filePath, exportPath);
    assert.equal(fs.existsSync(exportPath), true);
  });

  it('supports policy get/set', () => {
    const root = newRoot();
    const setRes = runSchedule([
      'policy',
      'set',
      '--payload-json',
      JSON.stringify({
        maxConcurrency: 2,
        resourceMutex: {
          enabled: true,
          dimensions: ['profile'],
        },
      }),
      '--json',
    ], root);
    assert.equal(setRes.ok, true);
    assert.equal(setRes.policy.maxConcurrency, 2);

    const getRes = runSchedule(['policy', '--json'], root);
    assert.equal(getRes.ok, true);
    assert.equal(getRes.policy.maxConcurrency, 2);
    assert.deepEqual(getRes.policy.resourceMutex.dimensions, ['profile']);
  });

  it('supports importing BOM-encoded json file on windows/mac/linux', () => {
    const root = newRoot();
    const filePath = path.join(root, 'imports', 'bom-schedules.json');
    const payload = {
      tasks: [
        {
          id: 'sched-bom-1',
          name: 'bom-task',
          scheduleType: 'interval',
          intervalMinutes: 15,
          commandType: 'xhs-unified',
          commandArgv: { profile: 'p-bom', keyword: 'bom' },
        },
      ],
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `\uFEFF${JSON.stringify(payload, null, 2)}`, 'utf8');

    const imported = runSchedule(['import', '--file', filePath, '--mode', 'merge', '--json'], root);
    assert.equal(imported.ok, true);
    assert.equal(imported.count, 1);

    const listed = runSchedule(['list', '--json'], root);
    assert.equal(listed.ok, true);
    assert.equal(listed.count, 1);
    assert.equal(listed.tasks[0].id, 'sched-bom-1');
  });

  it('supports help output', () => {
    const root = newRoot();
    const ret = runScheduleRaw(['--help'], root);
    assert.equal(ret.status, 0, ret.stderr || ret.stdout);
    assert.match(String(ret.stdout || ''), /webauto schedule/i);
    assert.match(String(ret.stdout || ''), /schedule add/i);
  });

  it('supports daemon once mode when no due tasks', () => {
    const root = newRoot();
    runSchedule([
      'add',
      '--name', 'future-once',
      '--schedule-type', 'once',
      '--run-at', '2099-01-01T00:00:00.000Z',
      '--profile', 'p1',
      '--keyword', 'k1',
      '--json',
    ], root);

    const once = runSchedule(['daemon', '--once', '--json'], root);
    assert.equal(once.ok, true);
    assert.equal(once.count, 0);
    assert.equal(once.mode, 'once');
  });

  it('supports get/delete flow and returns errors for invalid command payloads', () => {
    const root = newRoot();
    const addRes = runSchedule([
      'add',
      '--name', 'to-delete',
      '--schedule-type', 'interval',
      '--interval-minutes', '15',
      '--profile', 'p1',
      '--keyword', 'k1',
      '--json',
    ], root);
    const taskId = addRes.task.id;

    const getRes = runSchedule(['get', taskId, '--json'], root);
    assert.equal(getRes.ok, true);
    assert.equal(getRes.task.id, taskId);

    const delRes = runSchedule(['delete', taskId, '--json'], root);
    assert.equal(delRes.ok, true);
    assert.equal(delRes.removed.id, taskId);

    const badImport = runScheduleRaw(['import', '--json'], root);
    assert.equal(badImport.status, 1);
    assert.match(String(badImport.stderr || ''), /import requires --file or --payload-json/i);

    const badCmd = runScheduleRaw(['unknown-cmd', '--json'], root);
    assert.equal(badCmd.status, 1);
    assert.match(String(badCmd.stderr || ''), /unknown schedule command/i);
  });

  it('supports run/run-due failure paths with json output', () => {
    const root = newRoot();
    const addRes = runSchedule([
      'add',
      '--name', 'run-fail',
      '--command-type', '1688-search',
      '--schedule-type', 'once',
      '--run-at', new Date(Date.now() - 10_000).toISOString(),
      '--keyword', 'k1',
      '--profile', 'p1',
      '--json',
    ], root);
    const taskId = addRes.task.id;

    const runRes = runSchedule(['run', taskId, '--json'], root, 1);
    assert.equal(runRes.ok, false);
    assert.equal(runRes.result.taskId, taskId);
    assert.match(String(runRes.result.error || ''), /executor_not_implemented/i);

    runSchedule([
      'add',
      '--name', 'run-due-fail',
      '--command-type', '1688-search',
      '--schedule-type', 'once',
      '--run-at', new Date(Date.now() - 9_000).toISOString(),
      '--keyword', 'k2',
      '--profile', 'p1',
      '--json',
    ], root);
    const runDueRes = runSchedule(['run-due', '--limit', '5', '--json'], root, 1);
    assert.equal(runDueRes.ok, false);
    assert.equal(Number(runDueRes.failed) >= 1, true);
  });

  it('supports daemon loop mode and graceful shutdown', async () => {
    const root = newRoot();
    const child = spawn(process.execPath, [
      scheduleCliPath,
      'daemon',
      '--interval-sec', '1',
      '--limit', '1',
      '--json',
    ], {
      cwd: repoRoot,
      env: makeEnv(root),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    child.kill('SIGTERM');
    const code = await new Promise((resolve) => {
      child.on('exit', resolve);
    });

    assert.equal(code, 0, stderr || `unexpected exit code: ${code}`);
    assert.match(stdout, /\"event\":\"schedule\.tick\"/);
    assert.match(stdout, /\"event\":\"schedule\.stopped\"/);
  });

  it('rejects second daemon when first daemon lease is active', async () => {
    const root = newRoot();
    const first = spawn(process.execPath, [
      scheduleCliPath,
      'daemon',
      '--interval-sec', '1',
      '--limit', '1',
      '--daemon-lease-sec', '30',
      '--json',
    ], {
      cwd: repoRoot,
      env: makeEnv(root),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await new Promise((resolve) => setTimeout(resolve, 600));

    const second = runScheduleRaw(['daemon', '--json'], root);
    assert.equal(second.status, 1);
    const secondPayload = JSON.parse(String(second.stdout || '{}'));
    assert.equal(secondPayload.ok, false);
    assert.equal(secondPayload.error, 'daemon_lease_busy');

    first.kill('SIGTERM');
    await new Promise((resolve) => first.on('exit', resolve));
  });
});
