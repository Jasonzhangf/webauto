#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(cmd, args){
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status||1);
}

run('node', ['scripts/service/stop-api.mjs']);
run('node', ['scripts/service/start-api.mjs']);

