import { handleRaiseError } from './auth-ops.mjs';
import { executeAssertLoggedInOperation } from './auth-ops.mjs';
import { executeSubmitSearchOperation, executeCollectLinksOperation } from './collect-ops.mjs';
import { executeWaitSearchPermitOperation } from './search-gate-ops.mjs';
import { executeSwitchTabIfNeeded, pruneExcessTabs } from './tab-ops.mjs';
import { executeOpenDetailOperation, executeCloseDetailOperation } from './detail-flow-ops.mjs';
import { executeDetailHarvestOperation, executeExpandRepliesOperation, executeCommentsHarvestOperation, executeCommentMatchOperation, executeCommentLikeOperation, executeCommentReplyOperation } from './harvest-ops.mjs';
import { executeFeedLikeOperation, executeFeedLikeTabSwitch } from './feed-like-ops.mjs';
import { executeTimeoutSnapshotOperation, executeDebugSnapshotOperation } from './diagnostic-ops.mjs';

export const XHS_ACTION_HANDLERS = {
  raise_error: handleRaiseError,
  xhs_wait_search_permit: executeWaitSearchPermitOperation,
  xhs_assert_logged_in: executeAssertLoggedInOperation,
  xhs_submit_search: executeSubmitSearchOperation,
  xhs_collect_links: executeCollectLinksOperation,
  xhs_tab_switch_if_needed: executeSwitchTabIfNeeded,
  xhs_prune_excess_tabs: pruneExcessTabs,
  xhs_open_detail: executeOpenDetailOperation,
  xhs_detail_harvest: executeDetailHarvestOperation,
  xhs_expand_replies: executeExpandRepliesOperation,
  xhs_comments_harvest: executeCommentsHarvestOperation,
  xhs_comment_match: executeCommentMatchOperation,
  xhs_comment_like: executeCommentLikeOperation,
  xhs_comment_reply: executeCommentReplyOperation,
  xhs_feed_like: executeFeedLikeOperation,
  xhs_feed_like_tab_switch: executeFeedLikeTabSwitch,
  xhs_close_detail: executeCloseDetailOperation,
  xhs_timeout_snapshot: executeTimeoutSnapshotOperation,
  xhs_debug_snapshot: executeDebugSnapshotOperation,
};
