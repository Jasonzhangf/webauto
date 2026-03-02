import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const BIN = path.join(ROOT, 'bin', 'webauto.mjs');

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('webauto test --help prints test cli usage', () => {
  const ret = run(['test', '--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto test/);
  assert.match(ret.stdout, /--layer/);
  assert.match(ret.stdout, /--output/);
  assert.match(ret.stdout, /--json/);
});

test('webauto --help includes test command', () => {
  const ret = run(['--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto test/);
});
