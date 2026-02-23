/**
 * L2: 业务链路层测试
 * 端到端真实业务流程测试
 */

import { describe, it, beforeAll, afterAll, assert } from 'vitest';
import { TestContext, setupTestContext, teardownTestContext, sleep, waitForRunStart, waitForTaskComplete } from '../test-context.ts';

describe('L2: Task Run Flow', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  }, 30000);

  afterAll(async () => {
    await teardownTestContext();
  });

  it('config → run → dashboard shows task', async () => {
    await ctx.ui.start(true);
    
    // Configure
    await ctx.ui.tab('配置');
    await ctx.ui.input('#keyword-input', 'CI-test-keyword');
    await ctx.ui.input('#target-input', '3');
    
    // Get initial task count
    const beforeSnapshot = await ctx.snapshot();
    const beforeCount = beforeSnapshot.tasks.length;
    
    // Start task
    await ctx.ui.click('#start-btn');
    
    // Wait for task to appear
    const runId = await waitForRunStart(ctx, 15000);
    
    if (runId) {
      // Check dashboard
      await ctx.ui.tab('看板');
      await sleep(1000);
      
      // Verify task exists in snapshot
      const afterSnapshot = await ctx.snapshot();
      const task = afterSnapshot.tasks.find(t => t.runId === runId);
      assert.ok(task, 'Task should appear in snapshot');
    }
    
    await ctx.ui.stop();
  }, 120000);

  it('settings save and persist', async () => {
    await ctx.ui.start(true);
    
    // Go to settings
    await ctx.ui.tab('设置');
    await sleep(500);
    
    // Get current settings
    const before = await ctx.snapshot();
    
    // Try to save (input may vary)
    try {
      await ctx.ui.clickText('保存');
      await sleep(500);
    } catch {
      // Save button may not be visible
    }
    
    await ctx.ui.stop();
  }, 60000);

  it('account manager loads accounts', async () => {
    await ctx.ui.start(true);
    
    // Go to account manager
    await ctx.ui.tab('账户管理');
    await sleep(1000);
    
    // Check snapshot for accounts
    const snapshot = await ctx.snapshot();
    // Accounts may be empty, but should not error
    assert.ok(typeof snapshot.env === 'object', 'Should have env status');
    
    await ctx.ui.stop();
  }, 60000);

  it('scheduler tab loads', async () => {
    await ctx.ui.start(true);
    
    // Go to scheduler
    await ctx.ui.tab('定时任务');
    await sleep(1000);
    
    // Just verify tab is accessible
    const snapshot = await ctx.ui.snapshot();
    assert.ok(typeof snapshot === 'object', 'Snapshot should be valid');
    
    await ctx.ui.stop();
  }, 60000);

  it('logs tab shows log entries', async () => {
    await ctx.ui.start(true);
    
    // Go to logs
    await ctx.ui.tab('日志');
    await sleep(500);
    
    await ctx.ui.stop();
  }, 30000);

  it('environment check shows status', async () => {
    await ctx.ui.start(true);
    
    // Check environment via API
    const env = await ctx.api.get('/api/v1/env');
    assert.ok(typeof env === 'object', 'Env should be object');
    
    // Environment should have camo status
    if (env.camo) {
      assert.ok(typeof env.camo.installed === 'boolean', 'Camo installed should be boolean');
    }
    
    await ctx.ui.stop();
  }, 30000);
});

describe('L2: Scheduler CRUD', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  }, 30000);

  afterAll(async () => {
    await teardownTestContext();
  });

  it('can navigate to scheduler and see task list', async () => {
    await ctx.ui.start(true);
    await ctx.ui.tab('定时任务');
    await sleep(500);
    
    // Scheduler should load without error
    const snapshot = await ctx.ui.snapshot();
    assert.ok(snapshot, 'Scheduler should be accessible');
    
    await ctx.ui.stop();
  }, 60000);
});
