import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const phase2SearchPath = path.resolve(
  process.cwd(),
  'modules',
  'xiaohongshu',
  'app',
  'src',
  'blocks',
  'Phase2SearchBlock.ts',
);

test('phase2 search has robust input probe before submit', async () => {
  const src = await readFile(phase2SearchPath, 'utf8');
  assert.match(src, /async function probeSearchInputState/);
  assert.match(src, /editableSelector = "input, textarea/);
  assert.match(src, /candidates\.slice\(0, 5\)/);
  assert.match(src, /canSubmitSearch/);
});

test('phase2 search includes candidate diagnostics when submit guard fails', async () => {
  const src = await readFile(phase2SearchPath, 'utf8');
  assert.match(src, /Before submit: input value=.*candidates=/);
  assert.match(src, /source=.*active=.*candidates=.*screenshot_len=/);
  assert.match(src, /rect invalid for coordinate click/);
});
