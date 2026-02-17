#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const postBuild = args.has('--post-build');
const fix = args.has('--fix');

const requiredFiles = [
  'package.json',
  'apps/webauto/server.ts',
  'apps/webauto/entry/xhs-unified.mjs',
  'modules/camo-runtime/src/autoscript/runtime.mjs',
  'modules/camo-runtime/src/container/runtime-core/index.mjs',
];

const errors = [];
for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    errors.push(`missing required file: ${rel}`);
  }
}

const nodeMajor = Number(process.versions.node.split('.')[0] || 0);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  errors.push(`node >= 20 is required, current=${process.versions.node}`);
}

if (fix) {
  // Reserved for future autofix hooks.
  console.log('[self-check] --fix requested, no autofix rules registered');
}

if (errors.length > 0) {
  console.error('[self-check] failed');
  for (const line of errors) console.error(` - ${line}`);
  process.exit(1);
}

const mode = postBuild ? 'post-build' : quick ? 'quick' : 'full';
console.log(`[self-check] ${mode} ok`);
