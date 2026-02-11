import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const recoveryPath = path.resolve(__dirname, '..', 'lib', 'recovery.mjs');

test('recovery controller actions and health checks use fetch timeouts', async () => {
  const src = await readFile(recoveryPath, 'utf8');
  assert.match(src, /signal: AbortSignal\.timeout \? AbortSignal\.timeout\(15000\) : undefined/);
  assert.match(src, /const res = await fetch\(url, \{\s*signal: AbortSignal\.timeout \? AbortSignal\.timeout\(5000\) : undefined,\s*\}\);/s);
});
