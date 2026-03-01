#!/usr/bin/env node
import minimist from 'minimist';
import { runUnified } from './lib/xhs-unified-runner.mjs';
import { resolveXhsUnifiedOrchestratePlan } from './lib/xhs-unified-stages.mjs';

async function main() {
  const argv = minimist(process.argv.slice(2));
  const mode = String(argv.mode || 'phase1-phase2-unified').trim().toLowerCase();
  const plan = resolveXhsUnifiedOrchestratePlan(mode);
  if (plan.action === 'skip') {
    console.log(JSON.stringify({ event: 'xhs.orchestrate.skip', mode, reason: plan.reason }));
    return;
  }
  await runUnified(argv, plan.overrides);
}

main().catch((err) => {
  console.error('❌ xhs-orchestrate failed:', err?.message || String(err));
  process.exit(1);
});
