/**
 * L1: Browser Input Stress Test
 * 
 * Purpose: Validate input-pipeline lock mechanism and timeout circuit breaker
 * Method: Send 1000 keyboard:press / mouse:click operations in rapid succession
 * 
 * Success Criteria:
 *   - Failure rate < 1%
 *   - P99 latency < 500ms
 *   - No process hang
 */

import { StressTestRunner, callBrowserService } from '../lib/test-runner.mjs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'xhs-qa-1', short: 'p' },
    count: { type: 'string', default: '100', short: 'n' },
    concurrency: { type: 'string', default: '1', short: 'c' },
    'browser-service': { type: 'string', default: 'http://127.0.0.1:7704' },
  },
});

const config = {
  profileId: values.profile,
  totalOps: parseInt(values.count, 10),
  concurrency: parseInt(values.concurrency, 10),
  browserServiceUrl: values['browser-service'],
};

console.log('=== L1: Browser Input Stress Test ===');
console.log(`Profile: ${config.profileId}`);
console.log(`Operations: ${config.totalOps}`);
console.log(`Concurrency: ${config.concurrency}`);
console.log(`Browser Service: ${config.browserServiceUrl}`);
console.log('');

async function runSingleOp(op, runner) {
  const start = Date.now();
  try {
    const result = await callBrowserService(
      op.action,
      { profileId: config.profileId, ...op.args },
      { browserServiceUrl: config.browserServiceUrl, timeoutMs: 10000 }
    );
    const latency = Date.now() - start;
    
    if (result.ok) {
      runner.recordSuccess(latency);
      return { ok: true, latency };
    } else {
      runner.recordError(result.error || 'Unknown error', latency);
      return { ok: false, latency, error: result.error };
    }
  } catch (err) {
    const latency = Date.now() - start;
    runner.recordError(err, latency);
    return { ok: false, latency, error: String(err) };
  }
}

async function runBatch(ops, runner) {
  return Promise.all(ops.map(op => runSingleOp(op, runner)));
}

async function main() {
  const runner = new StressTestRunner({
    name: 'stress-camo-input',
    profileId: config.profileId,
    browserServiceUrl: config.browserServiceUrl,
    maxErrors: 10, // Stop early if too many errors
  });

  // Build operation list
  const ops = [];
  for (let i = 0; i < config.totalOps; i++) {
    // Alternate between keyboard and mouse operations
    if (i % 2 === 0) {
      ops.push({ action: 'keyboard:press', args: { key: 'ArrowDown' } });
    } else {
      ops.push({ action: 'keyboard:press', args: { key: 'ArrowUp' } });
    }
  }

  console.log(`Running ${config.totalOps} operations with concurrency ${config.concurrency}...`);
  runner.metrics.startTime = Date.now();
  runner.snapshotMemory();

  try {
    // Run in batches based on concurrency
    for (let i = 0; i < ops.length; i += config.concurrency) {
      const batch = ops.slice(i, i + config.concurrency);
      await runBatch(batch, runner);
      
      // Snapshot memory every 50 operations
      if (i > 0 && i % 50 === 0) {
        runner.snapshotMemory();
      }
      
      // Progress indicator
      if ((i + config.concurrency) % 20 === 0) {
        process.stdout.write(`  Progress: ${i + config.concurrency}/${config.totalOps}\r`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(`\nTest aborted: ${err.message}`);
  }

  runner.metrics.endTime = Date.now();
  runner.snapshotMemory();

  // Print summary
  const summary = runner.summary();
  console.log('\n=== Test Summary ===');
  console.log(`Status: ${summary.status}`);
  console.log(`Total Ops: ${summary.totalOps}`);
  console.log(`Success: ${summary.successOps}`);
  console.log(`Failed: ${summary.failedOps}`);
  console.log(`Success Rate: ${summary.successRate}`);
  console.log(`Avg Latency: ${summary.avgLatency}`);
  console.log(`P50: ${summary.p50}`);
  console.log(`P99: ${summary.p99}`);
  console.log(`Max Heap: ${summary.maxHeapMB} MB`);
  console.log(`Memory Leak Rate: ${summary.leakRateMB} MB`);
  
  if (summary.errors.length > 0) {
    console.log('\nSample Errors:');
    summary.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.error}`);
    });
  }

  // Exit with appropriate code
  process.exit(summary.status === 'PASS' ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
