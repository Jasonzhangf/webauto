import { asErrorPayload } from '../../../container/runtime-core/utils.mjs';

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
  const normalized = String(action || '').trim();

  if (normalized === 'weibo_detail_open' || normalized === 'weibo_open_detail') {
    const { executeOpenDetailOperation } = await import('./detail-flow-ops.mjs');
    return executeOpenDetailOperation({ profileId, params });
  }

  if (normalized === 'weibo_detail_close' || normalized === 'weibo_close_detail') {
    const { executeCloseDetailOperation } = await import('./detail-flow-ops.mjs');
    return executeCloseDetailOperation({ profileId, params });
  }

  if (normalized === 'weibo_detail_harvest' || normalized === 'weibo_harvest_detail') {
    const { executeHarvestDetailOperation } = await import('./harvest-ops.mjs');
    return executeHarvestDetailOperation({ profileId, params });
  }

  if (normalized === 'weibo_comments_extract' || normalized === 'weibo_extract_comments') {
    const { extractComments } = await import('./comments-ops.mjs');
    return extractComments(profileId);
  }

  if (normalized === 'weibo_comments_scroll_to_bottom' || normalized === 'weibo_scroll_comments') {
    const { scrollCommentsToBottom } = await import('./comments-ops.mjs');
    return scrollCommentsToBottom(profileId, params);
  }

  if (normalized === 'weibo_detail_snapshot' || normalized === 'weibo_read_detail') {
    const { readDetailSnapshot } = await import('./detail-ops.mjs');
    return readDetailSnapshot(profileId);
  }

  if (normalized === 'weibo_detail_state' || normalized === 'weibo_read_detail_state') {
    const { readDetailState } = await import('./detail-ops.mjs');
    return readDetailState(profileId);
  }


  if (normalized === 'weibo_video_resolve' || normalized === 'weibo_resolve_video') {
    const { extractVideoUrl } = await import('./video-ops.mjs');
    return extractVideoUrl(profileId, params.url);
  }

  if (normalized === 'weibo_detect_platform' || normalized === 'weibo_detect') {
    const { detectPlatform } = await import('./video-ops.mjs');
    return detectPlatform(params.url);
  }
  return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported weibo operation: ${action}`);
}
