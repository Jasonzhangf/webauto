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

test('webauto --help prints main help', () => {
  const ret = run(['--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto CLI/);
  assert.match(ret.stdout, /webauto xhs/);
  assert.match(ret.stdout, /webauto schedule/);
  assert.match(ret.stdout, /webauto account/);
  assert.match(ret.stdout, /webauto deps/);
});

test('webauto (no args) shows help instead of launching UI', () => {
  const ret = run([]);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto CLI/);
});

test('webauto xhs --help prints xhs usage', () => {
  const ret = run(['xhs', '--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto xhs/);
  assert.match(ret.stdout, /unified/);
  assert.match(ret.stdout, /collect/);
  assert.match(ret.stdout, /status/);
});

test('webauto daemon --help prints daemon usage', () => {
  const ret = run(['daemon', '--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  assert.match(ret.stdout, /webauto daemon/);
  // relay should not appear in help
  assert.ok(!ret.stdout.includes('relay'), 'daemon help should not mention relay');
});

test('webauto help output has no UI references', () => {
  const ret = run(['--help']);
  assert.equal(ret.status, 0, ret.stderr || ret.stdout);
  // UI-related commands should not appear
  assert.ok(!ret.stdout.includes('ui console'), 'help should not mention ui console');
  assert.ok(!ret.stdout.includes('ui cli'), 'help should not mention ui cli');
  assert.ok(!ret.stdout.includes('desktop-console'), 'help should not mention desktop-console');
  assert.ok(!ret.stdout.includes('electron'), 'help should not mention electron');
  assert.ok(!ret.stdout.includes('relay'), 'help should not mention relay');
});
