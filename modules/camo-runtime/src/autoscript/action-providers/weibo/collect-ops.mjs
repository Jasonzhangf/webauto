/**
 * Weibo collect operations — re-exports from the actual implementations.
 *
 * The canonical collect runner and verify logic lives in:
 *   apps/webauto/entry/lib/weibo-collect-runner.mjs
 *   apps/webauto/entry/lib/weibo-collect-verify.mjs
 *
 * This module provides the architecture-level entry point expected by FLOW.md
 * under action-providers/weibo/.
 */

export { runWeiboCollect, getWeiboCollectHelpLines } from '../../../../../../apps/webauto/entry/lib/weibo-collect-runner.mjs';
export { readCollectedLinksCount, assertCollectedLinksCount, verifyUniqueness } from '../../../../../../apps/webauto/entry/lib/weibo-collect-verify.mjs';
