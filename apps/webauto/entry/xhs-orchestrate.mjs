#!/usr/bin/env node
import minimist from 'minimist';
import { runUnified } from './xhs-unified.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  const mode = String(argv.mode || 'phase1-phase2-unified').trim();

  if (mode === 'phase1-only') {
    console.log(JSON.stringify({ event: 'xhs.orchestrate.skip', mode, reason: 'phase1 is merged into runtime bootstrap' }));
    return;
  }

  if (mode === 'phase1-phase2') {
    await runUnified(argv, {
      doComments: false,
      doLikes: false,
      doReply: false,
      doOcr: false,
      persistComments: false,
    });
    return;
  }

  if (mode === 'phase1-phase2-unified' || mode === 'unified-only') {
    await runUnified(argv);
    return;
  }

  throw new Error(`invalid mode: ${mode}`);
}

main().catch((err) => {
  console.error('❌ xhs-orchestrate failed:', err?.message || String(err));
  process.exit(1);
});
