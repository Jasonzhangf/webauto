#!/usr/bin/env node
/**
 * Migrate legacy container-system/platforms/<site>/ to containers/staging/<mappedSite>/
 * Uses containers/catalog.json to map 'weibo' => 'weibo.com' etc.
 * Usage:
 *   node scripts/migrate-containers-to-staging.cjs --site weibo
 */
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--site') out.site = args[++i];
  }
  if (!out.site) {
    console.error('Usage: --site <site>');
    process.exit(1);
  }
  return out;
}

function loadCatalog() {
  const fp = path.join(process.cwd(), 'containers', 'catalog.json');
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function mapSite(site, catalog) {
  const entry = catalog?.sites?.[site];
  if (entry?.preferredFolder) return entry.preferredFolder;
  return site; // fallback
}

function copyIfMissing(src, dst) {
  if (!fs.existsSync(src)) return;
  const stat = fs.lstatSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyIfMissing(path.join(src, name), path.join(dst, name));
    }
  } else if (stat.isFile()) {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      process.stdout.write(`copied: ${dst}\n`);
    }
  }
}

function main() {
  const { site } = parseArgs();
  const catalog = loadCatalog();
  const targetSiteFolder = mapSite(site, catalog);
  const srcRoot = path.join(process.cwd(), 'container-system', 'platforms', site);
  const dstRoot = path.join(process.cwd(), 'containers', 'staging', targetSiteFolder);

  if (!fs.existsSync(srcRoot)) {
    console.error('legacy source not found:', srcRoot);
    process.exit(2);
  }
  fs.mkdirSync(dstRoot, { recursive: true });
  copyIfMissing(srcRoot, dstRoot);
  console.log('Migration to staging completed for site:', site, '→', targetSiteFolder);
}

if (require.main === module) main();

