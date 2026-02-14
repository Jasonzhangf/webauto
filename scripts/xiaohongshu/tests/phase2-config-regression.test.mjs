import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIFIED_API_URL } from '../lib/core-daemon.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const phase2Path = path.resolve(__dirname, '..', 'phase2-collect.mjs');

test('phase2 uses UNIFIED_API_URL and has no undefined CONFIG reference', async () => {
  const src = await readFile(phase2Path, 'utf8');
  assert.match(src, /import \{ UNIFIED_API_URL \} from '\.\/lib\/core-daemon\.mjs';/);
  assert.doesNotMatch(src, /CONFIG\.UNIFIED_API/);
  assert.match(src, /import \{ execute as waitSearchPermit \} from '\.\.\/\.\.\/dist\/modules\/workflow\/blocks\/WaitSearchPermitBlock\.js';/);
  assert.match(src, /function ensureFreshXhsBlocks\(\)/);
  assert.match(src, /detected stale dist blocks, rebuilding services/);
  assert.match(src, /await loadPhase2Blocks\(\)/);
  assert.match(src, /import\('\.\.\/\.\.\/dist\/modules\/xiaohongshu\/app\/src\/blocks\/Phase2SearchBlock\.js'\)/);
  assert.match(src, /import\('\.\.\/\.\.\/dist\/modules\/xiaohongshu\/app\/src\/blocks\/Phase2CollectLinksBlock\.js'\)/);
  assert.doesNotMatch(src, /xhs-orchestrator\/index\.js/);
});

test('UNIFIED_API_URL points to unified endpoint', async () => {
  assert.equal(UNIFIED_API_URL, 'http://127.0.0.1:7701');
});
