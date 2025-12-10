#!/usr/bin/env node
import WebSocket from 'ws';

const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:8790';
const requestId = `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function main() {
  const socket = new WebSocket(BUS_URL);
  let resolved = false;
  const cleanup = () => {
    if (!resolved) {
      resolved = true;
    }
    try {
      socket.close();
    } catch {
      /* noop */
    }
  };

  socket.on('message', (raw) => {
    if (resolved) return;
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (payload?.topic !== 'ui.state.snapshot') return;
    const snapshot = payload.payload || payload;
    const meta = snapshot?.requestId || snapshot?.payload?.requestId;
    if (snapshot?.requestId && snapshot.requestId !== requestId) return;
    resolved = true;
    console.log(JSON.stringify(snapshot, null, 2));
    cleanup();
  });

  socket.once('open', () => {
    socket.send(JSON.stringify({ topic: 'ui.state.request', payload: { requestId } }));
  });
  socket.once('error', (err) => {
    if (resolved) return;
    resolved = true;
    console.error('[get-ui-state] bus error:', err?.message || err);
    cleanup();
    process.exit(1);
  });
  socket.once('close', () => {
    if (!resolved) {
      console.error('[get-ui-state] connection closed without snapshot');
      process.exit(1);
    }
  });
}

main();
