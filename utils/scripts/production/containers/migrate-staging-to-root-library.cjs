#!/usr/bin/env node
/**
 * 将 libs/containers/staging 下的旧容器库迁移到根目录 container-library.json
 *
 * 目标：
 * - 统一到 Python / BrowserService / UI 使用的 container-library.json 新格式；
 * - 尽量保留原有 libs/containers/staging 中的容器定义（id / name / children / operations）；
 * - 对 1688 使用现有站点 key "cbu"，避免产生多个相同 website 的条目。
 *
 * 说明：
 * - 仅做“增量合并”：如果 container-library.json 中已经存在同名 id，则保留现有定义并跳过旧容器。
 * - selector 映射策略：使用 v2 容器 schema 中的第一个 selectors[*].classes，
 *   例如 ["ali-search-box"] → ".ali-search-box"。
 * - actions 映射策略：旧容器 operations[*].type 中：
 *   - click → actions.click = true
 *   - type  → actions.type  = true
 *
 * 用法示例：
 *   node utils/scripts/production/containers/migrate-staging-to-root-library.cjs
 *   node utils/scripts/production/containers/migrate-staging-to-root-library.cjs --site-folder 1688.com
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--site-folder') {
      out.siteFolder = args[++i];
    }
  }
  return out;
}

function loadJsonSafe(fp, fallback) {
  if (!fs.existsSync(fp)) return fallback;
  try {
    const txt = fs.readFileSync(fp, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.warn('⚠️ 无法解析 JSON:', fp, e.message);
    return fallback;
  }
}

function saveJsonPretty(fp, obj) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), 'utf8');
}

function ensureSiteEntry(registry, website, preferredKey) {
  let siteKey = null;
  for (const [key, value] of Object.entries(registry)) {
    if (value && typeof value === 'object' && String(value.website || '').toLowerCase() === website.toLowerCase()) {
      siteKey = key;
      break;
    }
  }
  if (!siteKey) {
    siteKey = preferredKey || website.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!registry[siteKey]) {
      registry[siteKey] = { website, containers: {} };
    }
  }
  if (!registry[siteKey].containers) {
    registry[siteKey].containers = {};
  }
  return siteKey;
}

function classesToSelector(classes) {
  if (!Array.isArray(classes) || !classes.length) return '';
  const safe = classes
    .map(c => String(c || '').trim())
    .filter(Boolean);
  if (!safe.length) return '';
  return safe.map(c => '.' + c.replace(/([^a-zA-Z0-9_-])/g, '\\$1')).join('');
}

function mapOperationsToActions(ops) {
  const actions = {};
  if (!Array.isArray(ops)) return null;
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const t = String(op.type || '').toLowerCase();
    if (t === 'click') actions.click = true;
    if (t === 'type') actions.type = true;
  }
  return Object.keys(actions).length ? actions : null;
}

function migrateSite(stagingRoot, siteFolder, registry) {
  const website = siteFolder; // libs/containers/staging/<website>/containers/*.json
  const siteDir = path.join(stagingRoot, siteFolder, 'containers');
  if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) {
    console.warn('⚠️ 跳过站点（未找到 containers 目录）:', siteDir);
    return;
  }

  // 针对 1688 显式使用 "cbu" 作为 site key，其他站点使用默认规则
  const preferredKey = website === '1688.com' ? 'cbu' : undefined;
  const siteKey = ensureSiteEntry(registry, website, preferredKey);
  const containers = registry[siteKey].containers || (registry[siteKey].containers = {});

  const files = fs.readdirSync(siteDir).filter(f => f.endsWith('.json'));
  let added = 0;
  let skipped = 0;

  for (const file of files) {
    const fp = path.join(siteDir, file);
    const data = loadJsonSafe(fp, null);
    if (!data || typeof data !== 'object') {
      continue;
    }

    const id = data.id || path.basename(file, '.json');
    if (!id) {
      console.warn('⚠️ 容器缺少 id，跳过:', fp);
      continue;
    }

    if (containers[id]) {
      skipped++;
      continue;
    }

    const selectorCandidate =
      (Array.isArray(data.selectors) && data.selectors.length && classesToSelector(data.selectors[0].classes)) ||
      '';

    if (!selectorCandidate) {
      // 没有可用 selector 的容器先跳过，避免污染库
      skipped++;
      continue;
    }

    const entry = {
      selector: selectorCandidate,
      description: data.name || id
    };

    if (Array.isArray(data.children) && data.children.length) {
      entry.children = data.children.slice();
    }

    const actions = mapOperationsToActions(data.operations);
    if (actions) {
      entry.actions = actions;
    }

    containers[id] = entry;
    added++;
  }

  console.log(
    `✅ 站点 ${website} (${siteKey}) 迁移完成：新增 ${added} 个容器，跳过 ${skipped} 个（已存在或无有效 selector）`
  );
}

function main() {
  const args = parseArgs();
  const projectRoot = process.cwd();
  const stagingRoot = path.join(projectRoot, 'libs', 'containers', 'staging');
  const rootLibPath = path.join(projectRoot, 'container-library.json');

  if (!fs.existsSync(stagingRoot)) {
    console.error('❌ 未找到 libs/containers/staging 目录：', stagingRoot);
    process.exit(1);
  }

  const registry = loadJsonSafe(rootLibPath, {});

  if (args.siteFolder) {
    migrateSite(stagingRoot, args.siteFolder, registry);
  } else {
    const sites = fs
      .readdirSync(stagingRoot)
      .filter(name => fs.statSync(path.join(stagingRoot, name)).isDirectory());
    if (!sites.length) {
      console.warn('⚠️ staging 目录下没有站点子目录:', stagingRoot);
    }
    for (const siteFolder of sites) {
      migrateSite(stagingRoot, siteFolder, registry);
    }
  }

  saveJsonPretty(rootLibPath, registry);
  console.log('💾 已写入统一容器库:', rootLibPath);
}

if (require.main === module) main();

