#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

// 轻量自检：仅检查关键目录和配置文件存在，用于 prebuild
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function main() {
  const checks = [
    'config/browser-service.json',
    'config/environments.json',
    'config/ports.json',
    'container-library/index.json',
    'container-library/weibo',
    // prebuild 自检不应依赖构建产物（dist/build），只检查关键源码入口存在
    'apps/floating-panel/src/main/index.mts',
    'apps/floating-panel/src/main/preload.mjs',
    'apps/floating-panel/src/renderer/index.mts',
  ];

  let ok = true;
  for (const rel of checks) {
    if (!exists(rel)) {
      console.error('[self-check] missing:', rel);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log('[self-check] quick prebuild check passed');
}

main();
