export const DEFAULT_UI_HEARTBEAT_TIMEOUT_MS = 5 * 60_000;

export type WatchdogAction = 'none' | 'kill_runs' | 'stop_core_services';

export type WatchdogDecision = {
  action: WatchdogAction;
  nextHandled: boolean;
  reason:
    | 'healthy'
    | 'already_handled'
    | 'stale_ui_alive'
    | 'stale_ui_unavailable_with_runs'
    | 'stale_ui_unavailable_idle';
};

export type WatchdogInput = {
  staleMs: number;
  timeoutMs: number;
  alreadyHandled: boolean;
  runCount: number;
  uiOperational: boolean;
};

export function resolveUiHeartbeatTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(String(env.WEBAUTO_UI_HEARTBEAT_TIMEOUT_MS || '').trim(), 10);
  if (Number.isFinite(raw) && raw >= 30_000 && raw <= 60 * 60_000) {
    return raw;
  }
  return DEFAULT_UI_HEARTBEAT_TIMEOUT_MS;
}

export function decideWatchdogAction(input: WatchdogInput): WatchdogDecision {
  if (input.staleMs <= input.timeoutMs) {
    return { action: 'none', nextHandled: false, reason: 'healthy' };
  }

  if (input.alreadyHandled) {
    return { action: 'none', nextHandled: true, reason: 'already_handled' };
  }

  if (input.uiOperational) {
    return { action: 'none', nextHandled: true, reason: 'stale_ui_alive' };
  }

  if (input.runCount > 0) {
    return { action: 'kill_runs', nextHandled: true, reason: 'stale_ui_unavailable_with_runs' };
  }

  return { action: 'stop_core_services', nextHandled: true, reason: 'stale_ui_unavailable_idle' };
}
