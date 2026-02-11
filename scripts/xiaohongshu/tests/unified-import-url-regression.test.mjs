import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const phase2Path = path.resolve(__dirname, '..', 'phase2-collect.mjs');
const phase3Path = path.resolve(__dirname, '..', 'phase3-interact.mjs');
const unifiedPath = path.resolve(__dirname, '..', 'phase-unified-harvest.mjs');

async function expectUnifiedImport(filePath) {
  const src = await readFile(filePath, 'utf8');
  assert.match(src, /import \{ UNIFIED_API_URL \} from '\.\/lib\/core-daemon\.mjs';/);
  assert.doesNotMatch(src, /CORE_DAEMON_URL as UNIFIED_API_URL/);
}

test('phase2/phase3/unified use direct UNIFIED_API_URL import', async () => {
  await expectUnifiedImport(phase2Path);
  await expectUnifiedImport(phase3Path);
  await expectUnifiedImport(unifiedPath);
});

