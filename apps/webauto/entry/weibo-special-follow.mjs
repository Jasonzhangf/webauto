#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { assertDaemonAdmission, runWeiboCli } from '../weibo-v3/cli.mjs';

export async function runWeiboSpecialFollowTask(args = {}) {
  const subcommand = String(args.subcommand || args._?.[0] || 'status');
  return runWeiboCli('special-follow', { ...args, subcommand });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = minimist(process.argv.slice(2));
  if (!argv.help && !argv.h) assertDaemonAdmission();
  const subcommand = String(argv.subcommand || argv._?.[0] || 'status');
  const result = await runWeiboCli('special-follow', { ...argv, subcommand });
  if (!result?.help) console.log(JSON.stringify(result, null, 2));
  if (result?.ok === false || result?.success === false) process.exitCode = 1;
}
