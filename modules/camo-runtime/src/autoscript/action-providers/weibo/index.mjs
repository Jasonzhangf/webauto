import { asErrorPayload } from '../../container/runtime-core/utils.mjs';

export function isWeiboAutoscriptAction(action) {
  const normalized = String(action || '').trim();
  return normalized.startsWith('weibo_');
}

export async function executeWeiboAutoscriptOperation({
  profileId,
  action,
  params = {},
  operation = null,
  context = {},
}) {
  return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported weibo operation: ${action}`);
}
