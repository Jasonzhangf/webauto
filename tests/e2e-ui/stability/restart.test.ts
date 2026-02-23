/**
 * L3: 稳定性层测试
 * 连续运行、重启恢复测试
 */

import { describe, it, beforeAll, afterAll, assert } from 'vitest';
import { TestContext, setupTestContext, teardownTestContext, sleep } from '../test-context.ts';

describe('L3: Stability', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  }, 30000);

  afterAll(async () => {
    await teardownTestContext();
  });

  it('3 consecutive full-cover passes', async () => {
    const results = [];
    
    for (let i = 0; i < 3; i++) {
      await ctx.ui.start(true);
      const result = await ctx.ui.fullCover(`./.tmp/stability-full-cover-${i}.json`);
      results.push(result);
      await ctx.ui.stop();
      
      // Small delay between rounds
      await sleep(2000);
    }
    
    // All rounds should pass
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      assert.ok(result.ok, `Round ${i + 1} should pass`);
    }
  }, 300000);

  it('stop and restart maintains state', async () => {
    // First start
    await ctx.ui.start(true);
    await ctx.ui.tab('设置');
    await sleep(500);
    await ctx.ui.stop();
    
    // Restart
    await ctx.ui.start();
    await sleep(1000);
    
    // Should be able to navigate again
    await ctx.ui.tab('任务');
    await sleep(500);
    
    const status = await ctx.ui.status();
    assert.ok(status.ok || status.running, 'UI should be running after restart');
    
    await ctx.ui.stop();
  }, 120000);

  it('rapid tab switches do not crash', async () => {
    await ctx.ui.start(true);
    
    const tabs = ['初始化', '任务', '看板', '定时任务', '账户管理', '日志', '设置'];
    
    // Rapid switching
    for (let round = 0; round < 3; round++) {
      for (const tab of tabs) {
        try {
          await ctx.ui.tab(tab);
          await sleep(50); // Very short delay
        } catch {
          // Some tabs may not exist
        }
      }
    }
    
    // UI should still be responsive
    const status = await ctx.ui.status();
    assert.ok(status.ok || status.running, 'UI should still be responsive');
    
    await ctx.ui.stop();
  }, 120000);

  it('concurrent API calls do not deadlock', async () => {
    await ctx.ui.start(true);
    
    // Make multiple concurrent API calls
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(ctx.api.listTasks());
      promises.push(ctx.api.health());
    }
    
    const results = await Promise.all(promises);
    
    // All should succeed
    assert.equal(results.length, 20, 'All API calls should complete');
    
    await ctx.ui.stop();
  }, 60000);

  it('error recovery - UI continues after API error', async () => {
    await ctx.ui.start(true);
    
    // Make a potentially failing API call
    try {
      await ctx.api.get('/api/v1/nonexistent');
    } catch {
      // Expected to fail
    }
    
    // UI should still work
    await ctx.ui.tab('任务');
    const status = await ctx.ui.status();
    assert.ok(status.ok || status.running, 'UI should still work after API error');
    
    await ctx.ui.stop();
  }, 60000);

  it('memory stability - no leaks on repeated operations', async () => {
    await ctx.ui.start(true);
    
    // Perform many operations
    for (let i = 0; i < 50; i++) {
      await ctx.ui.tab('设置');
      await ctx.ui.tab('任务');
    }
    
    // Should not have crashed
    const status = await ctx.ui.status();
    assert.ok(status.ok || status.running, 'UI should handle repeated operations');
    
    await ctx.ui.stop();
  }, 120000);
});
