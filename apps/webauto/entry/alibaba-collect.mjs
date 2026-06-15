#!/usr/bin/env node
// Alibaba.com 采集入口

import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { runAlibabaCollect } from './lib/alibaba-collect-runner.mjs';

async function main() {
  // 硬性收敛：长时间运行任务必须通过 daemon 启动
  const daemonWorkerId = process.env.WEBAUTO_DAEMON_WORKER_ID || '';
  const daemonBypass = process.env.WEBAUTO_DAEMON_BYPASS === '1';
  if (!daemonWorkerId && !daemonBypass) {
    console.error([
      '❌ alibaba-collect: 非 daemon 方式启动已禁止',
      '',
      '请通过 daemon 启动任务：',
      '  webauto daemon start',
      '  webauto daemon task submit -- alibaba collect --profile <id> --keyword <kw> [options...]',
      '',
      '如需调试绕过（仅限开发环境）：',
      '  WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs alibaba collect ...',
    ].join('\n'));
    process.exit(1);
  }

  const argv = parseArgv();
  await runAlibabaCollect(argv);
}

function parseArgv() {
  const raw = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < raw.length; i++) {
    const key = raw[i];
    if (key.startsWith('--')) {
      const name = key.slice(2);
      const value = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[i + 1] : 'true';
      result[name] = value;
      if (value !== 'true') i++;
    }
  }
  return {
    profileId: result.profile || '',
    keyword: result.keyword || '',
    maxNotes: Number(result['max-notes']) || 20,
    maxScrolls: Number(result['max-scrolls']) || 5,
    doContact: result['do-contact'] === 'true',
    env: result.env || 'debug',
  };
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ Alibaba collect failed:', err?.message || String(err));
    process.exit(1);
  });
}

export { main as runAlibabaCollectCLI };
