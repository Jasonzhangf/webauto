#!/usr/bin/env node
/**
 * Generate index.json for containers/<tier>/<site>
 * Usage:
 *   node scripts/generate-index.cjs --site weibo --tier test
 */
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--site') out.site = args[++i];
    else if (a === '--tier') out.tier = args[++i];
  }
  if (!out.site) {
    console.error('Usage: --site <site> [--tier test|validated]');
    process.exit(1);
  }
  if (!out.tier) out.tier = 'test';
  return out;
}

function listJsonFiles(rootDir) {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith('.json')) out.push(p);
    }
  }
  walk(rootDir);
  return out;
}

function buildIndex(siteRoot, site) {
  const files = listJsonFiles(siteRoot)
    .filter(f => !f.endsWith('index.json'));
  const containers = [];
  const byType = {};
  const byPriority = {};
  const byName = {};

  for (const abs of files) {
    try {
      const rel = path.relative(siteRoot, abs).replace(/\\/g, '/');
      const txt = fs.readFileSync(abs, 'utf8');
      const json = JSON.parse(txt);
      const id = json.id || path.basename(rel, '.json');
      const selector = json.selector || '';
      const type = json.type || 'container';
      const name = json.name || id;
      const prio = String(json.priority != null ? json.priority : 999);

      containers.push({ id, fileName: rel, selector });
      byType[type] = byType[type] || [];
      byType[type].push(id);
      byPriority[prio] = byPriority[prio] || [];
      byPriority[prio].push(id);
      byName[id] = id;
      if (name && name !== id) byName[name] = id;
    } catch (e) {
      console.warn('skip invalid json:', abs, e.message);
    }
  }

  const index = {
    website: site,
    generatedAt: new Date().toISOString(),
    containerCount: containers.length,
    containers,
    searchIndex: {
      byType,
      byPriority,
      byName
    }
  };
  return index;
}

function main() {
  const { site, tier } = parseArgs();
  const siteRoot = path.join(process.cwd(), 'containers', tier, site);
  if (!fs.existsSync(siteRoot)) {
    console.error('site root not found:', siteRoot);
    process.exit(2);
  }
  const index = buildIndex(siteRoot, site);
  const outPath = path.join(siteRoot, 'index.json');
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  console.log('index generated:', outPath);
}

if (require.main === module) main();

