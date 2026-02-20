import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = process.cwd();
const distDir = path.join(appRoot, 'dist');
const distMainDir = path.join(distDir, 'main');
const distRendererDir = path.join(distDir, 'renderer');

console.log('[desktop-console] ensuring dependencies...');
const nodeModulesDir = path.join(appRoot, 'node_modules');
if (!fs.existsSync(nodeModulesDir)) {
  execSync('npm ci', { stdio: 'inherit', cwd: appRoot });
}

console.log('[desktop-console] cleaning dist...');
try {
  fs.rmSync(distDir, { recursive: true, force: true });
} catch {
  // ignore
}

console.log('[desktop-console] building main process (ESM)...');
execSync(
  'npx esbuild src/main/index.mts --bundle --platform=node --format=esm --outfile=dist/main/index.mjs --sourcemap --external:electron --external:ws --loader:.ts=ts',
  { stdio: 'inherit' },
);

console.log('[desktop-console] copying preload (ESM)...');
fs.mkdirSync(distMainDir, { recursive: true });
fs.copyFileSync(path.join(appRoot, 'src/main/preload.mjs'), path.join(distMainDir, 'preload.mjs'));

console.log('[desktop-console] building renderer (ESM)...');
execSync(
  'npx esbuild src/renderer/index.mts --bundle --platform=browser --format=esm --outfile=dist/renderer/index.js --sourcemap --target=es2022',
  { stdio: 'inherit' },
);

console.log('[desktop-console] copying renderer assets...');
fs.mkdirSync(distRendererDir, { recursive: true });
fs.copyFileSync(path.join(appRoot, 'src/renderer/index.html'), path.join(distRendererDir, 'index.html'));
fs.copyFileSync(path.join(appRoot, 'src/renderer/tabs/run.mts'), path.join(distRendererDir, 'run.mts'));

console.log('[desktop-console] build complete');
