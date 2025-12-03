#!/usr/bin/env node
import WebSocket from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContainerRegistry } from '../../../dist/services/browser-service/ContainerRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return fallback;
}

const sessionId = arg('--session', 'default');
const targetUrl = arg('--url', 'https://weibo.com');
const wsHost = arg('--ws-host', '127.0.0.1');
const wsPort = Number(arg('--ws-port', '8765'));
const containerId = arg('--container', 'weibo_main_page');

async function main() {
  console.log(`[health] checking session=${sessionId} url=${targetUrl}`);
  const matchRes = await sendWsCommand({
    type: 'command',
    session_id: sessionId,
    data: {
      command_type: 'container_operation',
      action: 'match_root',
      page_context: { url: targetUrl },
    },
  });

  if (matchRes?.data?.success) {
    const matched = matchRes.data.data?.matched_container || matchRes.data.data?.container;
    console.log(`[health] container matched: ${matched?.name || matched?.id}`);
    process.exit(0);
  }

  console.warn('[health] container match failed:', matchRes?.data?.error || matchRes?.error);
  await dumpSelectorDiagnostics();
  process.exit(2);
}

async function dumpSelectorDiagnostics() {
  try {
    const registry = new ContainerRegistry();
    const containers = registry.getContainersForUrl(targetUrl);
    const container = containers[containerId];
    if (!container) {
      console.warn(`[health] container ${containerId} not found in registry`);
      return;
    }
    const selectors = container.selectors?.map((selector) => selector.css || selector.id).filter(Boolean) || [];
    console.log('[health] selectors used:', selectors);
    for (const selector of selectors) {
      await inspectSelector(selector);
    }
    await dumpDomInfo();
  } catch (err) {
    console.warn('[health] failed to load registry:', err);
  }
}

async function inspectSelector(selector) {
  try {
    const res = await sendWsCommand({
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'node_execute',
        node_type: 'query',
        parameters: {
          selector,
          max_items: 2,
        },
      },
    });
    console.log(`[health] selector ${selector} ->`, res?.data);
  } catch (err) {
    console.warn(`[health] selector ${selector} query failed:`, err?.message || String(err));
  }
}

async function dumpDomInfo() {
  const res = await sendWsCommand({
    type: 'command',
    session_id: sessionId,
    data: {
      command_type: 'node_execute',
      node_type: 'dom_info',
      parameters: {},
    },
  }).catch(() => null);
  if (res?.data?.success) {
    console.log('[health] dom_info snippet:', JSON.stringify(res.data.data, null, 2).slice(0, 4000));
  } else {
    console.log('[health] dom_info unavailable');
  }
}

function sendWsCommand(payload) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://${wsHost}:${wsPort}`;
    const socket = new WebSocket(wsUrl);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error('health-check timeout'));
    }, 15000);

    socket.on('open', () => {
      socket.send(JSON.stringify(payload));
    });
    socket.on('message', (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data.toString('utf-8')));
      } catch (err) {
        reject(err);
      } finally {
        socket.close();
      }
    });
    socket.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}

main().catch((err) => {
  console.error('[health] failed:', err?.message || String(err));
  process.exit(2);
});
