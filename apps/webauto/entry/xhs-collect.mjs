#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { getCollectHelpLines, runXhsCollect } from './lib/xhs-collect-runner.mjs';

function printCollectHelp() {
  console.log(getCollectHelpLines().join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printCollectHelp();
    return;
  }

  await runXhsCollect(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ xhs-collect failed:', err?.message || String(err));
    process.exit(1);
  });
}
