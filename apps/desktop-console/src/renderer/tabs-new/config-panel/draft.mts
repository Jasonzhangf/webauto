import type { ConfigPanelLayout } from './layout.mts';
import type { ConfigPanelState } from './types.mts';
import { DEFAULT_MAX_NOTES } from './types.mts';
import { readNumber } from './helpers.mts';

export function createDraftPersistence(ctx: any, ui: ConfigPanelLayout, state: ConfigPanelState) {
  function buildDraftConfig() {
    return {
      keyword: ui.keywordInput.value.trim(),
      target: readNumber(ui.targetInput, DEFAULT_MAX_NOTES, 1),
      env: ui.envSelect.value as 'debug' | 'prod',
      fetchBody: ui.fetchBodyCb.checked,
      fetchComments: ui.fetchCommentsCb.checked,
      maxComments: readNumber(ui.maxCommentsInput, 0),
      autoLike: ui.autoLikeCb.checked,
      likeKeywords: ui.likeKeywordsInput.value.trim(),
      maxLikes: readNumber(ui.maxLikesInput, 0),
      headless: ui.headlessCb.checked,
      dryRun: ui.dryRunCb.checked,
      lastProfileId: ui.accountSelect.value || undefined,
    };
  }

  function queueDraftSave() {
    if (state.saveTimeout) clearTimeout(state.saveTimeout);
    state.saveTimeout = setTimeout(async () => {
      try {
        await ctx.api.configSaveLast(buildDraftConfig());
      } catch {
        // keep UI workflow running even if draft persistence fails
      }
    }, 400);
  }

  return {
    buildDraftConfig,
    queueDraftSave,
  };
}
