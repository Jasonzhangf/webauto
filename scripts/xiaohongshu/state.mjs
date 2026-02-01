#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Xiaohongshu collect state CLI
 *
 * 用法：
 *   node scripts/xiaohongshu/state.mjs show --keyword "工作服" --env debug
 *   node scripts/xiaohongshu/state.mjs show --keyword "工作服" --env debug --json
 */

import minimist from 'minimist';

import {
  formatXhsCollectStateSummary,
  loadXhsCollectState,
} from '../../dist/modules/state/src/xiaohongshu-collect-state.js';

function usage() {
  console.log('Usage: node scripts/xiaohongshu/state.mjs show --keyword <kw> --env <env> [--json]');
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const cmd = String(argv._[0] || '').trim();
  if (!cmd) {
    usage();
    process.exit(1);
  }

  if (cmd !== 'show') {
    console.error(`Unknown command: ${cmd}`);
    usage();
    process.exit(1);
  }

  const keyword = String(argv.keyword || '').trim();
  const env = String(argv.env || '').trim() || 'debug';
  const asJson = argv.json === true || argv.json === '1' || argv.json === 1;

  if (!keyword) {
    console.error('❌ missing --keyword');
    process.exit(1);
  }

  const state = await loadXhsCollectState({ keyword, env });
  if (asJson) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  console.log(formatXhsCollectStateSummary(state));
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});

