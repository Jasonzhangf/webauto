const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor, patch = '0'] = String(pkg.version || '0.1.0').split('.');
const patchNum = Number(patch) || 0;
const nextVersion = `${major}.${minor}.${String(patchNum + 1).padStart(3, '0')}`;

const distDir = path.resolve(process.cwd(), 'dist');
const distMain = path.join(distDir, 'main');
const distRenderer = path.join(distDir, 'renderer');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log('[floating-panel] cleaning dist...');
fs.rmSync(distDir, { recursive: true, force: true });

console.log('[floating-panel] copying main/preload...');
copyFile(path.join(process.cwd(), 'src/main/index.cjs'), path.join(distMain, 'index.cjs'));
copyFile(path.join(process.cwd(), 'src/main/preload.cjs'), path.join(distMain, 'preload.cjs'));

console.log('[floating-panel] copying renderer assets...');
copyFile(path.join(process.cwd(), 'src/renderer/index.html'), path.join(distRenderer, 'index.html'));
copyFile(path.join(process.cwd(), 'src/renderer/index.js'), path.join(distRenderer, 'index.js'));

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`[floating-panel] bump version to ${pkg.version}`);
console.log('[floating-panel] build complete');
