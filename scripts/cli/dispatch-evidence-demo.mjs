#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { createRunId, EvidenceCollector } from '../templates/evidence-template.mjs';

ensureUtf8Console();

async function main() {
  const runId = createRunId('dispatch-demo');
  const baseDir = `${process.env.HOME}/.webauto/evidence/dispatch-demo/debug/${runId}`;
  const collector = new EvidenceCollector(runId, baseDir);

  collector.addStep({ id: 'dispatch-start', status: 'success' });
  await new Promise(r => setTimeout(r, 300));
  collector.addStep({ id: 'dispatch-end', status: 'success' });

  await collector.finalize(true, null);
}

main();
