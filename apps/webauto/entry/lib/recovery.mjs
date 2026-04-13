/**
 * Shared Recovery Module
 *
 * Unified health check + recovery for all runners
 * Standardized interface with consistent behavior
 */

import { execSync } from 'node:child_process';

const CAMO_RUNTIME_URL = 'http://127.0.0.1:7704/health';
const UNIFIED_API_URL = 'http://127.0.0.1:7701/health';

const DEFAULT_RECOVERY_OPTIONS = Object.freeze({
  healthCheckUrls: [CAMO_RUNTIME_URL, UNIFIED_API_URL],
  camoStartTimeoutMs: 60000,
  recoveryWaitMs: 10000,
  platformUrls: {
    xiaohongshu: 'https://www.xiaohongshu.com',
    weibo: 'https://weibo.com',
    1688: 'https://www.1688.com',
  },
  visible: false, // Default to headless (can be overridden)
});

/**
 * Check health of a single URL
 */
async function checkHealthUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', timeout: 5000 });
    const health = await res.json();
    return { ok: health.ok === true, url, details: health };
  } catch (err) {
    return { ok: false, url, error: err.message };
  }
}

/**
 * Check health of all configured URLs
 */
export async function checkHealth(options = {}) {
  const opts = { ...DEFAULT_RECOVERY_OPTIONS, ...options };
  const urls = opts.healthCheckUrls || DEFAULT_RECOVERY_OPTIONS.healthCheckUrls;
  
  const results = await Promise.all(urls.map(url => checkHealthUrl(url)));
  const allOk = results.every(r => r.ok);

  return {
    ok: allOk,
    results,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Standardized recovery flow for all runners
 * 
 * @param {string} profileId - Browser profile ID
 * @param {string} platform - Platform name (xiaohongshu, weibo, 1688)
 * @param {Object} options - Recovery options
 */
export async function healthCheckAndRecover(profileId, platform = 'xiaohongshu', options = {}) {
  const opts = { ...DEFAULT_RECOVERY_OPTIONS, ...options };
  const logPrefix = opts.logPrefix || '[runner]';

  // Step 1: Health check
  console.log(`${logPrefix} running health check...`);
  const healthResult = await checkHealth(opts);
  
  if (healthResult.ok) {
    console.log(`${logPrefix} health check passed`);
    return { ok: true, healthResult };
  }

  // Step 2: Log which services failed
  const failedUrls = healthResult.results.filter(r => !r.ok);
  console.log(`${logPrefix} health check failed for: ${failedUrls.map(r => r.url).join(', ')}`);
  console.log(`${logPrefix} attempting auto-recovery...`);

  // Step 3: Attempt recovery (restart camo)
  const platformUrl = opts.platformUrls[platform] || DEFAULT_RECOVERY_OPTIONS.platformUrls[platform];
  const visibleFlag = opts.visible ? '--visible' : '';
  const camoCmd = `camo start ${profileId} --url ${platformUrl} ${visibleFlag}`;

  try {
    console.log(`${logPrefix} running: ${camoCmd}`);
    execSync(camoCmd, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: opts.camoStartTimeoutMs || 60000,
    });
    
    console.log(`${logPrefix} camo started, waiting ${(opts.recoveryWaitMs || 10000) / 1000}s for ready...`);
    await sleep(opts.recoveryWaitMs || 10000);

    // Step 4: Verify recovery
    const healthResult2 = await checkHealth(opts);
    if (healthResult2.ok) {
      console.log(`${logPrefix} ✅ auto-recovery successful!`);
      return { ok: true, recovered: true, healthResult: healthResult2 };
    }

    console.log(`${logPrefix} recovery started but health still fails`);
  } catch (err) {
    console.error(`${logPrefix} recovery command failed: ${err.message}`);
  }

  console.log(`${logPrefix} ❌ auto-recovery failed`);
  return { ok: false, reason: 'health_check_failed', healthResult };
}

/**
 * Sleep utility
 */
export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get recovery module version
 */
export function getRecoveryVersion() {
  return '1.0.0';
}

/**
 * Get default recovery options
 */
export function getDefaultRecoveryOptions() {
  return DEFAULT_RECOVERY_OPTIONS;
}
