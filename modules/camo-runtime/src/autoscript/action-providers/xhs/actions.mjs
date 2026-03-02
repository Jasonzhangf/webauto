import { handleRaiseError } from './auth-ops.mjs';
import { executeAssertLoggedInOperation } from './auth-ops.mjs';
import { executeSubmitSearchOperation } from './collect-ops.mjs';
import { executeOpenDetailOperation, executeCloseDetailOperation } from './detail-flow-ops.mjs';
import { executeDetailHarvestOperation, executeExpandRepliesOperation, executeCommentsHarvestOperation, executeCommentMatchOperation, executeCommentLikeOperation, executeCommentReplyOperation } from './harvest-ops.mjs';
import { executeTimeoutSnapshotOperation } from './diagnostic-ops.mjs';

export const XHS_ACTION_HANDLERS = {
  raise_error: handleRaiseError,
  xhs_assert_logged_in: executeAssertLoggedInOperation,
  xhs_submit_search: executeSubmitSearchOperation,
  xhs_open_detail: executeOpenDetailOperation,
  xhs_detail_harvest: executeDetailHarvestOperation,
  xhs_expand_replies: executeExpandRepliesOperation,
  xhs_comments_harvest: executeCommentsHarvestOperation,
  xhs_comment_match: executeCommentMatchOperation,
  xhs_comment_like: executeCommentLikeOperation,
  xhs_comment_reply: executeCommentReplyOperation,
  xhs_close_detail: executeCloseDetailOperation,
  xhs_timeout_snapshot: executeTimeoutSnapshotOperation,
};
