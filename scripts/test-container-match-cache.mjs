#!/usr/bin/env node
/**
 * 测试 DOM 缓存生效
 * 
 * 使用：
 *   WEBAUTO_CONTAINER_SNAPSHOT_CACHE=1 node scripts/test-container-match-cache.mjs --profile xiaohongshu_batch-2
 */

import { execSync } from 'node:child_process';

const PROFILE = process.argv.find(a => a.startsWith('--profile='))?.split('=')[1] || 'xiaohongshu_batch-2';
const CONTROLLER_URL = process.env.WEBAUTO_UNIFIED_API_URL || 'http://127.0.0.1:7701';

async function matchOnce(label, url, cache, cacheTtlMs, invalidateCache) {
  const payload = {
    profile: PROFILE,
    url,
    maxDepth: 2,
    maxChildren: 5,
    cache,
    cacheTtlMs,
    invalidateCache,
  };

  const body = JSON.stringify({ action: 'containers:match', payload });
  
  try {
    const resp = await fetch(`${CONTROLLER_URL}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    
    if (!resp.ok) {
      console.error(`[${label}] HTTP ${resp.status}: ${await resp.text()}`);
      return null;
    }
    
    const data = await resp.json();
    const cacheInfo = data?.data?.cache || data?.cache;
    const matched = data?.data?.matched ?? data?.matched;
    const containerId = data?.data?.container?.id ?? data?.container?.id;
    
    console.log(`[${label}] matched=${matched} container=${containerId || 'none'} cache=${JSON.stringify(cacheInfo)}`);
    return { matched, cache: cacheInfo, containerId };
  } catch (e) {
    console.error(`[${label}] Error: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log(`Testing DOM cache for profile: ${PROFILE}`);
  console.log(`Controller: ${CONTROLLER_URL}`);
  console.log(`Cache enabled: ${process.env.WEBAUTO_CONTAINER_SNAPSHOT_CACHE === '1'}`);
  console.log('');

  // 需要先获取当前 URL
  let currentUrl = null;
  try {
    const sessions = JSON.parse(execSync('node scripts/session-manager.mjs --list --json', { encoding: 'utf8', cwd: '/Users/fanzhang/Documents/github/webauto' }));
    const session = sessions.find(s => s.profile === PROFILE || s.profileId === PROFILE);
    currentUrl = session?.currentUrl || session?.current_url;
  } catch (e) {
    console.log('Could not get current URL from session manager');
  }

  if (!currentUrl) {
    console.error('Error: No current URL found for profile. Please ensure browser is open.');
    process.exit(1);
  }

  console.log(`Current URL: ${currentUrl}`);
  console.log('');

  // Test 1: 首次匹配（无缓存）
  console.log('=== Test 1: First match (cold cache) ===');
  const r1 = await matchOnce('test1_cold', currentUrl, true, 5000, true);
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 2: 再次匹配（命中缓存）
  console.log('=== Test 2: Second match (cache hit) ===');
  const r2 = await matchOnce('test2_warm', currentUrl, true, 5000, false);
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 3: 强制刷新（invalidate）
  console.log('=== Test 3: Forced refresh (invalidate) ===');
  const r3 = await matchOnce('test3_invalidate', currentUrl, true, 5000, true);

  console.log('');
  console.log('=== Summary ===');
  if (r2?.cache?.hit) {
    console.log('✅ Cache HIT confirmed');
  } else if (r2?.cache?.enabled) {
    console.log('⚠️ Cache enabled but MISSED (expected for cold cache)');
  } else {
    console.log('❌ Cache not enabled');
  }
  
  if (r2?.cache?.hit && !r3?.cache?.hit) {
    console.log('✅ InvalidateCache works');
  }
}

main().catch(console.error);
