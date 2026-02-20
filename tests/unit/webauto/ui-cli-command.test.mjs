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

test('webauto ui cli --help prints ui cli usage', () => {
  const ret = run(['ui', 'cli', '--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto ui cli/);
  assert.match(ret.stdout, /click --selector/);
  assert.match(ret.stdout, /full-cover/);
  assert.match(ret.stdout, /probe/);
  assert.match(ret.stdout, /--detailed/);
  assert.match(ret.stdout, /text_contains\|text_equals\|value_equals\|not_disabled/);
});

test('webauto ui --help includes ui cli actions', () => {
  const ret = run(['ui', '--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto ui cli/);
  assert.match(ret.stdout, /status/);
});
