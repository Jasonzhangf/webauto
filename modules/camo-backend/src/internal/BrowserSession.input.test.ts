import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSession } from './BrowserSession.js';

function setEnv(key: string, value: string) {
  const prev = process.env[key];
  process.env[key] = value;
  return () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
}

function createSessionWithPage(page: any) {
  const session = new BrowserSession({ profileId: `test-input-${Date.now()}` }) as any;
  session.ensurePrimaryPage = async () => page;
  session.ensureInputReady = async () => {};
  return session as BrowserSession;
}

test('mouseMove is disabled to avoid unstable pointer movement path', async () => {
  const page = {
    mouse: {
      move: async () => {},
    },
    bringToFront: async () => {},
    waitForTimeout: async () => {},
  };
  const session = createSessionWithPage(page);
  await assert.rejects(
    async () => session.mouseMove({ x: 10, y: 20 }),
    /mouse:move disabled/i,
  );
});

test('input actions are serialized per session', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '200');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '1');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  try {
    let active = 0;
    let maxActive = 0;
    const page = {
      mouse: {
        click: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 40));
          active -= 1;
        },
      },
      bringToFront: async () => {},
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await Promise.all([
      session.mouseClick({ x: 1, y: 1, delay: 0 }),
      session.mouseClick({ x: 2, y: 2, delay: 0 }),
    ]);
    assert.equal(maxActive, 1);
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});

test('mouseClick uses direct click pipeline', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '200');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '1');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  try {
    const calls: string[] = [];
    const page = {
      mouse: {
        click: async () => {
          calls.push('click');
        },
      },
      bringToFront: async () => {},
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await session.mouseClick({ x: 11, y: 22, delay: 0 });
    assert.deepEqual(calls, ['click']);
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});

test('mouseClick repeats direct click for multi-click', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '200');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '1');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  try {
    const calls: string[] = [];
    const page = {
      mouse: {
        click: async () => {
          calls.push('click');
        },
      },
      bringToFront: async () => {},
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await session.mouseClick({ x: 15, y: 25, delay: 0, clicks: 2 });
    assert.deepEqual(calls, ['click', 'click']);
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});
