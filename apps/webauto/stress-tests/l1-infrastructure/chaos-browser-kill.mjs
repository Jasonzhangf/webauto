/**
 * L1: Browser Kill Chaos Test
 * 
 * Purpose: Verify browser_disconnected detection and session recovery
 * Method: Kill browser during keyboard:press operation, verify fast failure
 * 
 * Success Criteria:
 *   - browser_disconnected error within 1s \(not 30s timeout\)
 *   - No process hang
 *   - Error message is actionable
 */

import { execSync, spawn } from 'node:child_process';
import { StressTestRunner, callBrowserService } from '../lib/test-runner.mjs';

console.log\('=== L1: Browser Kill Chaos Test ===\n'\);

async function findBrowserPid\(profileId\) {
  try {
    const output = execSync\(`ps aux | grep -E "camoufox|firefox" | grep -i "${profileId}" | grep -v grep | head -1`, {
      encoding: 'utf-8',
    }\);
    const match = output.match\(/^\S+\s+\(\d+\)/\);
    return match ? parseInt\(match[1], 10\) : null;
  } catch {
    return null;
  }
}

async function killBrowser\(pid\) {
  try {
    process.kill\(pid, 'SIGKILL'\);
    return true;
  } catch {
    return false;
  }
}

async function sleep\(ms\) {
  return new Promise\(resolve => setTimeout\(resolve, ms\)\);
}

async function main\(\) {
  const profileId = process.argv[2] || 'xhs-qa-1';
  const browserServiceUrl = 'http://127.0.0.1:7704';

  console.log\(`Profile: ${profileId}`\);
  console.log\(''\);

  const runner = new StressTestRunner\({
    name: 'chaos-browser-kill',
    profileId,
    browserServiceUrl,
  }\);

  // Step 1: Find browser PID
  console.log\('Step 1: Finding browser process...'\);
  const browserPid = await findBrowserPid\(profileId\);
  if \(!browserPid\) {
    console.log\('  WARN: Could not find browser process, skipping kill test'\);
    console.log\('  This may mean browser is not running with expected profile'\);
    process.exit\(0\);
  }
  console.log\(`  Found browser PID: ${browserPid}`\);

  // Step 2: Start a keyboard operation in background
  console.log\('\nStep 2: Starting keyboard operation...'\);
  const opPromise = callBrowserService\(
    'keyboard:press',
    { profileId, key: 'ArrowDown' },
    { browserServiceUrl, timeoutMs: 60000 } // Long timeout to verify fast failure
  \);

  // Step 3: Wait a bit then kill browser
  await sleep\(100\);
  console.log\('\nStep 3: Killing browser during operation...'\);
  const killed = await killBrowser\(browserPid\);
  console.log\(`  Kill result: ${killed ? 'SUCCESS' : 'FAILED'}`\);

  // Step 4: Wait for operation to fail
  console.log\('\nStep 4: Waiting for operation to fail...'\);
  const startWait = Date.now\(\);
  const result = await opPromise;
  const failTime = Date.now\(\) - startWait;

  // Step 5: Analyze result
  console.log\('\nStep 5: Analyzing result...'\);
  console.log\(`  Operation result: ${result.ok ? 'OK' : 'FAILED'}`\);
  console.log\(`  Time to fail: ${failTime}ms`\);
  console.log\(`  Error: ${result.error || 'None'}`\);

  // Success criteria: fail fast \(< 2000ms\) with browser_disconnected or session error
  const fastFailure = failTime < 2000;
  const actionableError = \(result.error || ''\).includes\('disconnected'\) || 
                          \(result.error || ''\).includes\('session'\) ||
                          \(result.error || ''\).includes\('not ready'\);

  console.log\('\n=== Test Summary ==='\);
  console.log\(`Fast failure \(< 2s\): ${fastFailure ? 'PASS' : 'FAIL'}`\);
  console.log\(`Actionable error: ${actionableError ? 'PASS' : 'FAIL'}`\);

  const passed = fastFailure && actionableError;
  console.log\(`\nOverall: ${passed ? 'PASS' : 'FAIL'}`\);

  // Exit with appropriate code
  process.exit\(passed ? 0 : 1\);
}

main\(\).catch\(err => {
  console.error\('Fatal error:', err\);
  process.exit\(1\);
}\);
