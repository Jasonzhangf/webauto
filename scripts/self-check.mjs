#!/usr/bin/env node
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
    'apps/floating-panel/build/main/index.js',
    'apps/floating-panel/build/renderer/index.mjs',
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
