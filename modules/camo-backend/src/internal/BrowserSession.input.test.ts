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

test('mouseMove times out instead of hanging forever', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '30');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '1');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  try {
    const page = {
      mouse: {
        move: () => new Promise<void>(() => {}),
      },
      bringToFront: async () => {},
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await assert.rejects(
      async () => session.mouseMove({ x: 10, y: 20 }),
      /mouse:move .*timed out after \d+ms/,
    );
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});

test('mouseMove retries after timeout and can recover', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '30');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '2');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  try {
    let calls = 0;
    const page = {
      mouse: {
        move: () => {
          calls += 1;
          if (calls === 1) return new Promise<void>(() => {});
          return Promise.resolve();
        },
      },
      bringToFront: async () => {},
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await session.mouseMove({ x: 30, y: 40 });
    assert.equal(calls, 2);
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});

test('mouseMove recovers when recovery bringToFront hangs', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '30');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '2');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  const restoreRecoveryFocusTimeout = setEnv('CAMO_INPUT_RECOVERY_BRING_TO_FRONT_TIMEOUT_MS', '20');
  try {
    let moveCalls = 0;
    let bringToFrontCalls = 0;
    const page = {
      mouse: {
        move: () => {
          moveCalls += 1;
          if (moveCalls === 1) return new Promise<void>(() => {});
          return Promise.resolve();
        },
      },
      bringToFront: () => {
        bringToFrontCalls += 1;
        if (bringToFrontCalls === 1) return new Promise<void>(() => {});
        return Promise.resolve();
      },
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await session.mouseMove({ x: 50, y: 60 });
    assert.equal(moveCalls, 2);
    assert.equal(bringToFrontCalls, 1);
  } finally {
    restoreRecoveryFocusTimeout();
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
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
        move: async () => {
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
      session.mouseMove({ x: 1, y: 1 }),
      session.mouseMove({ x: 2, y: 2 }),
    ]);
    assert.equal(maxActive, 1);
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});

test('mouseClick uses explicit move/down/up pipeline', async () => {
  const restoreTimeout = setEnv('CAMO_INPUT_ACTION_TIMEOUT_MS', '200');
  const restoreAttempts = setEnv('CAMO_INPUT_ACTION_MAX_ATTEMPTS', '1');
  const restoreDelay = setEnv('CAMO_INPUT_RECOVERY_DELAY_MS', '0');
  try {
    const calls: string[] = [];
    const page = {
      mouse: {
        click: () => {
          throw new Error('mouse.click should not be used');
        },
        move: async () => {
          calls.push('move');
        },
        down: async () => {
          calls.push('down');
        },
        up: async () => {
          calls.push('up');
        },
      },
      bringToFront: async () => {},
      waitForTimeout: async () => {},
    };
    const session = createSessionWithPage(page);
    await session.mouseClick({ x: 11, y: 22, delay: 0 });
    assert.deepEqual(calls, ['move', 'down', 'up']);
  } finally {
    restoreDelay();
    restoreAttempts();
    restoreTimeout();
  }
});
