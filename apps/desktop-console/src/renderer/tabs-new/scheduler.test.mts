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
  assert.match(src, /from '\.\/schedule-task-bridge\.mts'/);
  assert.match(src, /invokeSchedule\(\{ action: 'list' \}\)/);
  assert.match(src, /invokeSchedule\(\{ action: 'run-due', limit: 20, timeoutMs: 0 \}\)/);
  assert.match(src, /invokeSchedule\(\{ action: 'export' \}\)/);
  assert.match(src, /invokeSchedule\(\{ action: 'import', payloadJson: text, mode: 'merge' \}\)/);
  assert.match(src, /<option value="immediate">马上执行（仅一次）<\/option>/);
  assert.match(src, /<option value="periodic">周期任务<\/option>/);
  assert.match(src, /<option value="scheduled">定时任务<\/option>/);
  assert.match(src, /scheduleInvoke/);
  assert.match(src, /action: 'daemon-start'/);
  assert.match(src, /cmdKill\(\{ runId: daemonRunId \}\)/);
  assert.match(src, /pendingFocusTaskId/);
  assert.doesNotMatch(src, /card\.innerHTML\s*=/);
});
