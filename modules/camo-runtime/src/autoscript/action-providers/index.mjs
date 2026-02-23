import { executeXhsAutoscriptOperation, isXhsAutoscriptAction } from './xhs.mjs';

export async function executeAutoscriptAction({
  profileId,
  action,
  params = {},
  operation = null,
  context = {},
}) {
  if (isXhsAutoscriptAction(action)) {
    return executeXhsAutoscriptOperation({
      profileId,
      action,
      params,
      operation,
      context,
    });
  }
  return null;
}
