import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

async function loadAiConfig() {
  const configPath = join(REPO_ROOT, 'dist', 'modules', 'config', 'index.js');
  try {
    const mod = await import(configPath);
    const cfg = await mod.loadConfig();
    const aiReply = cfg?.desktopConsole?.aiReply;
    if (aiReply) {
      return {
        enabled: aiReply.enabled ?? false,
        baseUrl: aiReply.baseUrl || 'http://127.0.0.1:5520',
        apiKey: aiReply.apiKey || '',
        model: aiReply.model || 'gemini-2.5-flash',
        temperature: aiReply.temperature ?? 0.7,
        maxChars: aiReply.maxChars ?? 20,
        timeoutMs: aiReply.timeoutMs ?? 25000,
      };
    }
  } catch {
    // fallback to local server
  }
  return {
    enabled: true,
    baseUrl: 'http://127.0.0.1:5520',
    apiKey: 'sk-user-01a741881a24856eb910f38e',
    model: 'antigravity.gemini-2.5-flash',
    temperature: 0.7,
    maxChars: 20,
    timeoutMs: 25000,
  };
}

function resolveBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim();
  if (!s) return '';
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function testListModels(baseUrl, apiKey) {
  console.log('[TEST] Fetching models from', baseUrl);
  const startedAt = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = json?.error?.message || `HTTP ${res.status}`;
      console.error('[FAIL] List models failed:', err);
      return false;
    }

    const data = Array.isArray(json?.data) ? json.data : [];
    const models = data.map((m) => m?.id || '').filter(Boolean);
    const latencyMs = Date.now() - startedAt;
    console.log(`[OK] Found ${models.length} models (${latencyMs}ms)`);
    console.log('[SAMPLE] First 3 models:', models.slice(0, 3).join(', '));
    return true;
  } catch (e) {
    console.error('[FAIL] List models error:', e?.message || String(e));
    return false;
  }
}

async function testChatCompletion(baseUrl, apiKey, model, timeoutMs) {
  console.log('[TEST] Testing chat completion with model:', model);
  const startedAt = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '你好，请用一句话回复' }],
        max_tokens: 30,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = json?.error?.message || `HTTP ${res.status}`;
      console.error('[FAIL] Chat completion failed:', err);
      return false;
    }

    const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || '';
    const latencyMs = Date.now() - startedAt;
    console.log(`[OK] Chat completion success (${latencyMs}ms)`);
    console.log('[REPLY]', content);
    return true;
  } catch (e) {
    console.error('[FAIL] Chat completion error:', e?.message || String(e));
    return false;
  }
}

async function main() {
  console.log('[START] Smart Reply Connectivity Test');
  console.log('[INFO] Repo root:', REPO_ROOT);

  const config = await loadAiConfig();
  console.log('[CONFIG]', JSON.stringify({ ...config, apiKey: config.apiKey ? '***' : '' }, null, 2));

  if (!config.enabled) {
    console.log('[SKIP] Smart reply disabled in config');
    process.exit(0);
  }

  const baseUrl = resolveBaseUrl(config.baseUrl);
  if (!baseUrl) {
    console.error('[FAIL] Invalid baseUrl');
    process.exit(1);
  }

  console.log('---');
  const listOk = await testListModels(baseUrl, config.apiKey);
  console.log('---');
  const chatOk = await testChatCompletion(baseUrl, config.apiKey, config.model, config.timeoutMs);
  console.log('---');

  if (listOk && chatOk) {
    console.log('[PASS] All tests passed ✓');
    process.exit(0);
  } else {
    console.log('[FAIL] Some tests failed ✗');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
