#!/usr/bin/env node
/**
 * Migrate a single container file from legacy container-system to containers/<tier>/ structure.
 * Usage:
 *   node scripts/migrate-one-container.js --site weibo --path containers/comment-containers/comment_c989e3db_container.json --tier test
 */
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--site') out.site = args[++i];
    else if (a === '--path') out.subPath = args[++i];
    else if (a === '--tier') out.tier = args[++i];
  }
  if (!out.site || !out.subPath) {
    console.error('Usage: --site <site> --path <relative path under site> [--tier test|validated]');
    process.exit(1);
  }
  if (!out.tier) out.tier = 'test';
  return out;
}

function main() {
  const { site, subPath, tier } = parseArgs();
  const src = path.join(process.cwd(), 'container-system', 'platforms', site, subPath);
  const dst = path.join(process.cwd(), 'containers', tier, site, subPath);

  if (!fs.existsSync(src)) {
    console.error('Source not found:', src);
    process.exit(2);
  }
  const txt = fs.readFileSync(src, 'utf8');
  try {
    JSON.parse(txt);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(3);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('Migrated one container to:', dst);
}

if (require.main === module) main();
