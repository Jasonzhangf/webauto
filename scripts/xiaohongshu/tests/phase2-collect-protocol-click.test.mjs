import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phase2CollectPath = path.resolve(__dirname, '..', '..', '..', 'modules', 'xiaohongshu', 'app', 'src', 'blocks', 'Phase2CollectLinksBlock.ts');

async function readSrc() {
  return readFile(phase2CollectPath, 'utf8');
}

test('Phase2Collect uses protocol click strategy before system click', async () => {
  const src = await readSrc();
  assert.match(src, /Click decision:\s*strategy=container_protocol/i);
  assert.match(src, /performContainerClick\s*=\s*async/);
  assert.match(src, /container:operation[\s\S]*operationId:\s*'click'/);
  assert.match(src, /useSystemMouse/);
  assert.match(src, /ensureBrowserFocus\('mouse_center'\)/);
});

test('Phase2Collect logs click strategy failures and no-open outcomes', async () => {
  const src = await readSrc();
  assert.match(src, /Click strategy failed:\s*strategy=/);
  assert.match(src, /Click strategy no-open:\s*strategy=/);
});
