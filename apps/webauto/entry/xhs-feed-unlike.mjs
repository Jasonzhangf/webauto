#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { runUnified } from './lib/xhs-unified-runner.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log(`webauto xhs feed-unlike

Usage:
  webauto xhs feed-unlike --keywords <a,b,c> [options...]

Description:
  Feed unlike only. Internally forwards to unified --stage feed-unlike.

Note:
  Must run via: webauto daemon task submit --detach -- xhs feed-unlike ...

Required:
  --keywords <a,b,c>   Comma-separated keywords (max 4 used).

Optional:
  --profile <id>       camo profile ID (optional if exactly one default profile exists)

Examples:
  webauto xhs feed-unlike --keywords "团队建设,团建策划,深圳团建,广东团建"
  webauto xhs feed-unlike --profile profile-0 --keywords "团队建设,团建策划,深圳团建,广东团建"
`);
    return;
  }
  await runUnified(argv, { stage: 'feed-unlike' });
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('xhs-feed-unlike failed:', err?.message || String(err));
    process.exit(1);
  });
}
