#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { getWeiboDetailHelpLines, runWeiboDetail } from './lib/weibo-detail-runner.mjs';

function printDetailHelp() {
  console.log(getWeiboDetailHelpLines().join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printDetailHelp();
    return;
  }

  const daemonWorkerId = process.env.WEBAUTO_DAEMON_WORKER_ID || '';
  const daemonBypass = process.env.WEBAUTO_DAEMON_BYPASS === '1';
  if (!daemonWorkerId && !daemonBypass) {
    console.error([
      '❌ weibo-detail: 非 daemon 方式启动已禁止',
      '',
      '请通过 daemon 启动任务：',
      '  webauto daemon start',
      '  webauto daemon task submit --detach -- weibo detail --profile <id> --links-file <path> [options...]',
      '',
      '如需调试绕过（仅限开发环境）：',
      '  WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo detail ...',
    ].join('\n'));
    process.exit(1);
  }
  await runWeiboDetail(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ weibo-detail failed:', err?.message || String(err));
    process.exit(1);
  });
}
