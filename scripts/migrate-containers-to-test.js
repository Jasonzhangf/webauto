#!/usr/bin/env node
/**
 * Migrate legacy container-system/platforms/<site>/ to containers/test/<site>/
 * - Preserves directory structure
 * - Copies files if target doesn't exist
 * - Optionally can regenerate index.json (TODO)
 */

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(process.cwd(), 'container-system', 'platforms');
const DST_ROOT = path.join(process.cwd(), 'containers', 'test');

function copyIfMissing(src, dst) {
  if (!fs.existsSync(src)) return;
  if (fs.lstatSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyIfMissing(path.join(src, name), path.join(dst, name));
    }
  } else {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      process.stdout.write(`copied: ${dst}\n`);
    }
  }
}

function main() {
  if (!fs.existsSync(SRC_ROOT)) {
    console.error('legacy source not found:', SRC_ROOT);
    process.exit(1);
  }
  fs.mkdirSync(DST_ROOT, { recursive: true });
  for (const site of fs.readdirSync(SRC_ROOT)) {
    const srcSite = path.join(SRC_ROOT, site);
    if (!fs.lstatSync(srcSite).isDirectory()) continue;
    const dstSite = path.join(DST_ROOT, site);
    copyIfMissing(srcSite, dstSite);
  }
  console.log('Migration scan complete.');
}

if (require.main === module) main();

