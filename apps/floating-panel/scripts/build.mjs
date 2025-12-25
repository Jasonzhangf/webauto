import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor, patch = '0'] = String(pkg.version || '0.1.0').split('.');
const patchNum = Number(patch) || 0;
const nextVersion = `${major}.${minor}.${String(patchNum + 1).padStart(3, '0')}`;

console.log('[floating-panel] bumping version...');
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`[floating-panel] bumped version to ${pkg.version}`);

const distDir = path.resolve(process.cwd(), 'dist');
const distRendererDir = path.join(distDir, 'renderer');

console.log('[floating-panel] cleaning dist...');
execSync('rm -rf dist', { stdio: 'inherit' });

// 1. 构建 main 进程 (ESM)
console.log('[floating-panel] building main process (ESM)...');
execSync('npx esbuild src/main/index.mts --bundle --platform=node --format=esm --outfile=dist/main/index.mjs --sourcemap --external:electron --external:ws --external:electron-window-state', { stdio: 'inherit' });

// 2. 复制 preload.mjs (全链路 ESM)
const preloadDir = path.join(distDir, 'main');
fs.mkdirSync(preloadDir, { recursive: true });
fs.copyFileSync(path.resolve(process.cwd(), 'src/main/preload.mjs'), path.join(preloadDir, 'preload.mjs'));

// 3. 先构建 renderer (ESM) - 这会生成 index.js
console.log('[floating-panel] building renderer process (ESM)...');
execSync('npx esbuild src/renderer/index.mts --bundle --platform=browser --format=esm --outfile=dist/renderer/index.js --sourcemap --target=es2022', { stdio: 'inherit' });

// 4. 构建诊断模块 (ESM)
console.log('[floating-panel] building diag module (ESM)...');
execSync('npx esbuild src/renderer/diag.ts --bundle --platform=browser --format=esm --outfile=dist/renderer/diag.js --sourcemap --target=es2022', { stdio: 'inherit' });

// 5. 复制静态 JS 文件 (这些已经存在)
console.log('[floating-panel] copying static JS files...');
fs.mkdirSync(distRendererDir, { recursive: true });
fs.copyFileSync(path.resolve(process.cwd(), 'src/renderer/drag.mjs'), path.join(distRendererDir, 'drag.mjs'));
fs.copyFileSync(path.resolve(process.cwd(), 'src/renderer/graph.mjs'), path.join(distRendererDir, 'graph.mjs'));

// 6. 复制 HTML
console.log('[floating-panel] copying renderer assets...');
fs.mkdirSync(distRendererDir, { recursive: true });
fs.copyFileSync(path.resolve(process.cwd(), 'src/renderer/index.html'), path.join(distRendererDir, 'index.html'));

console.log('[floating-panel] build complete (fixed order)');
