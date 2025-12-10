import { UiController } from './controller.js';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = Number(process.env.WEBAUTO_CONTROLLER_PORT || 8970);
const DEFAULT_HOST = process.env.WEBAUTO_CONTROLLER_HOST || '127.0.0.1';
const repoRoot = process.env.WEBAUTO_REPO_ROOT || path.resolve(__dirname, '../../..');
const userContainerRoot = process.env.WEBAUTO_USER_CONTAINER_ROOT || path.join(os.homedir(), '.webauto', 'container-lib');
const containerIndexPath = process.env.WEBAUTO_CONTAINER_INDEX || path.join(repoRoot, 'container-library.index.json');
const defaultWsHost = process.env.WEBAUTO_WS_HOST || '127.0.0.1';
const defaultWsPort = Number(process.env.WEBAUTO_WS_PORT || 8765);
const defaultHttpHost = process.env.WEBAUTO_BROWSER_HTTP_HOST || '127.0.0.1';
const defaultHttpPort = Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || 7704);
const defaultHttpProtocol = process.env.WEBAUTO_BROWSER_HTTP_PROTO || 'http';
const cliTargets = {
  'browser-control': path.join(repoRoot, 'modules/browser-control/src/cli.ts'),
  'session-manager': path.join(repoRoot, 'modules/session-manager/src/cli.ts'),
  logging: path.join(repoRoot, 'modules/logging/src/cli.ts'),
  operations: path.join(repoRoot, 'modules/operations/src/cli.ts'),
  'container-matcher': path.join(repoRoot, 'modules/container-matcher/src/cli.ts'),
};

const controllerBusClients = new Set();

const controller = new UiController({
  repoRoot,
  userContainerRoot,
  containerIndexPath,
  cliTargets,
  defaultWsHost,
  defaultWsPort,
  defaultHttpHost,
  defaultHttpPort,
  defaultHttpProtocol,
  messageBus: {
    publish: (topic, payload) => {
      broadcastBusEvent(topic, payload);
    },
  },
});

const serverOptions = parseArgs(process.argv.slice(2));
const controllerHost = serverOptions.host || DEFAULT_HOST;
const controllerPort = Number(serverOptions.port || DEFAULT_PORT);

const wss = new WebSocketServer({
  host: controllerHost,
  port: controllerPort,
});

console.log(`[controller] listening on ws://${controllerHost}:${controllerPort}`);

wss.on('connection', (socket) => {
  controllerBusClients.add(socket);
  socket.on('message', (raw) => handleMessage(socket, raw));
  socket.on('close', () => controllerBusClients.delete(socket));
  socket.on('error', () => controllerBusClients.delete(socket));
  safeSend(socket, { type: 'ready' });
});

wss.on('error', (err) => {
  console.error('[controller] server error', err?.stack || err);
  process.exitCode = 1;
});

function broadcastBusEvent(topic, payload) {
  const message = JSON.stringify({ type: 'event', topic, payload });
  controllerBusClients.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  });
}

async function handleMessage(socket, raw) {
  let envelope;
  try {
    envelope = JSON.parse(raw.toString());
  } catch (err) {
    safeSend(socket, {
      type: 'error',
      error: 'Invalid JSON payload',
    });
    return;
  }
  if (!envelope) return;
  console.log('[controller-server] recv', envelope.type || 'unknown', envelope.action || envelope.topic || '');
  if (envelope.type === 'ping') {
    safeSend(socket, { type: 'pong', requestId: envelope.requestId });
    return;
  }
  if (envelope.type === 'action' || envelope.action) {
    const action = envelope.action;
    const payload = envelope.payload || {};
    const requestId = envelope.requestId || envelope.id;
    if (!action) {
      safeSend(socket, {
        type: 'response',
        requestId,
        success: false,
        error: 'Missing action',
      });
      return;
    }
    try {
      const result = await controller.handleAction(action, payload);
      console.log('[controller-server] action result', action, !!result && typeof result);
      safeSend(socket, {
        type: 'response',
        action,
        requestId,
        ...normalizeResult(result),
      });
    } catch (err) {
      console.warn('[controller-server] action failed', action, err?.message || err);
      safeSend(socket, {
        type: 'response',
        action,
        requestId,
        success: false,
        error: err?.message || String(err),
      });
    }
    return;
  }
  safeSend(socket, {
    type: 'error',
    requestId: envelope.requestId,
    error: 'Unsupported message type',
  });
}

function safeSend(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    console.log('[controller-server] send', payload.type, payload.action || payload.topic || '');
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.warn('[controller] send failed', err?.message || err);
  }
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object') {
    return { success: true, data: result };
  }
  if (typeof result.success === 'boolean') {
    return result;
  }
  return { success: true, data: result };
}

function parseArgs(args) {
  const parsed = {};
  args.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, value] = arg.slice(2).split('=');
    if (key === 'port') parsed.port = value;
    if (key === 'host') parsed.host = value;
  });
  return parsed;
}
