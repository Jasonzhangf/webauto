import test from 'node:test';
import assert from 'node:assert/strict';
import { run as runCli } from '../src/cli.js';

test('operations cli list returns registered operations', async () => {
  const result = await runCli(['list']);
  assert.equal(result.success, true);
  assert.ok(result.data.some((op: any) => op.id === 'highlight'));
  assert.ok(result.data.some((op: any) => op.id === 'scroll'));
});

test('operations cli run works with mock page context', async () => {
  const result = await runCli(['run', '--op', 'highlight', '--config', '{"selector":"#app"}']);
  assert.equal(result.success, true);
  assert.equal(result.data.mock, true);
});

// Skipped: robotjs has been removed from dependencies
test.skip('operations cli run supports system mouse', async () => {
  const result = await runCli(['run', '--op', 'system:mouse-move', '--config', '{"x":10,"y":20}']);
  assert.equal(result.success, true);
});
