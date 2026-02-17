#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const required = [
  'apps/webauto/resources/config',
  'apps/webauto/resources/container-library',
  'apps/webauto/resources/container-library.index.json',
];

const forbiddenAtRoot = [
  'config',
  'container-library',
  'container-library.json',
  'container-library.index.json',
  'libs',
  'plugins',
  'sharedmodule',
];

const forbiddenAtServices = [
  'browser-service',
  'legacy',
  'core-daemon',
  'unified-gate',
  'engines/api-gateway',
  'engines/orchestrator',
  'engines/container-engine',
  'engines/vision-engine',
];

const forbiddenAtRuntime = [
  'browser',
  'containers',
  'ui',
  'vision',
  'infra/node-cli',
  'infra/utils/local-dev',
  'infra/utils/scripts/local-dev',
  'infra/utils/scripts/service-tests',
];

const forbiddenAtLibs = [
  'workflows',
  'operations-framework',
  'containers',
  'browser',
  'actions-system',
  'openai-compatible-providers',
  'ui-recognition',
  'workflows/temp',
];

const forbiddenAtModules = [
  'api-usage',
  'browser',
  'browser-control',
  'camoufox-cli',
  'container-matcher',
  'config',
  'core',
  'controller',
  'dom-branch-fetcher',
  'graph-engine',
  'operation-selector',
  'search-gate',
  'storage',
  'ui',
  'workflow-builder',
  'xiaohongshu/xhs-camo-adapter',
  'xiaohongshu/xhs-core',
  'xiaohongshu/xhs-orchestrator',
  'xiaohongshu/xhs-orchestrator-v2',
  'xiaohongshu/xhs-search',
];

const forbiddenAtAppsWebauto = [
  'core',
  'modules',
  'platforms',
  'core/nodes',
];

const forbiddenFiles = [
  'services/browser_launcher.py',
  'services/unified-api/register-core-usage.ts',
  'modules/container-registry/src/index.js',
  'modules/container-registry/src/index.js.map',
  'modules/container-registry/src/index.d.ts',
  'modules/container-registry/src/index.d.ts.map',
  'modules/container-registry/src/cli.ts',
  'modules/camo-backend/src/internal/fixture-session.ts',
  'modules/xiaohongshu/app/src/blocks/MatchCommentsBlock.ts-e',
  'services/controller/src/controller.d.ts',
  'services/controller/src/debug-shim.d.ts',
  'services/controller/src/modules/logging/src/index.js',
  'runtime/infra/utils/scripts/simple-test.mjs',
  'runtime/infra/utils/scripts/anti-detection.mjs',
  'runtime/infra/utils/scripts/service/kill-browsers.mjs',
  'runtime/infra/utils/scripts/service/quick-start.mjs',
  'runtime/infra/utils/scripts/service/restart-api.mjs',
  'services/engines/api-gateway/lib/browserAdapter.ts',
  'services/engines/api-gateway/lib/containerResolver.ts',
];

const errors = [];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    errors.push(`required path missing: ${rel}`);
  }
}

for (const rel of forbiddenAtRoot) {
  if (fs.existsSync(path.join(root, rel))) {
    errors.push(`legacy root path still exists: ${rel}`);
  }
}

for (const rel of forbiddenAtServices) {
  if (fs.existsSync(path.join(root, 'services', rel))) {
    errors.push(`legacy service path still exists: services/${rel}`);
  }
}

for (const rel of forbiddenAtRuntime) {
  if (fs.existsSync(path.join(root, 'runtime', rel))) {
    errors.push(`legacy runtime path still exists: runtime/${rel}`);
  }
}

for (const rel of forbiddenAtLibs) {
  if (fs.existsSync(path.join(root, 'libs', rel))) {
    errors.push(`legacy libs path still exists: libs/${rel}`);
  }
}

for (const rel of forbiddenAtModules) {
  if (fs.existsSync(path.join(root, 'modules', rel))) {
    errors.push(`legacy modules path still exists: modules/${rel}`);
  }
}

for (const rel of forbiddenAtAppsWebauto) {
  if (fs.existsSync(path.join(root, 'apps', 'webauto', rel))) {
    errors.push(`legacy app path still exists: apps/webauto/${rel}`);
  }
}

for (const rel of forbiddenFiles) {
  if (fs.existsSync(path.join(root, rel))) {
    errors.push(`legacy file still exists: ${rel}`);
  }
}

if (errors.length > 0) {
  console.error('[check-root-layout] failed');
  for (const line of errors) console.error(` - ${line}`);
  process.exit(1);
}

console.log('[check-root-layout] ok');
