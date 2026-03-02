import { asErrorPayload } from '../../container/runtime-core/utils.mjs';
import { getProfileState } from './xhs/state.mjs';
import { XHS_ACTION_HANDLERS } from './xhs/actions.mjs';

export function isXhsAutoscriptAction(action) {
  const normalized = String(action || '').trim();
  return normalized === 'raise_error' || normalized.startsWith('xhs_');
}

export async function executeXhsAutoscriptOperation({
  profileId,
  action,
  params = {},
  operation = null,
  context = {},
}) {
  const handler = XHS_ACTION_HANDLERS[action];
  if (!handler) {
    return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported xhs operation: ${action}`);
  }
  try {
    return await handler({ profileId, params, operation, context });
  } catch (err) {
    const message = String(err?.message || err || '');
    if (message.includes('forbidden_js_action')) {
      return asErrorPayload('JS_DISABLED', message);
    }
    return asErrorPayload('OPERATION_FAILED', message);
  }
}

export function __unsafe_getProfileStateForTests(profileId) {
  return getProfileState(profileId);
}
