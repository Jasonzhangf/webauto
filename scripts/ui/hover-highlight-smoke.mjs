#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import WebSocket from 'ws';

const PROFILE_ID = process.env.WEBAUTO_UI_TEST_PROFILE || 'weibo-fresh';
const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:8790';
const LOG_PATH = path.join(os.homedir(), '.webauto', 'logs', 'highlight-debug.log');
const DOM_CHANNEL = 'hover-dom';
const CONTAINER_CHANNEL = 'hover-container';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function parseHighlightEntries() {
  if (!fs.existsSync(LOG_PATH)) {
    return [];
  }
  let raw = '';
  try {
    raw = fs.readFileSync(LOG_PATH, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return raw
    .split(/\n+/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function filterHighlightEntries(entries, sinceMs) {
  return entries.filter((entry) => {
    const ts = Date.parse(entry.ts || entry.timestamp || entry.time || '');
    if (!Number.isFinite(ts) || ts < sinceMs) {
      return false;
    }
    if (entry.sessionId && entry.sessionId !== PROFILE_ID) {
      return false;
    }
    return true;
  });
}

async function waitForHighlightLogEvent({ channel, event }, sinceMs, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = filterHighlightEntries(parseHighlightEntries(), sinceMs);
    const match = entries.find((entry) => entry.event === event && entry.channel === channel);
    if (match) {
      return match;
    }
    await delay(200);
  }
  throw new Error(`highlight log missing ${event} for ${channel}`);
}

function createBusClient(url) {
  const socket = new WebSocket(url);
  const watchers = new Set();
  socket.on('message', (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }
    watchers.forEach((handler) => {
      try {
        if (handler(event)) {
          watchers.delete(handler);
        }
      } catch {
        watchers.delete(handler);
      }
    });
  });
  socket.on('error', (err) => {
    console.warn('[hover-smoke] bus socket error:', err?.message || err);
  });
  const opened = new Promise((resolve, reject) => {
    const onOpen = () => {
      socket.off('error', onError);
      resolve();
    };
    const onError = (err) => {
      socket.off('open', onOpen);
      reject(err);
    };
    socket.once('open', onOpen);
    socket.once('error', onError);
  });
  return opened.then(() => ({
    socket,
    waitForEvent(predicate, label, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          watchers.delete(handler);
          reject(new Error(`timeout: ${label}`));
        }, timeoutMs);
        const handler = (event) => {
          try {
            if (predicate(event)) {
              clearTimeout(timeout);
              resolve(event);
              return true;
            }
          } catch {
            /* ignore handler errors */
          }
          return false;
        };
        watchers.add(handler);
      });
    },
  }));
}

async function requestGraphReport(client, label) {
  const waitPromise = client.waitForEvent(
    (event) => event?.topic === 'ui.graph.report',
    `graph report (${label})`,
    15000,
  );
  client.socket.send(JSON.stringify({ topic: 'ui.graph.requestReport', payload: { source: label } }));
  const evt = await waitPromise;
  return evt?.payload || {};
}

async function waitForGraphReport(client, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const report = await requestGraphReport(client, 'hover-smoke');
    if ((report?.domCount || 0) > 0) {
      return report;
    }
    await delay(500);
  }
  throw new Error('graph snapshot unavailable');
}

function selectDomPath(report) {
  const nodes = Array.isArray(report?.domNodes) ? report.domNodes : [];
  const preferred = nodes.find((node) => node?.path && node.path !== 'root' && node.visible);
  const fallback = nodes.find((node) => node?.path);
  return preferred?.path || fallback?.path || null;
}

function selectContainerId(report) {
  const stats = Array.isArray(report?.containerCoverage?.stats) ? report.containerCoverage.stats : [];
  const candidate = stats.find((entry) => entry?.containerId) || null;
  return candidate?.containerId || report?.rootId || null;
}

async function hoverCycle({ socket }, descriptor, targetValue) {
  const requestStart = Date.now() - 50;
  socket.send(JSON.stringify({ topic: descriptor.topic, payload: descriptor.buildPayload(targetValue) }));
  await waitForHighlightLogEvent({ channel: descriptor.channel, event: 'request' }, requestStart);
  await waitForHighlightLogEvent({ channel: descriptor.channel, event: 'result' }, requestStart);
  const clearStart = Date.now() - 10;
  socket.send(JSON.stringify({ topic: descriptor.topic, payload: descriptor.buildPayload(null) }));
  await waitForHighlightLogEvent({ channel: descriptor.channel, event: 'clear' }, clearStart);
}

async function main() {
  if (!PROFILE_ID) {
    throw new Error('WEBAUTO_UI_TEST_PROFILE 未设置');
  }
  console.log('[hover-smoke] connecting bus', BUS_URL);
  const client = await createBusClient(BUS_URL);
  try {
    const report = await waitForGraphReport(client);
    const domPath = selectDomPath(report);
    const containerId = selectContainerId(report);
    if (!domPath) {
      throw new Error('未找到可用 DOM 节点路径');
    }
    if (!containerId) {
      throw new Error('未找到可用容器 ID');
    }
    console.log('[hover-smoke] dom target:', domPath);
    await hoverCycle(client, {
      topic: 'ui.graph.hoverDom',
      channel: DOM_CHANNEL,
      buildPayload: (value) => ({ path: value }),
    }, domPath);
    console.log('[hover-smoke] hover-dom cycle ok');
    console.log('[hover-smoke] container target:', containerId);
    await hoverCycle(client, {
      topic: 'ui.graph.hoverContainer',
      channel: CONTAINER_CHANNEL,
      buildPayload: (value) => ({ containerId: value }),
    }, containerId);
    console.log('[hover-smoke] hover-container cycle ok');
  } finally {
    try {
      client.socket.close();
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('[hover-smoke] failed', err?.message || err);
  process.exit(1);
});
