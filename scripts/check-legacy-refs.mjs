#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['apps', 'bin', 'libs', 'modules', 'runtime', 'services', 'src', 'tests'];
const exts = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.py']);

const patterns = [
  { name: 'legacy-root-config-file', re: /['"`]config\/(?:browser-service\.json|environments\.json|ports(?:-2core)?\.json)/g },
  { name: 'legacy-root-container-library', re: /['"`]container-library\//g },
  { name: 'legacy-root-container-library-json', re: /['"`][^'"`]*container-library\.json/g },
  { name: 'legacy-root-container-index', re: /['"`]container-library\.index\.json/g },
  { name: 'legacy-root-plugins', re: /['"`]plugins\/ocr-macos\//g },
  { name: 'legacy-browser-service-impl-import', re: /['"`][^'"`]*services\/browser-service\/(?!index\.(?:ts|js))/g },
  { name: 'legacy-browser-service-path', re: /['"`][^'"`]*services\/browser-service\//g },
  { name: 'legacy-service-path', re: /['"`][^'"`]*services\/(?:legacy|core-daemon|unified-gate)\//g },
  { name: 'legacy-engine-path', re: /['"`][^'"`]*services\/engines\/(?:orchestrator|container-engine|vision-engine)\//g },
  { name: 'legacy-engine-api-gateway-path', re: /['"`][^'"`]*services\/engines\/api-gateway\//g },
  { name: 'legacy-runtime-path', re: /['"`][^'"`]*runtime\/(?:browser|containers|ui|vision|infra\/node-cli)\//g },
  { name: 'legacy-runtime-local-dev-path', re: /['"`][^'"`]*runtime\/infra\/utils\/(?:local-dev|scripts\/local-dev)\//g },
  { name: 'legacy-runtime-service-tests-path', re: /['"`][^'"`]*runtime\/infra\/utils\/scripts\/service-tests\//g },
  { name: 'legacy-libs-path', re: /['"`][^'"`]*libs\/(?:browser|containers|operations-framework|workflows|actions-system|openai-compatible-providers|ui-recognition|workflows\/temp)\//g },
  { name: 'legacy-modules-browser-path', re: /['"`][^'"`]*modules\/(?:browser|browser-control|camoufox-cli|container-matcher|config|controller|dom-branch-fetcher|graph-engine|operation-selector|search-gate|storage|ui|workflow-builder)\//g },
  { name: 'legacy-modules-core-path', re: /['"`][^'"`]*modules\/core\//g },
  { name: 'legacy-modules-api-usage-path', re: /['"`][^'"`]*modules\/api-usage\//g },
  { name: 'legacy-modules-xhs-legacy-path', re: /['"`][^'"`]*modules\/xiaohongshu\/(?:xhs-camo-adapter|xhs-core|xhs-orchestrator|xhs-orchestrator-v2|xhs-search)\//g },
  { name: 'legacy-apps-webauto-modules-path', re: /['"`][^'"`]*apps\/webauto\/modules\//g },
  { name: 'legacy-apps-webauto-core-workflow-path', re: /['"`][^'"`]*apps\/webauto\/core\/workflow\//g },
  { name: 'legacy-apps-webauto-safe-page-access-manager-path', re: /['"`][^'"`]*apps\/webauto\/core\/SafePageAccessManager\.(?:ts|js)/g },
  { name: 'legacy-apps-webauto-core-nodes-path', re: /['"`][^'"`]*apps\/webauto\/core\/nodes\//g },
  { name: 'legacy-apps-webauto-platforms-path', re: /['"`][^'"`]*apps\/webauto\/platforms\//g },
  { name: 'legacy-apps-webauto-alibaba-analysis-path', re: /['"`][^'"`]*apps\/webauto\/platforms\/alibaba\/analysis\//g },
  { name: 'legacy-api-gateway-browser-adapter-path', re: /['"`][^'"`]*services\/engines\/api-gateway\/lib\/browserAdapter\.(?:ts|js)/g },
  { name: 'legacy-api-gateway-container-resolver-path', re: /['"`][^'"`]*services\/engines\/api-gateway\/lib\/containerResolver\.(?:ts|js)/g },
  { name: 'legacy-register-core-usage-path', re: /['"`][^'"`]*services\/unified-api\/register-core-usage\.(?:ts|js)/g },
  { name: 'legacy-browser-launcher-path', re: /['"`][^'"`]*services\/browser_launcher\.py/g },
  { name: 'legacy-controller-src-shim-path', re: /['"`][^'"`]*services\/controller\/src\/modules\/logging\/src\/index\.js/g },
  { name: 'legacy-routecodex-container-root', re: /\.routecodex\/container-lib|ROUTECODEX_CONTAINER_ROOT/g },
];

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!exts.has(path.extname(entry.name))) continue;
    out.push(abs);
  }
}

const files = [];
for (const rel of scanRoots) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) walk(abs, files);
}

const violations = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    if (!pattern.re.test(text)) continue;
    violations.push(`${rel} -> ${pattern.name}`);
    break;
  }
}

if (violations.length > 0) {
  console.error('[check-legacy-refs] failed');
  for (const line of violations.slice(0, 100)) console.error(` - ${line}`);
  if (violations.length > 100) {
    console.error(` - ... and ${violations.length - 100} more`);
  }
  process.exit(1);
}

console.log('[check-legacy-refs] ok');
