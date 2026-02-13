// sharedmodule/__tests__/state-client.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { StateClient } from '../state-client.mts';

test('StateClient constructor initializes with options', () => {
  const client = new StateClient({
    runId: 'test-run-1',
    profileId: 'profile-1',
    keyword: 'test-keyword',
    phase: 'phase2',
    apiUrl: 'http://localhost:9999',
  });
  assert.ok(client);
  assert.equal(client['runId'], 'test-run-1');
  assert.equal(client['profileId'], 'profile-1');
  assert.equal(client['keyword'], 'test-keyword');
});

test('incrementNotes calls updateStats', async () => {
  let called = false;
  const client = new StateClient({
    runId: 'test-run-2',
    profileId: 'profile-1',
    keyword: 'test',
    apiUrl: 'http://localhost:9999',
  });
  client.updateStats = async (stats) => {
    called = true;
    assert.deepEqual(stats, { notesProcessed: 1 });
  };
  client.incrementNotes(1);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(called);
});
