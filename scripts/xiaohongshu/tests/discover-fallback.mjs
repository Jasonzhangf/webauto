#!/usr/bin/env node

/**
 * 独立验证：XhsDiscoverFallbackBlock
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/discover-fallback.mjs --profile xiaohongshu_batch-2 --keyword "小米造车" --env debug
 */

import { ensureCoreServices } from '../../lib/ensure-core-services.mjs';

function parseArgs(argv) {
  const args = { profile: '', keyword: '', env: 'debug', unifiedApiUrl: 'http://127.0.0.1:7701' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--profile') args.profile = argv[++i] || '';
    else if (a === '--keyword') args.keyword = argv[++i] || '';
    else if (a === '--env') args.env = argv[++i] || 'debug';
    else if (a === '--unified') args.unifiedApiUrl = argv[++i] || args.unifiedApiUrl;
  }
  if (!args.profile) throw new Error('必须提供 --profile');
  if (!args.keyword) throw new Error('必须提供 --keyword');
  return args;
}

const { profile, keyword, env, unifiedApiUrl } = parseArgs(process.argv);

await ensureCoreServices({ timeoutMs: 60_000 });

// Import from dist to ensure we test the built artifact used by services.
const mod = await import('../../../dist/modules/xiaohongshu/app/src/blocks/XhsDiscoverFallbackBlock.js');

console.log(`[TestDiscoverFallback] start profile=${profile} keyword=${keyword} env=${env}`);
const out = await mod.execute({ profile, keyword, env, unifiedApiUrl });

console.log('[TestDiscoverFallback] result:', JSON.stringify(out, null, 2));

if (!out.success) {
  process.exitCode = 1;
}

