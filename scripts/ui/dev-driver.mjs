#!/usr/bin/env node
import WebSocket from 'ws';

const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:8790';

const scenario = [
  {
    topic: 'ui.window.shrinkToBall',
    payload: null,
    expect: (evt) => evt.topic === 'ui.window.stateChanged' && evt.payload?.mode === 'ball',
    description: 'window collapsed',
  },
  {
    topic: 'ui.window.restoreFromBall',
    payload: null,
    expect: (evt) => evt.topic === 'ui.window.stateChanged' && evt.payload?.mode === 'normal',
    description: 'window restored',
  },
  {
    topic: 'ui.graph.expandDom',
    payload: { path: 'root' },
    expect: (evt) => evt.topic === 'ui.graph.domExpanded' && evt.payload?.path === 'root',
    description: 'root dom expanded',
  },
  {
    topic: 'ui.graph.expandDom',
    payload: { path: 'root/0' },
    expect: (evt) => evt.topic === 'ui.graph.domExpanded' && evt.payload?.path === 'root/0',
    description: 'root/0 dom expanded',
  },
];

async function main() {
  const socket = new WebSocket(BUS_URL);
  const watchers = new Set();
  socket.on('message', (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }
    watchers.forEach((handler) => {
      if (handler(evt)) {
        watchers.delete(handler);
      }
    });
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  console.log(`[dev-driver] connected ${BUS_URL}`);
  console.log('[dev-driver] waiting for snapshot ready event...');
  await waitForEvent(socket, watchers, (evt) => evt.topic === 'ui.graph.snapshotReady', 'snapshot ready', 25000);

  for (const step of scenario) {
    const waitPromise = waitForEvent(socket, watchers, step.expect, step.description);
    socket.send(JSON.stringify({ topic: step.topic, payload: step.payload }));
    console.log('[dev-driver] publish', step.topic, step.payload ?? '');
    await waitPromise;
  }
  socket.close();
}

function waitForEvent(socket, watchers, predicate, label, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      watchers.delete(handler);
      reject(new Error(`timeout: ${label}`));
    }, timeoutMs);
    const handler = (event) => {
      if (typeof predicate === 'function' && predicate(event)) {
        clearTimeout(timeout);
        resolve(event);
        return true;
      }
      return false;
    };
    watchers.add(handler);
  });
}

main().catch((err) => {
  console.error('[dev-driver] failed', err);
  process.exit(1);
});
