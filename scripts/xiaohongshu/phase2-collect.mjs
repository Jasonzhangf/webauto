#!/usr/bin/env node
import minimist from 'minimist';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runXhsCollect, getCollectHelpLines } from '../../apps/webauto/entry/lib/xhs-collect-runner.mjs';
import { readCollectedLinksCount } from '../../apps/webauto/entry/lib/xhs-collect-verify.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
if (!process.env.CAMO_CONTAINER_LIBRARY_ROOT) {
  process.env.CAMO_CONTAINER_LIBRARY_ROOT = path.join(REPO_ROOT, 'apps', 'webauto', 'resources', 'container-library');
}

function printHelp() {
  console.log(getCollectHelpLines().join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printHelp();
    return;
  }
  if (!process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT) {
    process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT = '1';
  }
  await runXhsCollect(argv);
  await verifyPersistedCollectCount(argv);
}

export async function verifyPersistedCollectCount(argv = {}) {
  const targetRaw = argv.target ?? argv['max-notes'];
  const target = Number.isFinite(Number(targetRaw))
    ? Math.max(0, Math.floor(Number(targetRaw)))
    : 0;
  if (target <= 0) return null;

  const keyword = String(argv.keyword || argv.k || '').trim();
  const env = String(argv.env || 'prod').trim() || 'prod';
  const outputRoot = String(argv['output-root'] || argv.outputRoot || '').trim() || undefined;
  const { linksPath, count } = await readCollectedLinksCount({
    keyword,
    env,
    outputRoot,
  });
  const persistPath = linksPath;
  if (count !== target) {
    const details = {
      expected: target,
      actual: count,
      persistPath,
    };
    console.error(JSON.stringify({ event: 'xhs.collect.persist_count_mismatch', ...details }));
    const err = new Error(
      `COLLECT_COUNT_MISMATCH expected=${target} actual=${count} persistPath=${persistPath}`
    );
    err.code = 'COLLECT_COUNT_MISMATCH';
    err.details = details;
    throw err;
  }
  return {
    expected: target,
    actual: count,
    persistPath,
  };
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ phase2-collect failed:', err?.message || String(err));
    process.exit(1);
  });
}
