import { readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const SERVICES_DIR = join(ROOT, 'services');
const TEST_EXTS = new Set(['.test.ts', '.test.mts']);

async function collectTests(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTests(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    for (const ext of TEST_EXTS) {
      if (entry.name.endsWith(ext)) {
        out.push(full);
        break;
      }
    }
  }
}

async function main() {
  if (!statSync(SERVICES_DIR, { throwIfNoEntry: false })) {
    console.log('[test:services:unit] services/ not found, skipping');
    return;
  }
  const tests = [];
  await collectTests(SERVICES_DIR, tests);
  if (tests.length === 0) {
    console.log('[test:services:unit] no tests found, skipping');
    return;
  }

  const tsxBin = process.platform === 'win32'
    ? join(ROOT, 'node_modules', '.bin', 'tsx.cmd')
    : join(ROOT, 'node_modules', '.bin', 'tsx');
  const cmd = existsSync(tsxBin)
    ? tsxBin
    : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  let failed = false;
  for (const testFile of tests) {
    if (failed) break;
    await new Promise((resolve) => {
      const args = cmd === tsxBin
        ? ['--test', testFile]
        : ['tsx', '--test', testFile];
      let spawnCmd = cmd;
      let spawnArgs = args;
      if (process.platform === 'win32' && /\.cmd$|\.bat$/i.test(cmd)) {
        const quoted = /\s/.test(cmd) ? `"${cmd}"` : cmd;
        spawnCmd = 'cmd.exe';
        spawnArgs = ['/d', '/s', '/c', quoted, ...args];
      }
      const child = spawn(spawnCmd, spawnArgs, { stdio: 'inherit' });
      child.on('exit', (code) => {
        if ((code ?? 1) !== 0) failed = true;
        resolve(null);
      });
    });
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[test:services:unit] failed:', err?.message || String(err));
  process.exit(1);
});
