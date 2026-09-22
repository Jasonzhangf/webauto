#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { assertDaemonAdmission, runWeiboCli } from '../weibo-v3/cli.mjs';

export async function runWeiboUnified(argv = {}) {
  return runWeiboCli('unified', argv);
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (!argv.help && !argv.h) assertDaemonAdmission();
  const result = await runWeiboCli('unified', argv);
  if (!result?.help) console.log(JSON.stringify(result, null, 2));
  if (result?.ok === false || result?.success === false) process.exitCode = 1;
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
