#!/usr/bin/env node
import { parseArgs } from 'node:util';

const daemonWorkerId = process.env.WEBAUTO_DAEMON_WORKER_ID || '';
const daemonBypass = process.env.WEBAUTO_DAEMON_BYPASS === '1';
if (!daemonWorkerId && !daemonBypass) {
  console.error('❌ weibo-unified: 非 daemon 方式启动已禁止。请通过 webauto daemon task submit 启动。');
  console.error('   调试: WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo unified ...');
  process.exit(1);
}

import { runWeiboUnified, printWeiboUnifiedHelp } from './lib/weibo-unified-runner.mjs';

export { runWeiboUnified } from './lib/weibo-unified-runner.mjs';

const { values } = parseArgs({
  options: {
    'task-type': { type: 'string', default: 'timeline' },
    profile: { type: 'string', default: 'weibo' },
    target: { type: 'string', default: '50' },
    env: { type: 'string', default: 'prod' },
    date: { type: 'string' },
    'output-root': { type: 'string' },
    'scroll-delay': { type: 'string', default: '2500' },
    'max-empty-scrolls': { type: 'string', default: '2' },
    keyword: { type: 'string' },
    'max-pages': { type: 'string', default: '3' },
    'user-ids': { type: 'string' },
    'with-detail': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help) {
  printWeiboUnifiedHelp();
  process.exit(0);
}

runWeiboUnified(values)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  });
