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

console.log('[floating-panel] building TypeScript...');
execSync('tsc', { stdio: 'inherit' });

console.log('[floating-panel] copying renderer assets...');
fs.mkdirSync(distRendererDir, { recursive: true });
fs.copyFileSync(path.resolve(process.cwd(), 'src/renderer/index.html'), path.join(distRendererDir, 'index.html'));
fs.copyFileSync(path.resolve(process.cwd(), 'dist/renderer/index.mjs'), path.join(distRendererDir, 'index.mjs'));

console.log('[floating-panel] build complete');
