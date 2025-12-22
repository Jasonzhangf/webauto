#!/usr/bin/env node
/**
 * Workflow CLI（占位）
 */

import { getStateBus } from '../core/src/state-bus.mjs';

const args = process.argv.slice(2);
const cmd = args[0];

async function start() {
  const bus = getStateBus();
  bus.register('workflow', { version: '0.1.0' });
  console.log('[Workflow] 已注册');
}

if (cmd === 'start') {
  start().catch(console.error);
} else {
  console.log('用法: node cli.mjs start');
  process.exit(1);
}
