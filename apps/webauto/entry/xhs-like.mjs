#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { runUnified } from './lib/xhs-unified-runner.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log(`webauto xhs like

Usage:
  webauto xhs like --profile <id> --keyword <kw> [options...]

Description:
  仅执行点赞操作（基于搜索结果）。
  内部转发到 unified --stage like。

Required:
  --profile <id>     camo profile ID
  --keyword <kw>     搜索关键词

Examples:
  webauto xhs like --profile xiaohongshu-batch-1 --keyword "AI绘��" --like-keywords "牛逼,好看" --env debug
`);
    return;
  }
  await runUnified(argv, { stage: 'like' });
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ xhs-like failed:', err?.message || String(err));
    process.exit(1);
  });
}
