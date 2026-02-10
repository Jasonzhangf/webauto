import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SessionManager } from './SessionManager.js';

class FakeSession {
  id: string;
  modeName = 'test';
  onExit?: (id: string) => void;
  started = false;

  constructor(opts: any) {
    this.id = String(opts?.profileId || opts?.sessionId || 'unknown');
  }

  async start() {
    this.started = true;
  }

  async close() {
    this.started = false;
  }

  getCurrentUrl() {
    return `about:${this.id}`;
  }

  getInfo() {
    return { id: this.id };
  }
}

test('SessionManager routes sessions by profileId (multi-instance)', async () => {
  const mgr = new SessionManager(undefined, (opts: any) => new FakeSession(opts) as any);

  const a = await mgr.createSession({ profileId: 'p-a', headless: true });
  const b = await mgr.createSession({ profileId: 'p-b', headless: true });
  assert.equal(a.sessionId, 'p-a');
  assert.equal(b.sessionId, 'p-b');

  const sa = mgr.getSession('p-a');
  const sb = mgr.getSession('p-b');
  assert.ok(sa);
  assert.ok(sb);
  assert.notEqual(sa, sb);

  const list = mgr.listSessions();
  const ids = list.map((x) => x.profileId).sort();
  assert.deepEqual(ids, ['p-a', 'p-b']);

  const okA = await mgr.deleteSession('p-a');
  assert.equal(okA, true);
  assert.equal(Boolean(mgr.getSession('p-a')), false);
  assert.ok(mgr.getSession('p-b'));
});


test('SessionManager rejects reuse when profile is owned by another live process', async () => {
  const mgr = new SessionManager(undefined, (opts: any) => new FakeSession(opts) as any);

  await mgr.createSession({ profileId: 'p-owned', ownerPid: process.pid } as any);

  await assert.rejects(
    async () => {
      await mgr.createSession({ profileId: 'p-owned', ownerPid: process.pid + 100000 } as any);
    },
    /session_owned_by_another_process/,
  );

  await mgr.shutdown();
});
