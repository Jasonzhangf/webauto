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

  // 硬性收敛：长时间运行任务必须通过 daemon 启动
  const daemonWorkerId = process.env.WEBAUTO_DAEMON_WORKER_ID || '';
  const daemonBypass = process.env.WEBAUTO_DAEMON_BYPASS === '1';
  if (!daemonWorkerId && !daemonBypass) {
    console.error([
      '❌ xhs-collect: 非 daemon 方式启动已禁止',
      '',
      '请通过 daemon 启动任务：',
      '  webauto daemon start',
      '  webauto daemon task submit --detach -- xhs collect --profile <id> --keyword <kw> [options...]',
      '',
      '如需调试绕过（仅限开发环境）：',
      '  WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs xhs collect ...',
    ].join('\n'));
    process.exit(1);
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
