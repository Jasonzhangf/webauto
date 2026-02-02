import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = new URL('.', import.meta.url).pathname;
const runPath = path.join(__dirname, 'run.mts');

test('phase1 supports multi-profile modes in resolveProfileArgsForRun', async () => {
  const src = await readFile(runPath, 'utf8');
  // Ensure Phase1 is included in supportsMultiProfile predicate.
  assert.match(
    src,
    /supportsMultiProfile\s*=\s*t\s*===\s*'phase1'\s*\|\|\s*t\s*===\s*'phase3'\s*\|\|\s*t\s*===\s*'phase4'/,
  );
});
