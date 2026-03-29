import { executeXhsAutoscriptOperation, isXhsAutoscriptAction } from './xhs.mjs';
import { executeWeiboAutoscriptOperation, isWeiboAutoscriptAction } from './weibo/index.mjs';

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
  if (isWeiboAutoscriptAction(action)) {
    return executeWeiboAutoscriptOperation({
      profileId,
      action,
      params,
      operation,
      context,
    });
  }
  return null;
}
