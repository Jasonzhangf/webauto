// modules/xiaohongshu/xhs-orchestrator/index.ts
// Orchestrator for Xiaohongshu collection workflows (webauto-3zm)

import type { XhsCollectOptions, XhsCollectResult } from '../xhs-core/types.js';
import { createXhsStateClient } from '../xhs-core/state-client.js';
import { generateRunId } from '../xhs-core/utils.js';
import { execute as phase2Search } from '../xhs-search/Phase2SearchBlock.js';
import { execute as phase2CollectLinks } from '../xhs-search/Phase2CollectLinksBlock.js';

/**
 * Run Phase2 (search + link collection) for Xiaohongshu
 */
export async function runPhase2(options: XhsCollectOptions): Promise<XhsCollectResult> {
  const runId = generateRunId();
  const stateClient = createXhsStateClient(runId, options, 'phase2');

  try {
    await stateClient.pushEvent('phase2:start', { options });

    // Execute search
    const searchResult = await phase2Search({
      keyword: options.keyword,
      profile: options.profileId,
      unifiedApiUrl: 'http://127.0.0.1:7701',
      stateClient,
    });

    if (!searchResult.success) {
      throw new Error(`Phase2 search failed: finalUrl=${searchResult.finalUrl}`);
    }

    // Execute link collection
    const collectResult = await phase2CollectLinks({
      keyword: options.keyword,
      targetCount: options.target,
      profile: options.profileId,
      env: options.env,
      unifiedApiUrl: 'http://127.0.0.1:7701',
      alreadyCollectedNoteIds: [],
      stateClient,
    });

    const result: XhsCollectResult = {
      runId,
      processed: collectResult.totalCollected,
      total: options.target,
      failed: 0,
      links: collectResult.links.map(l => l.safeUrl),
    };

    await stateClient.pushEvent('phase2:done', result);
    await stateClient.markCompleted();
    return result;
  } catch (error: any) {
    await stateClient.pushEvent('phase2:error', { error: error.message });
    await stateClient.markFailed(error.message);
    return {
      runId,
      processed: 0,
      total: options.target,
      failed: 0,
      error,
    };
  }
}

/**
 * Run Unified harvest (Phase3/4 combined) for Xiaohongshu
 */
export async function runUnified(options: XhsCollectOptions & {
  doComments?: boolean;
  doLikes?: boolean;
  doHomepage?: boolean;
  doImages?: boolean;
  doOcr?: boolean;
  maxComments?: number;
  maxLikes?: number;
  likeKeywords?: string[];
}): Promise<XhsCollectResult> {
  const runId = generateRunId();
  const stateClient = createXhsStateClient(runId, options, 'unified');

  try {
    await stateClient.pushEvent('unified:start', { options });

    // TODO: Call appropriate blocks
    const result: XhsCollectResult = {
      runId,
      processed: 0,
      total: options.target,
      failed: 0,
    };

    await stateClient.pushEvent('unified:done', result);
    await stateClient.markCompleted();
    return result;
  } catch (error: any) {
    await stateClient.pushEvent('unified:error', { error: error.message });
    await stateClient.markFailed(error.message);
    return {
      runId,
      processed: 0,
      total: options.target,
      failed: 0,
      error,
    };
  }
}
