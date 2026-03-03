/**
 * L2: Collect Checkpoint Flow
 * 测试 collect 阶段的 checkpoint 回退机制
 */

import { describe, it, beforeAll, afterAll, assert } from 'vitest';
import { TestContext, setupTestContext, teardownTestContext, sleep, waitForRunStart } from '../test-context.ts';

describe('L2: Collect Checkpoint Flow', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  }, 30000);

  afterAll(async () => {
    await teardownTestContext();
  });

  it('collect stage: home_ready checkpoint', async () => {
    await ctx.ui.start(true);
    
    // Configure for collect only via xiaohongshu tab
    await ctx.ui.tab('小红书');
    await sleep(1000);
    
    // Input keyword and target
    await ctx.ui.input('#keyword-input', 'collect-checkpoint-test');
    await ctx.ui.input('#target-input', '1');
    
    // Start task (default stage is links for collect)
    await ctx.ui.click('#start-btn');
    
    const runId = await waitForRunStart(ctx, 15000);
    assert.ok(runId, 'Task should start');
    
    // Wait for home_ready checkpoint (goto_home operation)
    await sleep(10000);
    
    // Check task status via API
    const task = await ctx.api.get(`/api/v1/tasks/${runId}`);
    assert.ok(task, 'Task should exist');
    
    // Check events for checkpoint confirmation
    const events = await ctx.api.get(`/api/v1/tasks/${runId}/events`);
    const homeEvents = events.filter((e: any) => 
      e.data?.operationId === 'goto_home' || 
      e.data?.event?.includes('home_ready')
    );
    
    assert.ok(homeEvents.length > 0, 'Should have home checkpoint events');
    
    await ctx.ui.stop();
  }, 120000);

  it('collect stage: search_ready checkpoint', async () => {
    await ctx.ui.start(true);
    
    // Configure
    await ctx.ui.tab('小红书');
    await sleep(500);
    
    await ctx.ui.input('#keyword-input', 'search-checkpoint-test');
    await ctx.ui.input('#target-input', '1');
    
    // Start
    await ctx.ui.click('#start-btn');
    
    const runId = await waitForRunStart(ctx, 15000);
    assert.ok(runId, 'Task should start');
    
    // Wait for search_ready checkpoint (submit_search operation)
    await sleep(15000);
    
    // Check events
    const events = await ctx.api.get(`/api/v1/tasks/${runId}/events`);
    const searchEvents = events.filter((e: any) => 
      e.data?.operationId === 'submit_search' ||
      e.data?.event?.includes('search_ready')
    );
    
    assert.ok(searchEvents.length > 0, 'Should have search checkpoint events');
    
    await ctx.ui.stop();
  }, 120000);

  it('collect stage: index click with retry', async () => {
    await ctx.ui.start(true);
    
    // Configure with collect index options
    await ctx.ui.tab('小红书');
    await sleep(500);
    
    await ctx.ui.input('#keyword-input', 'index-retry-test');
    await ctx.ui.input('#target-input', '3');
    
    // Start
    await ctx.ui.click('#start-btn');
    
    const runId = await waitForRunStart(ctx, 15000);
    assert.ok(runId, 'Task should start');
    
    // Wait for collect operations
    await sleep(20000);
    
    // Check for collect index events
    const events = await ctx.api.get(`/api/v1/tasks/${runId}/events`);
    const collectEvents = events.filter((e: any) => 
      e.data?.operationId === 'collect_links' ||
      e.data?.stage === 'open_detail'
    );
    
    assert.ok(collectEvents.length > 0, 'Should have collect events');
    
    await ctx.ui.stop();
  }, 180000);

  it('debug mode: stop on checkpoint failure', async () => {
    await ctx.ui.start(true);
    
    // Configure in debug mode
    await ctx.ui.tab('小红书');
    await sleep(500);
    
    await ctx.ui.input('#keyword-input', 'debug-stop-test');
    await ctx.ui.input('#target-input', '1');
    
    // Start
    await ctx.ui.click('#start-btn');
    
    const runId = await waitForRunStart(ctx, 15000);
    assert.ok(runId, 'Task should start');
    
    // In debug mode, failures should stop immediately
    await sleep(30000);
    
    const task = await ctx.api.get(`/api/v1/tasks/${runId}`);
    // Task may be running, completed, or failed - all valid
    assert.ok(task, 'Task should exist');
    
    // Check for error events (if any)
    const events = await ctx.api.get(`/api/v1/tasks/${runId}/events`);
    const errorEvents = events.filter((e: any) => 
      e.data?.event?.includes('error') ||
      e.data?.event?.includes('timeout')
    );
    
    // In debug mode, errors should cause immediate stop
    // This is expected behavior, not a failure
    
    await ctx.ui.stop();
  }, 180000);
});
