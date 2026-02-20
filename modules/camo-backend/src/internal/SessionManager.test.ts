import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from './SessionManager.js';

test('createSession closes session when start fails', async () => {
  let closeCalled = 0;
  const fakeSession: any = {
    id: 'start-fail-profile',
    modeName: 'dev',
    onExit: undefined,
    async start() {
      throw new Error('start_failed');
    },
    async close() {
      closeCalled += 1;
    },
    getCurrentUrl(): string | null {
      return null;
    },
    getRecordingStatus(): any {
      return {
        active: false,
        enabled: false,
        name: null as string | null,
        outputPath: null as string | null,
        overlay: false,
        startedAt: null as number | null,
        endedAt: null as number | null,
        eventCount: 0,
        lastEventAt: null as number | null,
        lastError: null as string | null,
      };
    },
  };

  const manager = new SessionManager({ ownerWatchdogMs: 60_000 }, () => fakeSession);

  await assert.rejects(
    async () => manager.createSession({ profileId: 'start-fail-profile' }),
    /start_failed/,
  );
  assert.equal(closeCalled, 1);
  assert.equal(manager.getSession('start-fail-profile'), undefined);

  await manager.shutdown();
});
