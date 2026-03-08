import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserWsServer } from './ws-server.js';

function createServer() {
  const fakeSessionManager = {
    getSession() {
      return {};
    },
  };
  return new BrowserWsServer({ sessionManager: fakeSessionManager as any });
}

test('rejects legacy selector actions in node_execute', async () => {
  const server = createServer() as any;
  const clickResult = await server.handleNodeExecute('profile-a', {
    command_type: 'node_execute',
    node_type: 'click',
    parameters: { selector: '#submit' },
  });
  const typeResult = await server.handleNodeExecute('profile-a', {
    command_type: 'node_execute',
    node_type: 'type',
    parameters: { selector: '#search', text: 'hello' },
  });

  assert.equal(clickResult.success, false);
  assert.equal(clickResult.code, 'LEGACY_ACTION_DISABLED');
  assert.match(clickResult.error, /node_execute/);
  assert.match(clickResult.error, /mouse:\*/);

  assert.equal(typeResult.success, false);
  assert.equal(typeResult.code, 'LEGACY_ACTION_DISABLED');
  assert.match(typeResult.error, /node_execute/);
  assert.match(typeResult.error, /keyboard:\*/);
});

test('rejects legacy selector actions in user_action.operation', async () => {
  const server = createServer() as any;
  const clickResult = await server.handleUserAction('profile-a', {
    command_type: 'user_action',
    action: 'operation',
    parameters: {
      operation_type: 'click',
      target: { selector: '#submit' },
    },
  });
  const typeResult = await server.handleUserAction('profile-a', {
    command_type: 'user_action',
    action: 'operation',
    parameters: {
      operation_type: 'type',
      target: { selector: '#search' },
      text: 'hello',
    },
  });

  assert.equal(clickResult.success, false);
  assert.equal(clickResult.code, 'LEGACY_ACTION_DISABLED');
  assert.match(clickResult.error, /user_action\.operation/);

  assert.equal(typeResult.success, false);
  assert.equal(typeResult.code, 'LEGACY_ACTION_DISABLED');
  assert.match(typeResult.error, /user_action\.operation/);
});

test('tears down runtime bridge after unsubscribe removes last runtime topic', async () => {
  let unsubscribed = false;
  const fakeSessionManager = {
    getSession() {
      return {
        addRuntimeEventObserver() {
          return () => {
            unsubscribed = true;
          };
        },
      };
    },
  };
  const server = new BrowserWsServer({ sessionManager: fakeSessionManager as any }) as any;
  const sent = [] as any[];
  const socket = {
    send(payload: string) {
      sent.push(JSON.parse(payload));
    },
  };

  await server.handleSubscribe(socket, {
    request_id: 'sub-1',
    session_id: 'profile-a',
    data: { topics: ['browser.runtime.event'] },
  });

  assert.equal(unsubscribed, false);

  await server.handleUnsubscribe(socket, {
    request_id: 'unsub-1',
    session_id: 'profile-a',
    data: { topics: ['browser.runtime.event'] },
  });

  assert.equal(unsubscribed, true);
  assert.equal(server.runtimeBridgeUnsub.has('profile-a'), false);
  assert.equal(server.sessionSubscribers.has('profile-a'), false);
  assert.equal(server.socketSessionTopics.has(socket), false);
  assert.equal(sent.at(-1)?.data?.success, true);
});

test('tears down runtime bridge when last subscribed socket closes', async () => {
  let unsubscribed = false;
  const fakeSessionManager = {
    getSession() {
      return {
        addRuntimeEventObserver() {
          return () => {
            unsubscribed = true;
          };
        },
      };
    },
  };
  const server = new BrowserWsServer({ sessionManager: fakeSessionManager as any }) as any;
  const socket = {
    send() {},
  };

  await server.handleSubscribe(socket, {
    request_id: 'sub-2',
    session_id: 'profile-b',
    data: { topics: ['browser.runtime.event.dom_mutation'] },
  });

  server.handleSocketClose(socket);

  assert.equal(unsubscribed, true);
  assert.equal(server.runtimeBridgeUnsub.has('profile-b'), false);
  assert.equal(server.sessionSubscribers.has('profile-b'), false);
  assert.equal(server.socketSessionTopics.has(socket), false);
});
