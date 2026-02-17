#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsRoot = path.join(root, 'docs');

const patterns = [
  { name: 'legacy-api-gateway-path', re: /services\/engines\/api-gateway\//g },
  { name: 'legacy-core-workflow-path', re: /apps\/webauto\/core\/workflow\//g },
  { name: 'legacy-start-workflow-api-script', re: /start:workflow-api/g },
  { name: 'legacy-sharedmodule-path', re: /sharedmodule\//g },
  { name: 'legacy-floating-panel-path', re: /apps\/floating-panel\//g },
  { name: 'legacy-container-engine-path', re: /services\/engines\/container-engine\//g },
  { name: 'legacy-vision-engine-path', re: /services\/engines\/vision-engine\//g },
  { name: 'legacy-dist-sharedmodule-path', re: /dist\/sharedmodule\//g },
  { name: 'legacy-workflow-api-pid', re: /workflow-api\.pid/g },
];

function walkDocs(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDocs(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() !== '.md') continue;
    out.push(abs);
  }
}

if (!fs.existsSync(docsRoot)) {
  console.log('[check-docs-legacy] docs directory missing, skip');
  process.exit(0);
}

const files = [];
walkDocs(docsRoot, files);

const violations = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    if (!pattern.re.test(text)) continue;
    violations.push(`${rel} -> ${pattern.name}`);
    break;
  }
}

if (violations.length > 0) {
  console.error('[check-docs-legacy] failed');
  for (const line of violations.slice(0, 100)) {
    console.error(` - ${line}`);
  }
  if (violations.length > 100) {
    console.error(` - ... and ${violations.length - 100} more`);
  }
  process.exit(1);
}

console.log('[check-docs-legacy] ok');
