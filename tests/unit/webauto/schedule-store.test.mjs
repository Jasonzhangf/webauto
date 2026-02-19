import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addScheduleTask,
  exportScheduleTasks,
  getScheduleTask,
  importScheduleTasks,
  listDueScheduleTasks,
  listScheduleTasks,
  markScheduleTaskResult,
  removeScheduleTask,
  updateScheduleTask,
} from '../../../apps/webauto/entry/lib/schedule-store.mjs';

const tempRoots = [];

function useTempSchedulesRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-schedule-store-'));
  process.env.WEBAUTO_PATHS_SCHEDULES = root;
  tempRoots.push(root);
  return root;
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
});
