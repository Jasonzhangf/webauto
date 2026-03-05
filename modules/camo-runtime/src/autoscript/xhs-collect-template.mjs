import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
} from './xhs-autoscript-ops.mjs';
import { buildXhsCollectOperations } from './xhs-autoscript-collect.mjs';

export function buildXhsCollectAutoscript(rawOptions = {}) {
  const stage = rawOptions.stage ? String(rawOptions.stage || '').trim().toLowerCase() : 'links';
  const { options, base } = buildXhsAutoscriptBase({
    ...rawOptions,
    stage: stage || 'links',
  }, {
    name: 'xhs-collect-links-autoscript',
    source: 'scripts/xiaohongshu/phase2-collect.mjs',
  });

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...buildXhsSearchOperations(options),
    ...buildXhsCollectOperations(options),
    ...buildXhsGuardOperations(options),
  ];

  return {
    ...base,
    operations,
  };
}
