// @ts-nocheck
import express from 'express';
import { CONFIG } from './config.js';
import { killPort, listPorts } from './lib/portUtils.js';
import { startNodeProcess, waitForHealth } from './lib/processManager.js';

const app = express();
app.use(express.json());

let procs = { workflow: null, vision: null, container: null };

function log(name, msg, isErr = false) {
  const pfx = name.padEnd(9);
  (isErr ? console.error : console.log)(`[${pfx}] ${msg.trim()}`);
}

async function startWorkflow() {
  await killPort(CONFIG.ports.workflow);
  procs.workflow?.kill('SIGKILL');
  procs.workflow = startNodeProcess({ name: 'workflow', script: CONFIG.scripts.workflow, onLog: log });
  const ok = await waitForHealth(`http://127.0.0.1:${CONFIG.ports.workflow}/health`, { timeoutMs: 20000 });
  if (!ok) throw new Error('workflow failed to become healthy');
}

async function startVision() {
  await killPort(CONFIG.ports.vision);
  procs.vision?.kill('SIGKILL');
  procs.vision = startNodeProcess({ name: 'vision', script: CONFIG.scripts.vision, onLog: log });
  const ok = await waitForHealth(`http://127.0.0.1:${CONFIG.ports.vision}/health`, { timeoutMs: 30000 });
  if (!ok) throw new Error('vision proxy failed to become healthy');
}

async function startContainer() {
  await killPort(CONFIG.ports.container);
  procs.container?.kill('SIGKILL');
  procs.container = startNodeProcess({ name: 'container', script: CONFIG.scripts.container, onLog: log });
  const ok = await waitForHealth(`http://127.0.0.1:${CONFIG.ports.container}/health`, { timeoutMs: 20000 });
  if (!ok) throw new Error('container engine failed to become healthy');
}

async function startAll() {
  await startWorkflow();
  await startVision();
  await startContainer();
}

app.get('/health', async (req, res) => {
  try {
    const agg = { status: 'ok', uptime: process.uptime()*1000|0, services: {} };
    const wf = await fetch(`http://127.0.0.1:${CONFIG.ports.workflow}/health`).then(r=>r.json()).catch(()=>({ status: 'error' }));
    const vs = await fetch(`http://127.0.0.1:${CONFIG.ports.vision}/health`).then(r=>r.json()).catch(()=>({ status: 'error' }));
    const ct = await fetch(`http://127.0.0.1:${CONFIG.ports.container}/health`).then(r=>r.json()).catch(()=>({ status: 'error' }));
    agg.services.workflow = { status: wf.status || (wf.success ? 'ok' : 'error'), port: CONFIG.ports.workflow };
    agg.services.vision = { status: vs.status || (vs.success ? 'ok' : 'error'), port: CONFIG.ports.vision };
    agg.services.container = { status: ct.status || (ct.success ? 'ok' : 'error'), port: CONFIG.ports.container };
    if (agg.services.workflow.status !== 'ok' || agg.services.vision.status !== 'ok' || agg.services.container.status !== 'ok') agg.status = 'degraded';
    return res.json(agg);
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message });
  }
});

app.post('/restart/:service', async (req, res) => {
  const svc = req.params.service;
  try {
    if (svc === 'workflow') await startWorkflow();
    else if (svc === 'vision') await startVision();
    else if (svc === 'container') await startContainer();
    else if (svc === 'all') await startAll();
    else return res.status(400).json({ success: false, error: 'unknown service' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/ports', async (req, res) => {
  const ports = [CONFIG.ports.orchestrator, CONFIG.ports.workflow, CONFIG.ports.vision, CONFIG.ports.visionPy, CONFIG.ports.container];
  const list = await listPorts(ports);
  return res.json({ success: true, ports: list });
});

const port = CONFIG.ports.orchestrator;
app.listen(port, async () => {
  console.log(`Orchestrator listening on http://localhost:${port}`);
  try {
    await startAll();
    console.log('All services started and healthy.');
  } catch (e) {
    console.error('Startup error:', e.message);
  }
});
