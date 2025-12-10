import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..', '..');
const DIST_ENTRY = path.join(projectRoot, 'dist/services/browser-service/index.js');
const SERVICE_SRC_DIRS = [
  path.join(projectRoot, 'services/browser-service'),
  path.join(projectRoot, 'modules/container-matcher'),
];

function latestMtime(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return stat.mtimeMs;
    }
    const entries = fs.readdirSync(targetPath);
    let latest = stat.mtimeMs;
    for (const entry of entries) {
      latest = Math.max(latest, latestMtime(path.join(targetPath, entry)));
    }
    return latest;
  } catch {
    return 0;
  }
}

export function browserServiceDistEntry() {
  return DIST_ENTRY;
}

export function browserServiceNeedsRebuild() {
  if (!fs.existsSync(DIST_ENTRY)) {
    return true;
  }
  const distMtime = latestMtime(DIST_ENTRY);
  return SERVICE_SRC_DIRS.some((dir) => latestMtime(dir) > distMtime);
}

export function ensureBrowserServiceBuild(label = 'browser-service') {
  if (!browserServiceNeedsRebuild()) {
    return false;
  }
  console.log(`[${label}] 源码发生变化，执行 npm run build:services`);
  execSync('npm run build:services', { stdio: 'inherit', cwd: projectRoot });
  return true;
}
