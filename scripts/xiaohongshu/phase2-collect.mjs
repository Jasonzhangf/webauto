#!/usr/bin/env node
import minimist from 'minimist';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCollectedLinksCount } from '../../apps/webauto/entry/lib/xhs-collect-verify.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'webauto.mjs');
if (!process.env.CAMO_CONTAINER_LIBRARY_ROOT) {
  process.env.CAMO_CONTAINER_LIBRARY_ROOT = path.join(REPO_ROOT, 'apps', 'webauto', 'resources', 'container-library');
}

function runCollectViaCli(argv = []) {
  return new Promise((resolve) => {
    const args = ['xhs', 'collect', ...argv];
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve({ ok: code === 0, code: code ?? 0 }));
  });
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    await runCollectViaCli(process.argv.slice(2));
    return;
  }
  if (!process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT) {
    process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT = '1';
  }
  const ret = await runCollectViaCli(process.argv.slice(2));
  if (!ret.ok) {
    throw new Error(`phase2-collect failed with exit code ${ret.code}`);
  }
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
