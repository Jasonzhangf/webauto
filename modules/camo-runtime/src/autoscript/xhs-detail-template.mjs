import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsDetailOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
  buildXhsTabPoolOperation,
} from './xhs-autoscript-ops.mjs';

export function buildXhsDetailAutoscript(rawOptions = {}) {
  const stage = rawOptions.stage ? String(rawOptions.stage || '').trim().toLowerCase() : 'detail';
  const { options, base } = buildXhsAutoscriptBase({
    ...rawOptions,
    stage: stage || 'detail',
  }, {
    name: 'xhs-detail-harvest-autoscript',
    source: 'scripts/xiaohongshu/phase3-detail.mjs',
  });

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...buildXhsTabPoolOperation(options),
    ...buildXhsDetailOperations(options),
    ...buildXhsGuardOperations(options),
  ];

  return {
    ...base,
    operations,
  };
}
