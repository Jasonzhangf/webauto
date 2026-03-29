/**
 * Weibo search operations — re-exports from the actual implementations.
 *
 * The canonical search extraction logic lives in:
 *   apps/webauto/entry/lib/weibo-search-extract.mjs
 *   apps/webauto/entry/lib/weibo-collect-runner.mjs
 *
 * This module provides the architecture-level entry point expected by FLOW.md
 * under action-providers/weibo/.
 */

export { extractSearchPage } from '../../../../../../apps/webauto/entry/lib/weibo-search-extract.mjs';
