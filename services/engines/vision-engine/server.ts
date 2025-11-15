// @ts-nocheck
import express from 'express';
import { requestLogger } from './lib/requestLogger.js';
import { PythonProcessManager } from './lib/pythonProcessManager.js';
import { handleWithLmStudio, lmEnabled } from './lib/lmstudioClient.js';
// search-image not implemented for now per product decision

const VISION_PORT = Number(process.env.PORT_VISION || 7702);
const PY_HOST = '127.0.0.1';
const PY_PORT = Number(process.env.PORT_PY_VISION || 8899);

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(requestLogger);

const py = new PythonProcessManager({ host: PY_HOST, port: PY_PORT });

async function ensurePy() {
  await py.start();
  const ok = await waitFor(`http://${PY_HOST}:${PY_PORT}/health`, 30000);
  if (!ok) throw new Error('Python service not healthy');
}

async function waitFor(url, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 2000);
      const resp = await fetch(url, { signal: ctl.signal });
      clearTimeout(to);
      if (resp.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

app.get('/health', async (req, res) => {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 1500);
    let python = { reachable: false };
    try {
      const r = await fetch(`http://${PY_HOST}:${PY_PORT}/health`, { signal: ctl.signal });
      clearTimeout(to);
      if (r.ok) {
        const j = await r.json().catch(()=>({}));
        python = { reachable: true, modelLoaded: j.model_loaded, version: j.version };
      }
    } catch {}
    const status = python.reachable ? 'ok' : 'degraded';
    return res.json({ status, uptime: process.uptime()*1000|0, python });
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message });
  }
});

// Template-based image search (disabled)
app.post('/search-image', async (req, res) => {
  return res.status(501).json({ success: false, error: '未实现' });
});

app.post('/recognize', async (req, res) => {
  const body = req.body || {};
  try {
    if (lmEnabled()) {
      const t0 = Date.now();
      const result = await handleWithLmStudio(body);
      const dt = Date.now() - t0;
      try {
        result.metadata = result.metadata || {};
        result.metadata.processingTimeMs = dt;
      } catch {}
      return res.json(result);
    } else {
      await ensurePy();
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 30000);
      const payload = {
        request_id: Math.floor(Math.random()*1e9),
        image: body.image,
        query: body.query || '识别页面中的可交互元素',
        scope: body.scope || 'full',
        region: body.region || null,
        parameters: body.parameters || {}
      };
      const r = await fetch(`http://${PY_HOST}:${PY_PORT}/recognize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) {
        const t = await r.text().catch(()=>(''));
        return res.status(502).json({ success: false, error: `py error: ${t || r.status}` });
      }
      const j = await r.json();
      return res.json({
        success: j.success !== false,
        elements: j.elements || [],
        actions: j.actions || [],
        analysis: j.analysis,
        metadata: { model: j.metadata?.model || 'Tongyi-MiA/UI-Ins-7B', processingTime: j.processing_time || j.processingTime || 0, confidence: j.confidence || 0 }
      });
    }
  } catch (e) {
    const msg = (e && (e as any).message) ? (e as any).message : String(e);
    const stack = (e && (e as any).stack) ? (e as any).stack : undefined;
    if (stack) console.error('[vision:/recognize] error:', stack);
    else console.error('[vision:/recognize] error:', msg);
    return res.status(500).json({ success: false, error: msg, stack });
  }
});

// Force crop-first recognition (performance path)
app.post('/recognize/crop', async (req, res) => {
  const body = req.body || {};
  if (!body.region) return res.status(400).json({ success: false, error: 'region required' });
  try {
    if (lmEnabled()) {
      const result = await handleWithLmStudio(body);
      return res.json(result);
    } else {
      await ensurePy();
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 30000);
      const payload = {
        request_id: Math.floor(Math.random()*1e9),
        image: body.image,
        query: body.query || '识别区域中的可交互元素',
        scope: 'partial',
        region: body.region,
        parameters: body.parameters || {}
      };
      const r = await fetch(`http://${PY_HOST}:${PY_PORT}/recognize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) {
        const t = await r.text().catch(()=>(''));
        return res.status(502).json({ success: false, error: `py error: ${t || r.status}` });
      }
      const j = await r.json();
      return res.json(j);
    }
  } catch (e) {
    const msg = (e && (e as any).message) ? (e as any).message : String(e);
    const stack = (e && (e as any).stack) ? (e as any).stack : undefined;
    if (stack) console.error('[vision:/recognize/crop] error:', stack);
    else console.error('[vision:/recognize/crop] error:', msg);
    return res.status(500).json({ success: false, error: msg, stack });
  }
});

app.listen(VISION_PORT, async () => {
  console.log(`Vision Proxy listening on http://localhost:${VISION_PORT}`);
  try {
    if (lmEnabled()) {
      console.log('LM Studio mode enabled for vision recognition.');
    } else {
      await ensurePy();
      console.log('Python vision service is healthy.');
    }
  } catch (e) {
    console.error('Failed to start Python vision service:', e.message);
  }
});
