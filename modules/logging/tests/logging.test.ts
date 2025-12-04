import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { run as runCli } from '../src/cli.js';

async function withTempLog(content: string, fn: (file: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-test-'));
  const file = path.join(dir, 'sample.log');
  await fs.writeFile(file, content, 'utf-8');
  try {
    await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('logging cli stream returns tail lines', async () => {
  await withTempLog('line1\nline2\nline3\n', async (file) => {
    const result = await runCli(['stream', '--file', file, '--lines', '2']);
    assert.equal(result.success, true);
    assert.deepEqual(result.data.lines, ['line2', 'line3']);
  });
});

test('logging cli flush can truncate file', async () => {
  await withTempLog('foo\nbar\n', async (file) => {
    const flush = await runCli(['flush', '--file', file, '--truncate', 'false']);
    assert.equal(flush.success, true);
    assert.equal(flush.data.lines.length, 2);

    const flushTruncate = await runCli(['flush', '--file', file]);
    assert.equal(flushTruncate.success, true);
    const stats = await fs.stat(file);
    assert.equal(stats.size, 0);
  });
});
