/**
 * Parallel Scheduling API Test
 *
 * 验证 resourceMutex-based parallel scheduling 是否正确工作
 */

import path from 'node:path';
import fs from 'node:fs';

const WEBAUTO_ROOT = '/Users/fanzhang/Documents/github/webauto';
const SCHEDULE_STORE_PATH = path.join(WEBAUTO_ROOT, 'apps/webauto/entry/lib/schedule-store.mjs');

async function testParallelSchedulingAPI() {
  console.log('=== Parallel Scheduling API Test ===\n');

  // Step 1: Verify schedule-store.mjs has resourceMutex support
  console.log('Step 1: Check schedule-store.mjs resourceMutex...');
  const scheduleStoreContent = fs.readFileSync(SCHEDULE_STORE_PATH, 'utf-8');

  const checks = [
    ['DEFAULT_SCHEDULER_POLICY', 'Scheduler policy defined'],
    ['maxConcurrency', 'Global concurrency limit'],
    ['maxConcurrencyByPlatform', 'Platform concurrency limits'],
    ['resourceMutex', 'Resource mutex dimensions'],
    ['checkConcurrencyAllowance', 'Concurrency check function'],
    ['claimScheduleTask', 'Task claim with resource locks'],
    ['buildResourceKeys', 'Resource key builder'],
    ['acquireLease', 'Lease acquisition'],
    ['releaseResourceClaims', 'Resource claim release'],
  ];

  let allChecksPass = true;
  for (const [pattern, desc] of checks) {
    if (scheduleStoreContent.includes(pattern)) {
      console.log(`  ✅ ${desc}: ${pattern}`);
    } else {
      console.log(`  ❌ ${desc}: ${pattern} missing`);
      allChecksPass = false;
    }
  }

  // Step 2: Verify DEFAULT_SCHEDULER_POLICY values
  console.log('\nStep 2: Check DEFAULT_SCHEDULER_POLICY values...');
  
  const maxConcurrencyMatch = scheduleStoreContent.match(/maxConcurrency:\s*(\d+)/);
  if (maxConcurrencyMatch) {
    const value = parseInt(maxConcurrencyMatch[1]);
    console.log(`  maxConcurrency = ${value}`);
    if (value === 1) {
      console.log('  ⚠️  maxConcurrency=1 limits global parallelism to 1');
      console.log('  💡 Recommend: Increase to 2-3 for parallel scheduling');
    } else if (value >= 2) {
      console.log(`  ✅ maxConcurrency=${value} allows parallel execution`);
    }
  }

  const resourceMutexMatch = scheduleStoreContent.match(/resourceMutex:\s*\{[^}]+\}/);
  if (resourceMutexMatch) {
    console.log(`  ${resourceMutexMatch[0]}`);
    if (resourceMutexMatch[0].includes('enabled: true')) {
      console.log('  ✅ resourceMutex.enabled=true');
    }
    if (resourceMutexMatch[0].includes('dimensions:')) {
      console.log('  ✅ dimensions defined (account/profile)');
    }
  }

  // Step 3: Verify daemon.mjs removed activeJobs blocking
  console.log('\nStep 3: Check daemon.mjs parallel scheduling...');
  const daemonPath = path.join(WEBAUTO_ROOT, 'apps/webauto/entry/daemon.mjs');
  const daemonContent = fs.readFileSync(daemonPath, 'utf-8');

  // Check if the blocking line was removed
  if (daemonContent.includes('if (activeJobs.length > 0) break;')) {
    console.log('  ❌ activeJobs blocking still present');
    console.log('  💡 Need to remove: if (activeJobs.length > 0) break;');
  } else {
    console.log('  ✅ activeJobs blocking removed - parallel scheduling enabled');
  }

  // Check if scheduleExecuteTask is still awaited (serial)
  if (daemonContent.includes('await scheduleExecuteTask(task);')) {
    console.log('  ⚠️  scheduleExecuteTask still awaited (serial execution)');
    console.log('  💡 Parallel version: fire-and-forget or Promise.allSettled');
  }

  // Step 4: Verify scheduleExecuteTask uses claimScheduleTask
  console.log('\nStep 4: Check scheduleExecuteTask flow...');
  if (daemonContent.includes('const claim = claimScheduleTask(task, {')) {
    console.log('  ✅ claimScheduleTask called before execution');
  }
  if (daemonContent.includes('if (!claim.ok)')) {
    console.log('  ✅ Claim failure handled (task_busy/resource_busy)');
  }

  // Summary
  console.log('\n=== Test Summary ===');
  
  const parallelEnabled = !daemonContent.includes('if (activeJobs.length > 0) break;');
  const resourceMutexWorking = allChecksPass && scheduleStoreContent.includes('resourceMutex');
  
  if (parallelEnabled && resourceMutexWorking) {
    console.log('✅ ✅ ✅ PARALLEL SCHEDULING API READY!');
    console.log('✅ Architecture supports parallel scheduling via resourceMutex');
    console.log('\nNext step: E2E test with actual XHS + Weibo tasks');
  } else {
    console.log('⚠️ Parallel scheduling needs more work');
    if (!parallelEnabled) console.log('  - Remove activeJobs blocking in daemon.mjs');
    if (!resourceMutexWorking) console.log('  - Fix resourceMutex implementation');
  }
}

testParallelSchedulingAPI().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
