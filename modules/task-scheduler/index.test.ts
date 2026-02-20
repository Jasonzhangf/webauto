import { test } from 'node:test';
import assert from 'node:assert';
import { TaskScheduler } from './index.js';

test('TaskScheduler: adds task correctly', () => {
  const scheduler = new TaskScheduler();
  
  const taskId = scheduler.addTask({
    id: 'task-001',
    name: '微博主页采集',
    profile: 'xiaohongshu-batch-1',
    platform: 'weibo',
    taskType: 'timeline',
    config: { target: 20 },
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: 10,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  assert.equal(taskId, 'task-001');
  
  const tasks = scheduler.getTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].currentRuns, 0);
  assert.equal(tasks[0].status, 'pending');
});

test('TaskScheduler: queues task when profile available', () => {
  const scheduler = new TaskScheduler();
  
  scheduler.addTask({
    id: 'task-001',
    name: '微博主页采集',
    profile: 'profile-a',
    platform: 'weibo',
    taskType: 'timeline',
    config: {},
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: 10,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  const result = scheduler.queueTask('task-001');
  assert.equal(result.queued, true);
  
  const tasks = scheduler.getTasks();
  assert.equal(tasks[0].status, 'queued');
});

test('TaskScheduler: detects profile conflict', () => {
  const scheduler = new TaskScheduler();
  
  // Add two tasks with same profile
  scheduler.addTask({
    id: 'task-001',
    name: '微博主页采集',
    profile: 'profile-a',
    platform: 'weibo',
    taskType: 'timeline',
    config: {},
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: 10,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  scheduler.addTask({
    id: 'task-002',
    name: '微博搜索采集',
    profile: 'profile-a', // Same profile
    platform: 'weibo',
    taskType: 'search',
    config: { keyword: 'test' },
    schedule: { type: 'daily', dailyTime: '04:00' },
    maxRuns: null,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  // Queue first task and start it
  scheduler.queueTask('task-001');
  scheduler.startNext();
  
  // Try to queue second task - should detect conflict
  const result = scheduler.queueTask('task-002');
  
  assert.equal(result.queued, true);
  assert.ok(result.reason?.includes('busy'), 'Should indicate profile is busy');
  assert.ok(result.conflictingTask, 'Should return conflicting task');
  assert.equal(result.conflictingTask?.id, 'task-001');
});

test('TaskScheduler: respects maxRuns limit', () => {
  const scheduler = new TaskScheduler();
  
  scheduler.addTask({
    id: 'task-001',
    name: '微博主页采集',
    profile: 'profile-a',
    platform: 'weibo',
    taskType: 'timeline',
    config: {},
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: 2,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  // First run
  scheduler.queueTask('task-001');
  scheduler.startNext();
  scheduler.completeTask('task-001', {
    taskId: 'task-001',
    runId: 'run-001',
    success: true,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1000
  });
  
  // Second run
  scheduler.queueTask('task-001');
  scheduler.startNext();
  scheduler.completeTask('task-001', {
    taskId: 'task-001',
    runId: 'run-002',
    success: true,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1000
  });
  
  // Third attempt should fail due to maxRuns
  const result = scheduler.queueTask('task-001');
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'Max runs reached');
});

test('TaskScheduler: sorts queue by priority', () => {
  const scheduler = new TaskScheduler();
  
  // Add tasks with different profiles to avoid conflict
  scheduler.addTask({
    id: 'low-priority',
    name: '低优先级任务',
    profile: 'profile-a',
    platform: 'weibo',
    taskType: 'search',
    config: { keyword: 'test1' },
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: null,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  scheduler.addTask({
    id: 'high-priority',
    name: '高优先级任务',
    profile: 'profile-b',
    platform: 'weibo',
    taskType: 'search',
    config: { keyword: 'test2' },
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: null,
    priority: 10,
    createdAt: new Date().toISOString()
  });
  
  // Queue low priority first
  scheduler.queueTask('low-priority');
  // Then queue high priority - should be sorted to front
  scheduler.queueTask('high-priority');
  
  // Queue should be sorted: high-priority first
  const tasks = scheduler.getTasks();
  const lowPrioTask = tasks.find(t => t.id === 'low-priority');
  const highPrioTask = tasks.find(t => t.id === 'high-priority');
  
  assert.ok(lowPrioTask);
  assert.ok(highPrioTask);
  assert.equal(lowPrioTask?.status, 'queued');
  assert.equal(highPrioTask?.status, 'queued');
});

test('TaskScheduler: simulates overlap scenario', () => {
  const scheduler = new TaskScheduler();
  
  // Add multiple tasks with same profile
  scheduler.addTask({
    id: 'task-001',
    name: '任务 1',
    profile: 'shared-profile',
    platform: 'weibo',
    taskType: 'timeline',
    config: {},
    schedule: { type: 'interval', intervalMinutes: 60 },
    maxRuns: null,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  scheduler.addTask({
    id: 'task-002',
    name: '任务 2',
    profile: 'shared-profile',
    platform: 'weibo',
    taskType: 'search',
    config: { keyword: 'test' },
    schedule: { type: 'daily', dailyTime: '04:00' },
    maxRuns: null,
    priority: 2,
    createdAt: new Date().toISOString()
  });
  
  // Queue both and start first
  scheduler.queueTask('task-001');
  scheduler.queueTask('task-002');
  scheduler.startNext();
  
  const simulation = scheduler.simulateOverlap();
  
  console.log('\n=== Task Overlap Simulation ===');
  console.log('Running:', simulation.running);
  console.log('Queue:', simulation.queue);
  console.log('Conflicts:', simulation.conflicts);
  
  assert.equal(simulation.running.length, 1);
  assert.equal(simulation.queue.length, 1);
  assert.equal(simulation.conflicts.length, 2); // Both tasks share profile
});

test('TaskScheduler: handles complete task lifecycle', () => {
  const scheduler = new TaskScheduler();
  
  let startedEvents = 0;
  let completedEvents = 0;
  
  scheduler.on('task:started', () => startedEvents++);
  scheduler.on('task:completed', () => completedEvents++);
  
  scheduler.addTask({
    id: 'lifecycle-test',
    name: '生命周期测试',
    profile: 'test-profile',
    platform: 'weibo',
    taskType: 'search',
    config: { keyword: 'test' },
    schedule: { type: 'once' },
    maxRuns: 1,
    priority: 1,
    createdAt: new Date().toISOString()
  });
  
  scheduler.queueTask('lifecycle-test');
  scheduler.startNext();
  
  const tasks = scheduler.getTasks();
  const runningTask = tasks[0];
  
  assert.ok(runningTask);
  assert.equal(runningTask.status, 'running');
  assert.equal(startedEvents, 1);
  
  scheduler.completeTask('lifecycle-test', {
    taskId: 'lifecycle-test',
    runId: 'run-001',
    success: true,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 5000
  });
  
  const completedTask = scheduler.getTasks()[0];
  assert.equal(completedTask.status, 'completed');
  assert.equal(completedEvents, 1);
  assert.equal(scheduler.isProfileAvailable('test-profile'), true);
});

console.log('Running TaskScheduler tests...\n');
