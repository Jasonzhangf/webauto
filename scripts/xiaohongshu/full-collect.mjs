#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Full Collect CLI（占位骨架）
 *
 * 目前仅串联 Phase2，Phase3/4 后续补齐。
 */

import minimist from 'minimist';
import { searchAndCollectList } from './workflows/phase2-search-collect.mjs';

const argv = minimist(process.argv.slice(2));

async function main() {
  if (argv.help || argv.h) {
    console.log('Usage: node scripts/xiaohongshu/full-collect.mjs --keyword <kw> --target <n> [--env debug|prod]');
    process.exit(0);
  }

  const keyword = argv.keyword || argv.k || '手机膜';
  const target = Number(argv.target || argv.t || 50);
  const env = argv.env || 'debug';

  console.log(`[FullCollect] keyword=${keyword} target=${target} env=${env}`);

  // Phase2: 搜索与链接采集
  const { outPath, results } = await searchAndCollectList({ keyword, targetCount: target, env });
  console.log(`[FullCollect] phase2 done: count=${results.length} out=${outPath}`);

  // Phase3/4 暂未实现
  console.warn('[FullCollect] Phase3/4 未实现，后续补齐。');
}

main().catch((err) => {
  console.error('[FullCollect] failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});

