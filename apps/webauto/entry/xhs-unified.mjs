import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { printUnifiedHelp, runUnified } from './lib/xhs-unified-runner.mjs';

export { runUnified } from './lib/xhs-unified-runner.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
   printUnifiedHelp();
   return;
 }
 await runUnified(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('�?xhs-unified failed:', err?.message || String(err));
    process.exit(1);
  });
}
