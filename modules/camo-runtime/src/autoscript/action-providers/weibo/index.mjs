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

  // ============================================
  // 特别关注监控功能（新增）
  // ============================================

  if (normalized === 'weibo_special_follow_discover' || normalized === 'weibo_discover_special_follow') {
    const { discoverSpecialFollowGroup } = await import('./discover-special-follow.mjs');
    return discoverSpecialFollowGroup(profileId);
  }

  if (normalized === 'weibo_special_follow_link_extract' || normalized === 'weibo_extract_special_follow_link') {
    const { extractSpecialFollowLink } = await import('./discover-special-follow.mjs');
    return extractSpecialFollowLink(profileId);
  }

  if (normalized === 'weibo_page_state_check' || normalized === 'weibo_check_page_state') {
    const { checkPageState } = await import('./discover-special-follow.mjs');
    return checkPageState(profileId);
  }

  if (normalized === 'weibo_user_list_extract' || normalized === 'weibo_extract_user_list') {
    const { extractCompleteUserList } = await import('./extract-user-list.mjs');
    const autoScroll = params.autoScroll !== false;
    const maxScrolls = params.maxScrolls || 100;
    return extractCompleteUserList(profileId, { autoScroll, maxScrolls });
  }

  if (normalized === 'weibo_user_list_scroll' || normalized === 'weibo_scroll_user_list') {
    const { scrollToLoadAllUsers } = await import('./extract-user-list.mjs');
    const maxScrolls = params.maxScrolls || 50;
    const stallRounds = params.stallRounds || 3;
    return scrollToLoadAllUsers(profileId, { maxScrolls, stallRounds });
  }

  if (normalized === 'weibo_user_list_has_more_check' || normalized === 'weibo_check_user_list_has_more') {
    const { checkHasMoreUsers } = await import('./extract-user-list.mjs');
    return checkHasMoreUsers(profileId);
  }

  // ============================================
  // 新帖检测功能（新增）
  // ============================================

  if (normalized === 'weibo_user_posts_fetch' || normalized === 'weibo_fetch_user_posts') {
    const { fetchUserLatestPosts } = await import('./detect-new-posts.mjs');
    const uid = params.uid;
    if (!uid) return asErrorPayload('MISSING_UID', 'Missing uid parameter');
    return fetchUserLatestPosts(profileId, uid);
  }

  if (normalized === 'weibo_new_posts_check' || normalized === 'weibo_check_new_posts') {
    const { checkForNewPosts } = await import('./detect-new-posts.mjs');
    const uid = params.uid;
    const lastWeiboId = params.lastWeiboId || null;
    if (!uid) return asErrorPayload('MISSING_UID', 'Missing uid parameter');
    return checkForNewPosts(profileId, uid, lastWeiboId);
  }

  if (normalized === 'weibo_new_posts_batch_check' || normalized === 'weibo_batch_check_new_posts') {
    const { batchCheckForNewPosts } = await import('./detect-new-posts.mjs');
    const users = params.users || [];
    if (!users.length) return asErrorPayload('MISSING_USERS', 'Missing users parameter');
    const delayMs = params.delayMs || 5000;
    return batchCheckForNewPosts(profileId, users, { delayMs });
  }

  if (normalized === 'weibo_risk_control_check' || normalized === 'weibo_check_risk_control') {
    const { checkRiskControl } = await import('./detect-new-posts.mjs');
    return checkRiskControl(profileId);
  }

  return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported weibo operation: ${action}`);
}
