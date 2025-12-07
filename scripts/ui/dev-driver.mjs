#!/usr/bin/env node
import WebSocket from 'ws';

const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:8790';

const MAX_AUTO_EXPAND_PATHS = Number(process.env.WEBAUTO_UI_AUTO_EXPAND_LIMIT || '4');

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
  console.log('[dev-driver] requesting initial graph report...');
  let report = await requestGraphReport(socket, watchers, 'initial');
  validateGraphReport(report);
  report = await autoExpandGraph(socket, watchers, report);

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

async function requestGraphReport(socket, watchers, label) {
  const waitPromise = waitForEvent(
    socket,
    watchers,
    (evt) => evt.topic === 'ui.graph.report',
    `graph report (${label})`,
    15000,
  );
  socket.send(JSON.stringify({ topic: 'ui.graph.requestReport', payload: { source: label } }));
  const evt = await waitPromise;
  return evt?.payload || {};
}

function validateGraphReport(report) {
  if (!report || !Array.isArray(report.domNodes)) {
    throw new Error('graph report missing dom nodes');
  }
  const mismatches = report.domNodes.filter((node) => node.expectedExpandable && !node.canExpand);
  if (mismatches.length) {
    const detail = mismatches
      .slice(0, 5)
      .map((node) => `${node.path}(child=${node.childCount}, rendered=${node.renderedChildren})`)
      .join(', ');
    throw new Error(`expand icon missing for nodes: ${detail}`);
  }
}

async function expandDomPath(socket, watchers, path) {
  const waitPromise = waitForEvent(
    socket,
    watchers,
    (evt) => evt.topic === 'ui.graph.domExpanded' && evt.payload?.path === path,
    `expand ${path}`,
    15000,
  );
  socket.send(JSON.stringify({ topic: 'ui.graph.expandDom', payload: { path } }));
  await waitPromise;
}

async function autoExpandGraph(socket, watchers, initialReport) {
  let report = initialReport;
  const expanded = new Set();
  for (let i = 0; i < MAX_AUTO_EXPAND_PATHS; i += 1) {
    const next = (report.domNodes || []).find(
      (node) => node.path !== 'root' && node.canExpand && !expanded.has(node.path),
    );
    if (!next) break;
    expanded.add(next.path);
    console.log('[dev-driver] auto expand dom node', next.path);
    await expandDomPath(socket, watchers, next.path);
    report = await requestGraphReport(socket, watchers, `post-expand:${next.path}`);
    validateGraphReport(report);
  }
  return report;
}

main().catch((err) => {
  console.error('[dev-driver] failed', err);
  process.exit(1);
});
