import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
  buildXhsFeedLikeOperations,
} from './xhs-autoscript-ops.mjs';

export function buildXhsFeedUnlikeAutoscript(rawOptions = {}) {
  const { options, base } = buildXhsAutoscriptBase(rawOptions, {
    name: 'xhs-feed-unlike-autoscript',
    source: 'scripts/xiaohongshu/phase-feed-unlike.mjs',
  });

  const searchOps = buildXhsSearchOperations({ ...options, detailLoopEnabled: false });
  const filteredSearchOps = searchOps.filter(op => op.id !== 'verify_subscriptions_all_pages');

  const rawKeywords = options.keywords || [];
  const keywords = Array.isArray(rawKeywords)
    ? rawKeywords.slice(0, 4)
    : (typeof rawKeywords === 'string'
        ? rawKeywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 4)
        : []);

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...filteredSearchOps,
    ...buildXhsFeedLikeOperations({ ...options, keywords, actionMode: 'unlike' }),
    {
      id: 'finish_after_feed_unlike',
      action: 'raise_error',
      params: { code: 'AUTOSCRIPT_DONE_FEED_UNLIKE' },
      trigger: 'manual',
      dependsOn: ['feed_like_round'],
      once: true,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'script',
      onFailure: 'stop_all',
    },
    ...buildXhsGuardOperations(options),
  ];

  return {
    ...base,
    operations,
  };
}

