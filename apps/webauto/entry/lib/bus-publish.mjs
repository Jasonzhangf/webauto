import WebSocket from 'ws';

function resolveBusUrl() {
  const explicit = String(process.env.WEBAUTO_UNIFIED_BUS_URL || '').trim();
  if (explicit) return explicit;
  const host = String(process.env.WEBAUTO_UNIFIED_HOST || '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(
    process.env.WEBAUTO_FLOATING_BUS_PORT
    || process.env.WEBAUTO_UNIFIED_PORT
    || 7701,
  );
  return `ws://${host}:${Number.isFinite(port) ? port : 7701}/bus`;
}

export async function publishBusEvent(payload, options = {}) {
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  const timeoutMs = Math.max(300, Number(options.timeoutMs || 1500));
  const url = resolveBusUrl();

  return await new Promise((resolve) => {
    let settled = false;
    let sent = false;
    let ws;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      ws = new WebSocket(url);
    } catch {
      done(false);
      return;
    }

    const timer = setTimeout(() => {
      try { ws?.terminate(); } catch {}
      done(false);
    }, timeoutMs);

    ws.on('open', () => {
      try {
        ws.send(message);
        sent = true;
      } catch {
        // ignore send failure
      }
      setTimeout(() => {
        try { ws.close(); } catch {}
      }, 30);
    });
    ws.on('close', () => {
      clearTimeout(timer);
      done(sent);
    });
    ws.on('error', () => {
      clearTimeout(timer);
      done(false);
    });
  });
}
