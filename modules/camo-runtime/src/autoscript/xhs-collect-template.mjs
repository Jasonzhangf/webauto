import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
  buildXhsTabPoolOperation,
} from './xhs-autoscript-ops.mjs';
import { buildXhsCollectOperations } from './xhs-autoscript-collect.mjs';

export function buildXhsCollectAutoscript(rawOptions = {}) {
  const stage = rawOptions.stage ? String(rawOptions.stage || '').trim().toLowerCase() : 'links';
  const { options, base } = buildXhsAutoscriptBase({
    ...rawOptions,
    stage: stage || 'links',
  }, {
    name: 'xhs-collect-links-autoscript',
    source: '/Users/fanzhang/Documents/github/webauto/scripts/xiaohongshu/phase2-collect.mjs',
  });

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...buildXhsSearchOperations(options),
    ...buildXhsTabPoolOperation(options),
    ...buildXhsCollectOperations(options),
    ...buildXhsGuardOperations(options),
  ];

  return {
    ...base,
    operations,
  };
}
