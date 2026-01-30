#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TSC_BIN = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const CONFIG = resolve(ROOT, 'tsconfig.services.json');

function main() {
  if (!existsSync(TSC_BIN)) {
    console.error('[build:services] typescript not found. Run npm install first.');
    process.exit(1);
  }
  if (!existsSync(CONFIG)) {
    console.error('[build:services] missing tsconfig.services.json');
    process.exit(1);
  }

  execFileSync(process.execPath, [TSC_BIN, '-p', CONFIG], {
    cwd: ROOT,
    stdio: 'inherit'
  });

  const coreSrc = resolve(ROOT, 'modules', 'core');
  const coreDest = resolve(ROOT, 'dist', 'modules', 'core');
  if (existsSync(coreSrc)) {
    mkdirSync(resolve(ROOT, 'dist', 'modules'), { recursive: true });
    cpSync(coreSrc, coreDest, { recursive: true });
  }

  const controllerSrc = resolve(ROOT, 'services', 'controller', 'src');
  const controllerDest = resolve(ROOT, 'dist', 'services', 'controller', 'src');
  if (existsSync(controllerSrc)) {
    mkdirSync(resolve(ROOT, 'dist', 'services', 'controller'), { recursive: true });
    cpSync(controllerSrc, controllerDest, { recursive: true });
  }
}

main();
