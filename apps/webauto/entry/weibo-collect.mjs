#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { getWeiboCollectHelpLines, runWeiboCollect } from './lib/weibo-collect-runner.mjs';

function printCollectHelp() {
  console.log(getWeiboCollectHelpLines().join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printCollectHelp();
    return;
  }

  const daemonWorkerId = process.env.WEBAUTO_DAEMON_WORKER_ID || '';
  const daemonBypass = process.env.WEBAUTO_DAEMON_BYPASS === '1';
  if (!daemonWorkerId && !daemonBypass) {
    console.error([
      '❌ weibo-collect: 非 daemon 方式启动已禁止',
      '',
      '请通过 daemon 启动任务：',
      '  webauto daemon start',
      '  webauto daemon task submit -- weibo collect --profile <id> --keyword <kw> [options...]',
      '',
      '如需调试绕过（仅限开发环境）：',
      '  WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo collect ...',
    ].join('\n'));
    process.exit(1);
  }
  await runWeiboCollect(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ weibo-collect failed:', err?.message || String(err));
    process.exit(1);
  });
}
