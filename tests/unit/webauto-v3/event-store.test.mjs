import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EventStore } from '../../../modules/webauto-v3/src/event-store.mjs';

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

test('event store allocates monotonic seq and replays deterministically', () => {
  const dir = tempDir('webauto-v3-event');
  const store = new EventStore({ runId: 'run_test', dir });
  store.append({ type: 'RunStarted', source: 'test', payload: { goal: 'x' } });
  store.append({ type: 'ObservationCaptured', source: 'test', payload: { revision: 'rev_1' } });

  const replayed = new EventStore({ runId: 'run_test', dir, create: false });
  const events = replayed.load();
  assert.deepEqual(events.map((event) => event.seq), [1, 2]);
  assert.equal(events[0].run_id, 'run_test');
  assert.equal(events[0].event_id.startsWith('evt_'), true);

});

test('terminal operations are indexed once and replay never re-executes', () => {
  const dir = tempDir('webauto-v3-terminal');
  const store = new EventStore({ runId: 'run_terminal', dir });
  store.append({
    type: 'OperationRequested',
    source: 'test',
    idempotency_key: 'invoke:1:act',
    payload: { operation_kind: 'click' },
  });
  store.append({
    type: 'OperationSucceeded',
    source: 'test',
    idempotency_key: 'invoke:1:act',
    payload: { ok: true },
  });
  assert.equal(store.terminalStatus('invoke:1:act').status, 'succeeded');
  assert.equal(store.terminalStatus('missing'), null);
  assert.equal(store.events().length, 2);
});

test('event store fails closed on malformed JSONL', () => {
  const dir = tempDir('webauto-v3-event-corrupt');
  const store = new EventStore({ runId: 'run_corrupt', dir });
  store.append({ type: 'RunStarted', source: 'test' });
  fs.appendFileSync(store.file(), '{not-json}\n', 'utf8');

  const replayed = new EventStore({ runId: 'run_corrupt', dir, create: false });
  assert.throws(() => replayed.load(), /invalid event JSON .*:2:/);
});
