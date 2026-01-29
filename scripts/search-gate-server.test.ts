import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitForHealth(url: string, retries = 20) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await delay(150);
  }
  return false;
}

async function requestPermit(url: string, body: Record<string, any>) {
  const res = await fetch(`${url}/permit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

test('SearchGate enforces keyword window limit', async (t) => {
  const port = 7797;
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    WEBAUTO_SEARCH_GATE_PORT: String(port),
    WEBAUTO_SEARCH_GATE_MAX_COUNT: '100',
    WEBAUTO_SEARCH_GATE_KEYWORD_WINDOW_MS: '2000',
    WEBAUTO_SEARCH_GATE_KEYWORD_MAX_COUNT: '3',
  };

  const child = spawn(process.execPath, ['scripts/search-gate-server.mjs'], {
    env,
    stdio: 'ignore',
  });

  t.after(async () => {
    try {
      await fetch(`${baseUrl}/shutdown`, { method: 'POST' });
    } catch {
      // ignore
    }
    child.kill();
  });

  const ready = await waitForHealth(baseUrl);
  assert.equal(ready, true, 'SearchGate should be healthy');

  const payload = { profileId: 'xiaohongshu_fresh', keyword: 'test' };

  const r1 = await requestPermit(baseUrl, payload);
  const r2 = await requestPermit(baseUrl, payload);
  const r3 = await requestPermit(baseUrl, payload);
  const r4 = await requestPermit(baseUrl, payload);

  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, true);
  assert.equal(r4.allowed, false);
  assert.equal(r4.reason, 'keyword_rate_limited');
});
