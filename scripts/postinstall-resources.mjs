#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function shouldSkipAutoPrepare() {
  if (String(process.env.WEBAUTO_SKIP_AUTO_RESOURCES || '').trim() === '1') {
    return { skip: true, reason: 'WEBAUTO_SKIP_AUTO_RESOURCES=1' };
  }
  if (String(process.env.CI || '').trim().toLowerCase() === 'true') {
    return { skip: true, reason: 'CI=true' };
  }
  const force = String(process.env.WEBAUTO_AUTO_RESOURCES || '').trim() === '1';
  if (!force && existsSync(path.join(ROOT, '.git'))) {
    return { skip: true, reason: 'dev_repo_detected' };
  }
  return { skip: false, reason: '' };
}

function runAutoPrepare() {
  const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');
  const ret = spawnSync(process.execPath, [script, '--auto', '--all', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10 * 60 * 1000,
  });
  return ret;
}

function main() {
  const gate = shouldSkipAutoPrepare();
  if (gate.skip) {
    console.log(`[webauto:postinstall] skip auto resource prepare (${gate.reason})`);
    return;
  }

  console.log('[webauto:postinstall] auto preparing resources (camoufox + geoip)...');
  const ret = runAutoPrepare();
  const stdout = String(ret.stdout || '').trim();
  const stderr = String(ret.stderr || '').trim();
  if (stdout) console.log(`[webauto:postinstall] ${stdout}`);
  if (stderr) console.warn(`[webauto:postinstall] ${stderr}`);

  if (ret.status === 0) {
    console.log('[webauto:postinstall] resource prepare done');
    return;
  }

  const strict = String(process.env.WEBAUTO_AUTO_RESOURCES_STRICT || '').trim() === '1';
  const message = `[webauto:postinstall] auto resource prepare failed (exit=${ret.status ?? 'null'}). You can run: webauto deps install --all`;
  if (strict) {
    console.error(message);
    process.exit(ret.status || 1);
  }
  console.warn(message);
}

main();
