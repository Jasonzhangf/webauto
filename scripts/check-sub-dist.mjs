#!/usr/bin/env node
// Check: forbid nested dist directories
//
// Rule: do not allow nested dist/ directories under libs/, modules/, sharedmodule/.
// All compiled outputs must be loaded from repo-root dist/.

import { existsSync } from 'node:fs';

const SUB_DIST_DIRS = [
  'libs/browser/dist',
  'libs/operations-framework/dist',
  'libs/containers/dist',
  'libs/actions-system/dist',
  'libs/ui-recognition/dist',
  'libs/workflows/dist',
  'libs/openai-compatible-providers/dist',
  'modules/browser/dist',
  'modules/workflow-builder/dist',
  'modules/xiaohongshu/dist',
  'modules/controller/dist',
  'modules/container-matcher/dist',
  'modules/session-manager/dist',
  'modules/search-gate/dist',
  'modules/logging/dist',
  'modules/api-usage/dist',
  'modules/ui/dist',
  'modules/operations/dist',
  'modules/graph-engine/dist',
  'modules/dom-branch-fetcher/dist',
  'modules/storage/dist',
  'sharedmodule/operations-framework/dist',
  'sharedmodule/engines/dist',
  'sharedmodule/libraries/dist'
];

console.log('=== Check nested dist/ directories ===\n');

const foundDirs = SUB_DIST_DIRS.filter(dir => existsSync(dir));

if (foundDirs.length > 0) {
  console.error('ERROR: nested dist/ directories are forbidden.');
  console.error('Fix: delete nested dist/ dirs and use repo-root dist/ (build via npm run build:services).\n');
  foundDirs.forEach(d => console.error(`- ${d}`));
  process.exit(1);
}

console.log('OK: no nested dist/ directories found.');
