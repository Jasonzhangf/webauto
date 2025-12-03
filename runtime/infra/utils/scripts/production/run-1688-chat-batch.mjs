#!/usr/bin/env node
// Read a simple batch config and run the relay workflow multiple times with startIndex and custom message
// Config example:
// {
//   "keyword": "钢化膜",
//   "message": "你好",
//   "maxTargets": 3,
//   "skipIfSent": true,
//   "workflowPath": "sharedmodule/libraries/workflows/1688/relay/1688-search-wangwang-chat-compose.json",
//   "sessionId": null
// }
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function main(){
  const cfgPath = process.argv[2] || 'batch-config.json';
  const cfg = JSON.parse(readFileSync(cfgPath,'utf8'));
  const workflowPath = cfg.workflowPath || 'sharedmodule/libraries/workflows/1688/relay/1688-search-wangwang-chat-compose.json';
  const items = [];
  const n = Math.max(1, Number(cfg.maxTargets || 1));
  for (let i=0;i<n;i++){
    items.push({ path: workflowPath, parameters: { keyword: cfg.keyword, chatMessage: cfg.message, startIndex: i, skipIfSent: !!cfg.skipIfSent } });
  }
  const sequence = { sharedParameters: { sessionId: cfg.sessionId || undefined }, workflows: items, pauseBetweenMs: 800 };
  // Use SequenceRunner locally
  const { default: SequenceRunner } = await import(join(process.cwd(), 'sharedmodule/libraries/workflows/SequenceRunner.js'));
  const runner = new SequenceRunner();
  const out = await runner.runSequence(writeTemp(sequence));
  console.log(JSON.stringify(out, null, 2));
}

function writeTemp(obj){
  const fs = require('fs');
  const p = join(process.cwd(), `tmp-seq-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

main().catch(e=>{ console.error(e); process.exit(1); });

