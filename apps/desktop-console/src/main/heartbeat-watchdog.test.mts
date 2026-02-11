import assert from 'node:assert/strict';

import {
  DEFAULT_UI_HEARTBEAT_TIMEOUT_MS,
  decideWatchdogAction,
  resolveUiHeartbeatTimeoutMs,
} from './heartbeat-watchdog.mts';

{
  const d = decideWatchdogAction({
    staleMs: 9_000,
    timeoutMs: 10_000,
    alreadyHandled: false,
    runCount: 2,
    uiOperational: false,
  });
  assert.deepStrictEqual(d, { action: 'none', nextHandled: false, reason: 'healthy' });
}

{
  const d = decideWatchdogAction({
    staleMs: 90_000,
    timeoutMs: 60_000,
    alreadyHandled: false,
    runCount: 3,
    uiOperational: true,
  });
  assert.deepStrictEqual(d, { action: 'none', nextHandled: true, reason: 'stale_ui_alive' });
}

{
  const d = decideWatchdogAction({
    staleMs: 90_000,
    timeoutMs: 60_000,
    alreadyHandled: false,
    runCount: 1,
    uiOperational: false,
  });
  assert.deepStrictEqual(d, { action: 'kill_runs', nextHandled: true, reason: 'stale_ui_unavailable_with_runs' });
}

{
  const d = decideWatchdogAction({
    staleMs: 90_000,
    timeoutMs: 60_000,
    alreadyHandled: false,
    runCount: 0,
    uiOperational: false,
  });
  assert.deepStrictEqual(d, { action: 'stop_core_services', nextHandled: true, reason: 'stale_ui_unavailable_idle' });
}

{
  const d = decideWatchdogAction({
    staleMs: 90_000,
    timeoutMs: 60_000,
    alreadyHandled: true,
    runCount: 9,
    uiOperational: false,
  });
  assert.deepStrictEqual(d, { action: 'none', nextHandled: true, reason: 'already_handled' });
}

{
  assert.equal(resolveUiHeartbeatTimeoutMs({ WEBAUTO_UI_HEARTBEAT_TIMEOUT_MS: '120000' }), 120_000);
  assert.equal(resolveUiHeartbeatTimeoutMs({ WEBAUTO_UI_HEARTBEAT_TIMEOUT_MS: '1000' }), DEFAULT_UI_HEARTBEAT_TIMEOUT_MS);
  assert.equal(resolveUiHeartbeatTimeoutMs({ WEBAUTO_UI_HEARTBEAT_TIMEOUT_MS: 'abc' }), DEFAULT_UI_HEARTBEAT_TIMEOUT_MS);
}
