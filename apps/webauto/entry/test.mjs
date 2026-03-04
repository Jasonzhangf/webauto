#!/usr/bin/env node
import minimist from 'minimist';
import { printTestHelp, runTestCli } from './lib/test-cli.mjs';

const args = minimist(process.argv.slice(2), {
  boolean: ['help', 'json', 'headless', 'xhs-collect'],
  string: ['layer', 'output', 'profile', 'keyword', 'target'],
  alias: { h: 'help', l: 'layer', o: 'output' },
});

if (args.help || args.h) {
  printTestHelp();
  process.exit(0);
}

runTestCli(args)
  .then((ret) => {
    process.exit(ret.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(`[webauto test] ${err?.message || String(err)}`);
    process.exit(1);
  });
