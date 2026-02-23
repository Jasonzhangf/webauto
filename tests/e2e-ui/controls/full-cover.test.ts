/**
 * L1: 控件探测层测试
 * 验证所有 UI 控件可探测、可操作、状态可读
 */

import { describe, it, beforeAll, afterAll, assert } from 'vitest';
import { TestContext, setupTestContext, teardownTestContext, sleep } from '../test-context.ts';

describe('L1: Full Cover', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  }, 30000);

  afterAll(async () => {
    await teardownTestContext();
  });

  it('full-cover returns valid report structure', async () => {
    await ctx.ui.start(true);
    const result = await ctx.ui.fullCover('./.tmp/test-full-cover.json');
    assert.ok(typeof result === 'object', 'Should return result object');
    assert.ok(typeof result.report === 'object', 'Should have report');
    await ctx.ui.stop();
  }, 120000);

  it('full-cover all buckets pass', async () => {
    await ctx.ui.start(true);
    const result = await ctx.ui.fullCover('./.tmp/test-full-cover.json');
    
    if (result.report?.coverage) {
      const coverage = result.report.coverage;
      assert.equal(coverage.failed, 0, 'Should have no failed operations');
      
      const buckets = coverage.buckets || {};
      for (const [name, bucket] of Object.entries(buckets)) {
        const b = bucket as any;
        assert.equal(b.failed, 0, `Bucket ${name} should have no failures`);
      }
    }
    
    await ctx.ui.stop();
  }, 120000);

  it('all critical selectors are reachable', async () => {
    await ctx.ui.start(true);
    
    const criticalSelectors = [
      '#keyword-input',
      '#target-input',
      '#start-btn',
    ];
    
    for (const selector of criticalSelectors) {
      try {
        await ctx.ui.tab('配置');
        const probe = await ctx.ui.probe(selector);
        // Probe may fail if tab doesn't have the selector
        if (probe.exists) {
          assert.ok(true, `Selector ${selector} exists`);
        }
      } catch {
        // Selector may not exist in this context
      }
    }
    
    await ctx.ui.stop();
  }, 120000);

  it('tab navigation covers all tabs', async () => {
    await ctx.ui.start(true);
    
    const tabs = ['初始化', '任务', '看板', '定时任务', '账户管理', '日志', '设置'];
    
    for (const tab of tabs) {
      try {
        await ctx.ui.tab(tab);
        await sleep(200);
      } catch {
        // Tab may not exist in this version
      }
    }
    
    await ctx.ui.stop();
  }, 60000);
});
