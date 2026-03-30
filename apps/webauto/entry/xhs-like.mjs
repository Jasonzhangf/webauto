#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { runUnified } from './lib/xhs-unified-runner.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log(`webauto xhs like

Usage:
  webauto xhs like --keyword <kw> [options...]

Description:
  仅执行点赞操作（基于搜索结果）。
  内部转发到 unified --stage like。

Required:
  --keyword <kw>     搜索关键词

Optional:
  --profile <id>     camo profile ID (未提供将自动选择最近可用的一个 profile)

Examples:
  webauto xhs like --keyword "AI绘画" --like-keywords "牛逼,好看" --env debug
  webauto xhs like --profile xiaohongshu-batch-1 --keyword "AI绘画" --env debug
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

