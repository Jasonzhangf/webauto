// services/unified-api/__tests__/task-state.test.ts
import test from 'node:test';
import assert from 'node:assert';
import { taskStateRegistry } from '../task-state.js';

test('createTask creates a new task', () => {
  const task = taskStateRegistry.createTask({
    runId: 'test-run-1',
    profileId: 'profile-1',
    keyword: 'test-keyword',
    phase: 'phase2',
  });
  assert.equal(task.runId, 'test-run-1');
  assert.equal(task.profileId, 'profile-1');
  assert.equal(task.keyword, 'test-keyword');
  assert.equal(task.phase, 'phase2');
  assert.equal(task.status, 'starting');
  taskStateRegistry.deleteTask('test-run-1');
});

test('getTask returns undefined for non-existent task', () => {
  const task = taskStateRegistry.getTask('non-existent');
  assert.equal(task, undefined);
});

test('updateProgress updates progress and broadcasts', (t, done) => {
  const task = taskStateRegistry.createTask({
    runId: 'test-run-2',
    profileId: 'profile-1',
    keyword: 'test',
  });
  const unsub = taskStateRegistry.subscribe((update) => {
    if (update.runId === 'test-run-2' && update.type === 'progress') {
      assert.equal(update.data.processed, 5);
      unsub();
      taskStateRegistry.deleteTask('test-run-2');
      done();
    }
  });
  taskStateRegistry.updateProgress('test-run-2', { processed: 5, total: 10 });
});

test('pushEvent stores event and broadcasts', (t, done) => {
  const task = taskStateRegistry.createTask({
    runId: 'test-run-3',
    profileId: 'profile-1',
    keyword: 'test',
  });
  const unsub = taskStateRegistry.subscribe((update) => {
    if (update.runId === 'test-run-3' && update.type === 'event') {
      assert.equal(update.data.type, 'phase_unified_done');
      unsub();
      taskStateRegistry.deleteTask('test-run-3');
      done();
    }
  });
  taskStateRegistry.pushEvent('test-run-3', 'phase_unified_done', { notesProcessed: 1 });
});

test('setStatus changes status and sets completedAt for terminal states', () => {
  const task = taskStateRegistry.createTask({
    runId: 'test-run-4',
    profileId: 'profile-1',
    keyword: 'test',
  });
  assert.equal(task.completedAt, undefined);
  taskStateRegistry.setStatus('test-run-4', 'completed');
  const updated = taskStateRegistry.getTask('test-run-4');
  assert.ok(updated?.completedAt);
  taskStateRegistry.deleteTask('test-run-4');
});

test('getEvents returns events since timestamp', async () => {
  const runId = 'test-run-5';
  taskStateRegistry.createTask({ runId, profileId: 'p1', keyword: 'test' });
  taskStateRegistry.pushEvent(runId, 'event1', {});
  await new Promise(r => setTimeout(r, 10)); // Ensure different timestamps
  taskStateRegistry.pushEvent(runId, 'event2', {});
  const all = taskStateRegistry.getEvents(runId);
  assert.equal(all.length, 2);
  const since = taskStateRegistry.getEvents(runId, all[0].timestamp + 1);
  assert.equal(since.length, 1);
  assert.equal(since[0].type, 'event2');
  taskStateRegistry.deleteTask(runId);
});

test('deleteTask removes task and events', () => {
  const runId = 'test-run-6';
  taskStateRegistry.createTask({ runId, profileId: 'p1', keyword: 'test' });
  taskStateRegistry.pushEvent(runId, 'event', {});
  const deleted = taskStateRegistry.deleteTask(runId);
  assert.equal(deleted, true);
  assert.equal(taskStateRegistry.getTask(runId), undefined);
  assert.deepEqual(taskStateRegistry.getEvents(runId), []);
});
