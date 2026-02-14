import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPhase2SearchPath = path.resolve(__dirname, '..', '..', '..', 'modules', 'xiaohongshu', 'app', 'src', 'blocks', 'Phase2SearchBlock.ts');
const xhsPhase2SearchPath = path.resolve(__dirname, '..', '..', '..', 'modules', 'xiaohongshu', 'xhs-search', 'Phase2SearchBlock.ts');

async function assertProtocolInputLogging(filePath) {
  const src = await readFile(filePath, 'utf8');
  assert.match(src, /protocol fill:/);
  assert.match(src, /protocol input:\s*container_type/);
  assert.match(src, /operationId:\s*'type'/);
}

test('Phase2Search logs protocol input and container type fallback (app block)', async () => {
  await assertProtocolInputLogging(appPhase2SearchPath);
});

test('Phase2Search logs protocol input and container type fallback (xhs-search)', async () => {
  await assertProtocolInputLogging(xhsPhase2SearchPath);
});
