import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
  buildXhsFeedLikeOperations,
} from './xhs-autoscript-ops.mjs';

export function buildXhsFeedLikeAutoscript(rawOptions = {}) {
  const { options, base } = buildXhsAutoscriptBase(rawOptions, {
    name: 'xhs-feed-like-autoscript',
    source: 'scripts/xiaohongshu/phase-feed-like.mjs',
  });

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...buildXhsSearchOperations(options),
    ...buildXhsFeedLikeOperations(options),
    {
      id: 'finish_after_feed_like',
      action: 'raise_error',
      params: { code: 'AUTOSCRIPT_DONE_FEED_LIKE' },
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
