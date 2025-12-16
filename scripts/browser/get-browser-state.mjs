#!/usr/bin/env node
const DEFAULT_HOST = process.env.BROWSER_SERVICE_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.BROWSER_SERVICE_PORT || 7704);
const DEFAULT_URL =
  process.env.BROWSER_STATE_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}/state`;

const args = process.argv.slice(2);
let targetUrl = null;
let host = DEFAULT_HOST;
let port = DEFAULT_PORT;
let timeoutMs = Number(process.env.BROWSER_STATE_TIMEOUT || 10000);

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--url' && args[i + 1]) {
    targetUrl = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--host' && args[i + 1]) {
    host = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--port' && args[i + 1]) {
    port = Number(args[i + 1]);
    i += 1;
    continue;
  }
  if (arg === '--timeout' && args[i + 1]) {
    timeoutMs = Number(args[i + 1]);
    i += 1;
    continue;
  }
}

const endpoint = targetUrl || `http://${host}:${port}/state`;

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, Math.max(1000, timeoutMs || 0));

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(
        `[browser:state] request failed ${res.status} ${res.statusText} (${endpoint})`,
      );
      process.exit(1);
      return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
      console.error(`[browser:state] request timed out after ${timeoutMs}ms (${endpoint})`);
    } else {
      const message =
        err && typeof err === 'object' && err !== null && 'message' in err ? err.message : err;
      console.error(`[browser:state] request error: ${message}`);
    }
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();
