import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  acquireScheduleDaemonLease,
  addScheduleTask,
  claimScheduleTask,
  exportScheduleTasks,
  getScheduleTask,
  getSchedulerPolicy,
  importScheduleTasks,
  listDueScheduleTasks,
  listScheduleTasks,
  markScheduleTaskResult,
  markScheduleTaskSkipped,
  removeScheduleTask,
  releaseScheduleDaemonLease,
  releaseScheduleTaskClaim,
  renewScheduleDaemonLease,
  renewScheduleTaskClaim,
  setSchedulerPolicy,
  updateScheduleTask,
} from '../../../apps/webauto/entry/lib/schedule-store.mjs';

const tempRoots = [];

function useTempSchedulesRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-schedule-store-'));
  process.env.WEBAUTO_PATHS_SCHEDULES = root;
  tempRoots.push(root);
  return root;
}

function encodeLockKey(value) {
  const raw = Buffer.from(String(value || ''), 'utf8').toString('base64');
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') || 'empty';
}

afterEach(() => {
  delete process.env.WEBAUTO_PATHS_SCHEDULES;
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('schedule-store', () => {
  it('supports daily schedule with maxRuns and auto-disables at run limit', () => {
    useTempSchedulesRoot();
    const firstRunAt = new Date(Date.now() + 60_000).toISOString();
    const task = addScheduleTask({
      name: 'daily-task',
      scheduleType: 'daily',
      runAt: firstRunAt,
      maxRuns: 2,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });

    assert.equal(task.scheduleType, 'daily');
    assert.equal(task.maxRuns, 2);
    assert.ok(task.nextRunAt);

    const afterFirst = markScheduleTaskResult(task.id, {
      status: 'success',
      finishedAt: new Date(Date.now() + 61_000).toISOString(),
    });
    assert.equal(afterFirst.runCount, 1);
    assert.equal(afterFirst.enabled, true);
    assert.ok(afterFirst.nextRunAt);

    const afterSecond = markScheduleTaskResult(task.id, {
      status: 'success',
      finishedAt: new Date(Date.now() + 62_000).toISOString(),
    });
    assert.equal(afterSecond.runCount, 2);
    assert.equal(afterSecond.enabled, false);
    assert.equal(afterSecond.nextRunAt, null);
  });

  it('supports weekly schedule and computes a future nextRunAt', () => {
    useTempSchedulesRoot();
    const anchor = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
    const task = addScheduleTask({
      name: 'weekly-task',
      scheduleType: 'weekly',
      runAt: anchor,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p2', keyword: 'k2' },
    });

    assert.equal(task.scheduleType, 'weekly');
    assert.ok(task.nextRunAt);
    assert.ok(Date.parse(task.nextRunAt) > Date.now());
  });

  it('validates runAt for daily/weekly/once', () => {
    useTempSchedulesRoot();
    assert.throws(
      () => addScheduleTask({
        name: 'bad-daily',
        scheduleType: 'daily',
        commandType: 'xhs-unified',
        commandArgv: { profile: 'p1', keyword: 'k1' },
      }),
      /runAt is required/i,
    );
  });

  it('supports maxRuns update and clear (0 => unlimited)', () => {
    useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'interval-task',
      scheduleType: 'interval',
      intervalMinutes: 5,
      maxRuns: 3,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });

    assert.equal(task.maxRuns, 3);

    const updated = updateScheduleTask(task.id, { maxRuns: 0 });
    assert.equal(updated.maxRuns, null);
    assert.equal(updated.enabled, true);

    const loaded = getScheduleTask(task.id);
    assert.equal(loaded.maxRuns, null);
  });

  it('rejects duplicate schedule task ids', () => {
    useTempSchedulesRoot();
    const created = addScheduleTask({
      id: 'sched-dup',
      name: 'dup-task',
      scheduleType: 'interval',
      intervalMinutes: 10,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });
    assert.equal(created.id, 'sched-dup');

    assert.throws(() => addScheduleTask({
      id: 'sched-dup',
      name: 'dup-task-2',
      scheduleType: 'interval',
      intervalMinutes: 10,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p2', keyword: 'k2' },
    }), /task id already exists/i);
  });

  it('lists due once tasks and disables after completion', () => {
    useTempSchedulesRoot();
    const onceTask = addScheduleTask({
      name: 'once-task',
      scheduleType: 'once',
      runAt: new Date(Date.now() - 5_000).toISOString(),
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });

    const due = listDueScheduleTasks(20, Date.now());
    assert.equal(due.length, 1);
    assert.equal(due[0].id, onceTask.id);

    const finished = markScheduleTaskResult(onceTask.id, {
      status: 'success',
      finishedAt: new Date().toISOString(),
    });
    assert.equal(finished.enabled, false);
    assert.equal(finished.nextRunAt, null);

    const all = listScheduleTasks();
    assert.equal(all.count, 1);
  });

  it('supports import merge/replace and export by task id', () => {
    useTempSchedulesRoot();
    addScheduleTask({
      name: 'existing',
      scheduleType: 'interval',
      intervalMinutes: 5,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });

    const merged = importScheduleTasks({
      tasks: [
        {
          id: 'sched-8888',
          name: 'imported-daily',
          scheduleType: 'daily',
          runAt: new Date(Date.now() + 60_000).toISOString(),
          maxRuns: 4,
          commandType: 'xhs-unified',
          commandArgv: { profile: 'p8', keyword: 'k8' },
        },
      ],
    }, { mode: 'merge' });
    assert.equal(merged.count, 1);

    const exportedOne = exportScheduleTasks('sched-8888');
    assert.equal(exportedOne.count, 1);
    assert.equal(exportedOne.tasks[0].scheduleType, 'daily');
    assert.equal(exportedOne.tasks[0].maxRuns, 4);

    const replaced = importScheduleTasks({
      tasks: [
        {
          id: 'sched-r1',
          name: 'replace-task',
          scheduleType: 'weekly',
          runAt: new Date(Date.now() + 120_000).toISOString(),
          commandType: 'xhs-unified',
          commandArgv: { profile: 'rp', keyword: 'rk' },
        },
      ],
    }, { mode: 'replace' });
    assert.equal(replaced.mode, 'replace');
    assert.equal(replaced.count, 1);

    const all = listScheduleTasks();
    assert.equal(all.count, 1);
    assert.equal(all.tasks[0].id, 'sched-r1');
  });

  it('covers import payload variants, merge update path, max-runs disable and export-all', () => {
    useTempSchedulesRoot();
    const created = addScheduleTask({
      name: 'existing-for-merge',
      scheduleType: 'interval',
      intervalMinutes: 2,
      maxRuns: 1,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });

    const mergedArray = importScheduleTasks([
      {
        id: created.id,
        name: 'existing-updated',
        scheduleType: 'interval',
        intervalMinutes: 4,
        maxRuns: 1,
        commandType: 'xhs-unified',
        commandArgv: { profile: 'p1', keyword: 'k-updated' },
      },
    ], { mode: 'merge' });
    assert.equal(mergedArray.count, 1);
    assert.equal(mergedArray.tasks[0].id, created.id);
    assert.equal(mergedArray.tasks[0].name, 'existing-updated');

    const mergedObject = importScheduleTasks({
      id: 'sched-single',
      name: 'single-object-import',
      scheduleType: 'once',
      runAt: new Date(Date.now() + 5_000).toISOString(),
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p2', keyword: 'k2' },
    }, { mode: 'merge' });
    assert.equal(mergedObject.count, 1);
    assert.equal(mergedObject.tasks[0].id, 'sched-single');

    const runResult = markScheduleTaskResult(created.id, {
      status: 'success',
      finishedAt: new Date(Date.now() + 10_000).toISOString(),
    });
    assert.equal(runResult.enabled, false);
    assert.equal(runResult.nextRunAt, null);

    const exportedAll = exportScheduleTasks();
    assert.equal(exportedAll.version, 1);
    assert.ok(Array.isArray(exportedAll.tasks));
    assert.equal(exportedAll.count >= 2, true);
  });

  it('supports remove and reports not found errors', () => {
    useTempSchedulesRoot();
    const created = addScheduleTask({
      name: 'to-remove',
      scheduleType: 'interval',
      intervalMinutes: 3,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p1', keyword: 'k1' },
    });

    const removed = removeScheduleTask(created.id);
    assert.equal(removed.id, created.id);

    assert.throws(() => removeScheduleTask(created.id), /task not found/i);
    assert.throws(() => exportScheduleTasks(created.id), /task not found/i);
  });

  it('enforces daemon lease single-owner semantics', () => {
    useTempSchedulesRoot();
    const first = acquireScheduleDaemonLease({ ownerId: 'daemon-a', leaseMs: 5_000 });
    assert.equal(first.ok, true);

    const second = acquireScheduleDaemonLease({ ownerId: 'daemon-b', leaseMs: 5_000 });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'busy');

    const renewed = renewScheduleDaemonLease({ ownerId: 'daemon-a', leaseMs: 5_000 });
    assert.equal(renewed.ok, true);

    const released = releaseScheduleDaemonLease({ ownerId: 'daemon-a' });
    assert.equal(released.ok, true);
    assert.equal(released.released, true);

    const third = acquireScheduleDaemonLease({ ownerId: 'daemon-c', leaseMs: 5_000 });
    assert.equal(third.ok, true);
  });

  it('supports task claim lifecycle and blocks duplicate task claim', () => {
    useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'claim-target',
      scheduleType: 'interval',
      intervalMinutes: 2,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p-claim', keyword: 'k-claim' },
    });

    const first = claimScheduleTask(task, {
      ownerId: 'runner-a',
      runToken: 'token-a',
      leaseMs: 5_000,
      policy: { maxConcurrency: 2 },
    });
    assert.equal(first.ok, true);
    assert.equal(first.claimed, true);

    const second = claimScheduleTask(task, {
      ownerId: 'runner-b',
      runToken: 'token-b',
      leaseMs: 5_000,
      policy: { maxConcurrency: 2 },
    });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'task_busy');

    const renewed = renewScheduleTaskClaim(task.id, {
      ownerId: 'runner-a',
      runToken: 'token-a',
      leaseMs: 5_000,
    });
    assert.equal(renewed.ok, true);

    const released = releaseScheduleTaskClaim(task.id, {
      ownerId: 'runner-a',
      runToken: 'token-a',
    });
    assert.equal(released.ok, true);

    const third = claimScheduleTask(task, {
      ownerId: 'runner-c',
      runToken: 'token-c',
      leaseMs: 5_000,
      policy: { maxConcurrency: 2 },
    });
    assert.equal(third.ok, true);
  });

  it('reclaims stale task/resource claims when owner pid is dead', () => {
    const root = useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'stale-claim-target',
      scheduleType: 'interval',
      intervalMinutes: 2,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'stale-profile', keyword: 'k-stale' },
    });

    const locksRoot = path.join(root, 'locks');
    const taskClaimsRoot = path.join(locksRoot, 'task-claims');
    const resourceClaimsRoot = path.join(locksRoot, 'resource-claims');
    fs.mkdirSync(taskClaimsRoot, { recursive: true });
    fs.mkdirSync(resourceClaimsRoot, { recursive: true });

    const staleLease = {
      ownerId: 'runner-stale',
      runToken: 'token-stale',
      createdAt: new Date(Date.now() - 1_000).toISOString(),
      updatedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      pid: 999999,
      kind: 'schedule-task',
      taskId: task.id,
      resourceKeys: ['profile:stale-profile'],
      platform: 'xhs',
    };
    const staleResource = {
      ...staleLease,
      kind: 'schedule-resource',
      resourceKey: 'profile:stale-profile',
    };

    fs.writeFileSync(
      path.join(taskClaimsRoot, `${encodeLockKey(task.id)}.json`),
      `${JSON.stringify(staleLease, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(resourceClaimsRoot, `${encodeLockKey('profile:stale-profile')}.json`),
      `${JSON.stringify(staleResource, null, 2)}\n`,
      'utf8',
    );

    const claimed = claimScheduleTask(task, {
      ownerId: 'runner-fresh',
      runToken: 'token-fresh',
      leaseMs: 5_000,
      policy: { maxConcurrency: 2 },
    });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.ownerId, 'runner-fresh');
  });

  it('enforces profile resource mutex and supports policy persistence', () => {
    useTempSchedulesRoot();
    const policy = setSchedulerPolicy({
      maxConcurrency: 3,
      resourceMutex: {
        enabled: true,
        dimensions: ['profile'],
      },
    });
    assert.equal(policy.maxConcurrency, 3);
    assert.deepEqual(policy.resourceMutex.dimensions, ['profile']);
    assert.equal(getSchedulerPolicy().maxConcurrency, 3);

    const taskA = addScheduleTask({
      name: 'resource-a',
      scheduleType: 'interval',
      intervalMinutes: 3,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'shared-profile', keyword: 'k1' },
    });
    const taskB = addScheduleTask({
      name: 'resource-b',
      scheduleType: 'interval',
      intervalMinutes: 3,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'shared-profile', keyword: 'k2' },
    });

    const claimA = claimScheduleTask(taskA, {
      ownerId: 'worker-a',
      runToken: 'ra',
      leaseMs: 5_000,
      policy,
    });
    assert.equal(claimA.ok, true);

    const claimB = claimScheduleTask(taskB, {
      ownerId: 'worker-b',
      runToken: 'rb',
      leaseMs: 5_000,
      policy,
    });
    assert.equal(claimB.ok, false);
    assert.equal(claimB.reason, 'resource_busy');
  });

  it('failed + retryAt overrides nextRunAt and does not disable once tasks', () => {
    useTempSchedulesRoot();

    // Create a once task
    const onceTask = addScheduleTask({
      name: 'retry-once-task',
      scheduleType: 'once',
      runAt: new Date(Date.now() - 60_000).toISOString(),
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p-retry', keyword: 'k-retry' },
    });
    assert.equal(onceTask.enabled, true);

    // Fail with retryAt
    const futureRetry = new Date(Date.now() + 120_000).toISOString();
    const afterFail = markScheduleTaskResult(onceTask.id, {
      status: 'failed',
      error: 'timeout',
      finishedAt: new Date().toISOString(),
      retryAt: futureRetry,
    });

    // nextRunAt should be set to retryAt, NOT disabled
    assert.equal(afterFail.enabled, true, 'once task should remain enabled when retrying');
    assert.equal(afterFail.nextRunAt, futureRetry, 'nextRunAt should be the retryAt value');
    assert.equal(afterFail.failCount, 1);
    assert.equal(afterFail.lastStatus, 'failed');
  });

  it('invalid retryAt ISO throws error', () => {
    useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'bad-retry-task',
      scheduleType: 'interval',
      intervalMinutes: 5,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p', keyword: 'k' },
    });

    assert.throws(() => {
      markScheduleTaskResult(task.id, {
        status: 'failed',
        error: 'timeout',
        retryAt: 'not-a-valid-date',
      });
    }, /invalid retryAt ISO timestamp/);
  });

  it('failed without retryAt disables once tasks normally', () => {
    useTempSchedulesRoot();
    const onceTask = addScheduleTask({
      name: 'no-retry-once',
      scheduleType: 'once',
      runAt: new Date(Date.now() - 60_000).toISOString(),
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p', keyword: 'k' },
    });

    const afterFail = markScheduleTaskResult(onceTask.id, {
      status: 'failed',
      error: 'something broke',
      finishedAt: new Date().toISOString(),
    });

    assert.equal(afterFail.enabled, false, 'once task without retry should be disabled');
    assert.equal(afterFail.nextRunAt, null);
  });

  it('update disables task when runCount reaches maxRuns', () => {
    useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'maxruns-disable',
      scheduleType: 'interval',
      intervalMinutes: 5,
      maxRuns: 1,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p-max', keyword: 'k-max' },
    });

    const finished = markScheduleTaskResult(task.id, {
      status: 'success',
      finishedAt: new Date().toISOString(),
    });
    assert.equal(finished.runCount, 1);

    const updated = updateScheduleTask(task.id, { enabled: true });
    assert.equal(updated.enabled, false);
    assert.equal(updated.nextRunAt, null);
  });

  it('markScheduleTaskResult supports explicit disable', () => {
    useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'disable-on-result',
      scheduleType: 'interval',
      intervalMinutes: 10,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p-disable', keyword: 'k-disable' },
    });

    const disabled = markScheduleTaskResult(task.id, {
      status: 'failed',
      error: 'manual-stop',
      finishedAt: new Date().toISOString(),
      disable: true,
    });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.nextRunAt, null);
  });

  it('markScheduleTaskSkipped advances nextRunAt without incrementing counts', () => {
    useTempSchedulesRoot();
    const task = addScheduleTask({
      name: 'skip-task',
      scheduleType: 'interval',
      intervalMinutes: 5,
      commandType: 'xhs-unified',
      commandArgv: { profile: 'p-skip', keyword: 'k-skip' },
    });
    const before = getScheduleTask(task.id);
    const skipped = markScheduleTaskSkipped(task.id, { skippedAt: new Date().toISOString() });
    assert.equal(skipped.runCount, before.runCount);
    assert.notEqual(skipped.nextRunAt, before.nextRunAt);
  });
});
