#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { runUnified } from './lib/xhs-unified-runner.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log(`webauto xhs feed-like

Usage:
  webauto xhs feed-like --profile <id> --keyword <kw> [options...]

Description:
  仅执行首页Feed点赞。
  内部转发到 unified --stage like。

Required:
  --profile <id>     camo profile ID
  [options...]

Examples:
  webauto xhs feed-like --profile xiaohongshu-batch-1 --keyword "AI绘��" --like-keywords "牛逼,好看" --env debug
`);
    return;
  }
  await runUnified(argv, { stage: 'feed-like' });
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ xhs-feed-like failed:', err?.message || String(err));
    process.exit(1);
  });
}
