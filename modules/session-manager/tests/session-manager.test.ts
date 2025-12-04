import test from 'node:test';
import assert from 'node:assert/strict';
import { run as runCli } from '../src/cli.js';

test('session-manager cli create/list/delete works in test mode', async () => {
  process.env.SESSION_MANAGER_TEST_MODE = '1';

  const create = await runCli(['create', '--profile', 'demo', '--url', 'https://example.com']);
  assert.equal(create.success, true);
  assert.equal(create.data.sessionId, 'demo');

  const list = await runCli(['list']);
  assert.equal(list.success, true);
  assert.equal(list.data.sessions.length, 1);

  const del = await runCli(['delete', '--profile', 'demo']);
  assert.equal(del.success, true);

  const listAfter = await runCli(['list']);
  assert.equal(listAfter.data.sessions.length, 0);

  delete process.env.SESSION_MANAGER_TEST_MODE;
});
