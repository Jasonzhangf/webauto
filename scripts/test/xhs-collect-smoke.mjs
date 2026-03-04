#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BIN = path.join(ROOT, 'bin', 'webauto.mjs');

function runCollect() {
  return new Promise((resolve) => {
    const args = ['xhs', 'collect'];

    const profile = String(process.env.WEBAUTO_TEST_PROFILE || '').trim();
    if (profile) args.push('--profile', profile);

    const keyword = String(process.env.WEBAUTO_TEST_KEYWORD || '').trim();
    if (keyword) args.push('--keyword', keyword);

    const target = String(process.env.WEBAUTO_TEST_TARGET || '').trim();
    if (target) args.push('--max-notes', target);


    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      resolve({ ok: code === 0, code });
    });
  });
}

const ret = await runCollect();
if (!ret.ok) {
  console.error(`[xhs-collect-smoke] failed with exit code ${ret.code}`);
  process.exit(1);
}
console.log('[xhs-collect-smoke] ok');
