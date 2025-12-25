const path = require('node:path');
const { spawnSync } = require('node:child_process');

const preloadPath = process.env.PRELOAD_PATH || path.join(__dirname, '../dist/main/preload.mjs');
const result = spawnSync('npx', ['electron', 'scripts/test-preload.mjs'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PRELOAD_PATH: preloadPath },
  stdio: 'inherit'
});
process.exit(result.status || 0);
