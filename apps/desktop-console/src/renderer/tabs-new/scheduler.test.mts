import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'scheduler.mts');

async function getSrc() {
  return readFile(filePath, 'utf8');
}

test('scheduler panel wires schedule cli operations and daemon controls', async () => {
  const src = await getSrc();
  assert.match(src, /apps', 'webauto', 'entry', 'schedule\.mjs'/);
  assert.match(src, /runScheduleJson\(\['list'\]\)/);
  assert.match(src, /runScheduleJson\(\['run-due', '--limit', '20'\]/);
  assert.match(src, /runScheduleJson\(\['export'\]\)/);
  assert.match(src, /runScheduleJson\(\['import', '--payload-json', text, '--mode', 'merge'\]\)/);
  assert.match(src, /<option value="daily">每天<\/option>/);
  assert.match(src, /<option value="weekly">每周<\/option>/);
  assert.match(src, /--max-runs/);
  assert.match(src, /cmdSpawn\(\{\s*title: `schedule daemon/);
  assert.match(src, /cmdKill\(\{ runId: daemonRunId \}\)/);
});
