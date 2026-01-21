#!/usr/bin/env node
/**
 * macOS Dev Install (minimal)
 * - Build dist artifacts
 * - Build + install OCR plugin to ~/.webauto/bin
 *
 * This is NOT a full "App installer". It prepares a mac dev machine for running workflows.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')} (code=${res.status})`);
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('[install-macos] only supported on macOS (darwin)');
    process.exit(2);
  }

  console.log('[install-macos] build:services');
  run('npm', ['run', '-s', 'build:services']);

  console.log('[install-macos] build + install OCR plugin');
  run(process.execPath, [path.join('scripts', 'build', 'build-ocr-macos.mjs'), '--install']);

  const binDir = path.join(os.homedir(), '.webauto', 'bin');
  console.log('');
  console.log('[install-macos] done');
  console.log(`- OCR plugin: ${path.join(binDir, 'webauto-ocr-macos')}`);
  console.log('- If needed: export WEBAUTO_OCR_BIN=... (see docs/arch/OCR_MACOS_PLUGIN.md)');
}

main();

