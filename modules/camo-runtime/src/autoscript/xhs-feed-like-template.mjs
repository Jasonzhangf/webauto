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

  const searchOps = buildXhsSearchOperations({ ...options, detailLoopEnabled: false });
  const filteredSearchOps = searchOps.filter(op => op.id !== 'verify_subscriptions_all_pages');

  // keywords: 最多 4 个，不足则有多少用多少，超过截断
  const rawKeywords = options.keywords || [];
  const keywords = Array.isArray(rawKeywords)
    ? rawKeywords.slice(0, 4)
    : (typeof rawKeywords === 'string'
        ? rawKeywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 4)
        : []);

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...filteredSearchOps,
    // 单一主操作：内部自行管理 Tab 轮转 + 点赞循环
    ...buildXhsFeedLikeOperations({ ...options, keywords }),
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
