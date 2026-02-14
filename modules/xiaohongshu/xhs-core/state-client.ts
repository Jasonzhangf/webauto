// modules/xiaohongshu/xhs-core/state-client.ts
// State client factory and utilities for Xiaohongshu modules

import { StateClient as BaseStateClient, createStateClient as createBaseClient } from '../../../sharedmodule/state-client.mjs';
import type { StateClientOptions } from '../../../sharedmodule/state-client.mjs';
import type { XhsCollectOptions, XhsCollectResult } from './types.js';

// Re-export the base StateClient class
export { StateClient } from '../../../sharedmodule/state-client.mjs';

/**
 * Create a state client for a Xiaohongshu collection run
 */
export function createXhsStateClient(
  runId: string,
  options: XhsCollectOptions,
  phase?: string
): BaseStateClient {
  return createBaseClient({
    runId,
    profileId: options.profileId,
    keyword: options.keyword,
    phase: phase as any,
    apiUrl: 'http://127.0.0.1:7701',
  });
}

/**
 * Push collection result to state
 */
export async function pushCollectResult(
  client: BaseStateClient,
  result: XhsCollectResult
): Promise<void> {
  await client.updateProgress(result.processed, result.total);
  await client.updateStats({
    notesProcessed: result.processed,
    ...(result.links?.length ? { commentsCollected: 0 } : {}),
  });
  await client.pushEvent('xhs:collect:done', {
    processed: result.processed,
    total: result.total,
    failed: result.failed,
    linksCount: result.links?.length || 0,
    notesCount: result.notes?.length || 0,
  });
  if (result.error) {
    await client.markFailed(result.error.message);
  } else if (result.processed >= result.total) {
    await client.markCompleted();
  }
}

// Default export
export default {
  createXhsStateClient,
  pushCollectResult,
};
