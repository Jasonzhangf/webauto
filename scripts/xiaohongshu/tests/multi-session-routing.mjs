#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';
ensureUtf8Console();

/**
 * multi-session-routing.mjs
 *
 * 验证多 session 环境下 Unified API → Browser Service 路由正确性：
 * - 对 batch-1 和 batch-2 并发执行 browser:execute
 * - 验证每个请求返回正确的 URL（说明路由到正确的浏览器实例）
 * - 验证日志中可见 profileId（需要 DEBUG=1）
 */

import { controllerAction } from '../../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';

const UNIFIED_API = 'http://127.0.0.1:7701';

async function getUrl(profile) {
  try {
    const res = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href'
    }, UNIFIED_API);
    return res?.result || res?.data?.result || '';
  } catch (err) {
    return `ERR: ${err.message}`;
  }
}

async function run() {
  const profiles = ['xiaohongshu_batch-1', 'xiaohongshu_batch-2'];
  const rounds = 5;
  console.log(`🔬 Multi-session routing test (${profiles.join(', ')})`);
  console.log(`   Rounds: ${rounds}`);
  console.log(`   DEBUG=${process.env.DEBUG || 0} (set DEBUG=1 to see ui-controller logs)\n`);

  for (let i = 0; i < rounds; i++) {
    console.log(`=== Round ${i + 1}/${rounds} ===`);
    const results = await Promise.all(
      profiles.map(async (p) => {
        const url = await getUrl(p);
        return { profile: p, url };
      })
    );
    results.forEach(({ profile, url }) => {
      const shortUrl = url.length > 80 ? url.slice(0, 77) + '...' : url;
      console.log(`  ${profile}: ${shortUrl}`);
    });
    console.log();
  }

  const finalUrls = await Promise.all(profiles.map(getUrl));
  console.log(`✅ Final URLs:`);
  profiles.forEach((p, idx) => {
    const url = finalUrls[idx];
    const shortUrl = url.length > 80 ? url.slice(0, 77) + '...' : url;
    console.log(`  ${p}: ${shortUrl}`);
  });

  if (finalUrls[0] && finalUrls[1] && finalUrls[0] !== finalUrls[1]) {
    console.log(`✅ PASS: Two sessions return different URLs (routing is correct)`);
    process.exit(0);
  } else {
    console.log(`⚠️  WARN: Sessions may not be distinct (same URL or error)`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
