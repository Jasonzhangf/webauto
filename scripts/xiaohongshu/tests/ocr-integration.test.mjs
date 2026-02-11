import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const unifiedPath = path.resolve(__dirname, '..', 'phase-unified-harvest.mjs');
const orchestratePath = path.resolve(__dirname, '..', 'phase-orchestrate.mjs');

test('unified harvest has OCR command detection and README section upsert', async () => {
  const src = await readFile(unifiedPath, 'utf8');
  assert.match(src, /WEBAUTO_OCR_START/);
  assert.match(src, /WEBAUTO_OCR_END/);
  assert.match(src, /resolveOcrCommand/);
  assert.match(src, /deepseek-ocr/);
  assert.match(src, /dsocr/);
  assert.match(src, /## 图片 OCR/);
  assert.match(src, /phase_unified_ocr_start/);
  assert.match(src, /phase_unified_ocr_done/);
});

test('orchestrate forwards ocr-command only to unified stage', async () => {
  const src = await readFile(orchestratePath, 'utf8');
  assert.match(src, /const ocrCommand = String\(args\['ocr-command'\] \|\| ''\)\.trim\(\)/);
  assert.match(src, /'--ocr-command'/);
  assert.match(src, /\.\.\.\(ocrCommand \? \['--ocr-command', ocrCommand\] : \[\]\)/);
});
