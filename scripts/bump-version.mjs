#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ROOT_PACKAGE = path.join(ROOT, 'package.json');
const DESKTOP_PACKAGE = path.join(ROOT, 'apps', 'desktop-console', 'package.json');
const ROOT_LOCK = path.join(ROOT, 'package-lock.json');

function usage(exitCode = 0) {
  console.log(`Usage:
  node scripts/bump-version.mjs [patch|minor|major] [--json]

Examples:
  node scripts/bump-version.mjs
  node scripts/bump-version.mjs patch
  node scripts/bump-version.mjs minor --json`);
  process.exit(exitCode);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, json) {
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

function bumpSemver(version, kind) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (kind === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function updatePackageVersion(filePath, nextVersion) {
  const json = readJson(filePath);
  const prev = String(json.version || '').trim();
  if (!prev) throw new Error(`missing version in ${filePath}`);
  json.version = nextVersion;
  writeJson(filePath, json);
  return prev;
}

function updateRootLockVersion(filePath, nextVersion) {
  if (!existsSync(filePath)) return false;
  const lock = readJson(filePath);
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  writeJson(filePath, lock);
  return true;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) usage(0);

  const jsonMode = argv.includes('--json');
  const kindArg = argv.find((arg) => !arg.startsWith('-')) || 'patch';
  const kind = String(kindArg || 'patch').trim().toLowerCase();
  if (!['patch', 'minor', 'major'].includes(kind)) {
    console.error(`[version] unsupported bump type: ${kind}`);
    usage(2);
  }

  const rootPkg = readJson(ROOT_PACKAGE);
  const prevRootVersion = String(rootPkg.version || '').trim();
  if (!prevRootVersion) {
    throw new Error(`missing version in ${ROOT_PACKAGE}`);
  }
  const nextVersion = bumpSemver(prevRootVersion, kind);

  const prevDesktopVersion = updatePackageVersion(DESKTOP_PACKAGE, nextVersion);
  const prevVersion = updatePackageVersion(ROOT_PACKAGE, nextVersion);
  const lockUpdated = updateRootLockVersion(ROOT_LOCK, nextVersion);

  const result = {
    ok: true,
    kind,
    previous: prevVersion,
    next: nextVersion,
    desktopPrevious: prevDesktopVersion,
    desktopNext: nextVersion,
    lockUpdated,
    files: [
      ROOT_PACKAGE,
      DESKTOP_PACKAGE,
      ...(lockUpdated ? [ROOT_LOCK] : []),
    ],
  };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`[version] bump ${kind}: ${prevVersion} -> ${nextVersion}`);
  console.log(`[version] updated: ${ROOT_PACKAGE}`);
  console.log(`[version] updated: ${DESKTOP_PACKAGE}`);
  if (lockUpdated) console.log(`[version] updated: ${ROOT_LOCK}`);
}

main();
