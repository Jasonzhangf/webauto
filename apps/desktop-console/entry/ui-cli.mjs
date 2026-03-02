#!/usr/bin/env node
import minimist from 'minimist';
import { runUiCli } from './ui-cli/main.mjs';

const args = minimist(process.argv.slice(2), {
  boolean: ['help', 'json', 'auto-start', 'build', 'install', 'continue-on-error', 'exact', 'keep-open', 'detailed', 'dry-run', 'headless'],
  string: [
    'host',
    'port',
    'selector',
    'value',
    'text',
    'key',
    'tab',
    'label',
    'state',
    'file',
    'output',
    'timeout',
    'interval',
    'nth',
    'reason',
    'mode',
    'keyword',
    'env',
    'profile',
    'profiles',
    'profilepool',
    'target',
    'max-notes',
  ],
  alias: { h: 'help', k: 'keyword' },
  default: { 'auto-start': false, json: false, 'keep-open': false },
});

runUiCli(args).catch((err) => {
  console.error(`[ui-cli] ${err?.message || String(err)}`);
  process.exit(1);
});
