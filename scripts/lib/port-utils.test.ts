import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { checkPortInUse, releasePort } from './port-utils.mjs';

function listenOnce(port: number) {
  return new Promise<{ close: () => Promise<void> }>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      resolve({
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

test('checkPortInUse detects localhost listener', async () => {
  const port = 18991;
  const srv = await listenOnce(port);

  try {
    const inUse = await checkPortInUse(port);
    assert.equal(inUse, true);
  } finally {
    await srv.close();
  }

  const free = await checkPortInUse(port);
  assert.equal(free, false);
});

test('releasePort does not kill excluded pid', async () => {
  const port = 18992;
  const srv = await listenOnce(port);

  try {
    const released = await releasePort(port, { excludePids: [process.pid] });
    assert.equal(released, false);
    assert.equal(await checkPortInUse(port), true);
  } finally {
    await srv.close();
  }

  assert.equal(await checkPortInUse(port), false);
});

