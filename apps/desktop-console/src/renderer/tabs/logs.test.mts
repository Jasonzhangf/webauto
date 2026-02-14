import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsPath = path.join(__dirname, 'logs.mts');

test('logs tab supports separate copy actions for global/shard areas', async () => {
  const src = await readFile(logsPath, 'utf8');
  assert.match(src, /复制公共日志/);
  assert.match(src, /复制分片日志/);
  assert.match(src, /copyByType\('global'\)/);
  assert.match(src, /copyByType\('shard'\)/);
  assert.match(src, /clipboardWriteText/);
});

test('logs tab supports keyboard shortcuts for copy', async () => {
  const src = await readFile(logsPath, 'utf8');
  assert.match(src, /evt\.ctrlKey \|\| evt\.metaKey/);
  assert.match(src, /evt\.shiftKey/);
  assert.match(src, /code === 'Digit1' \|\| key === '1'/);
  assert.match(src, /code === 'Digit2' \|\| key === '2'/);
  assert.match(src, /code === 'KeyC' \|\| key === 'c'/);
  assert.match(src, /copySelected/);
});
