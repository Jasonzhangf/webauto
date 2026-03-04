import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsDetailOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
  buildXhsTabPoolOperation,
} from './xhs-autoscript-ops.mjs';
import { buildXhsCollectOperations } from './xhs-autoscript-collect.mjs';

export function buildXhsUnifiedAutoscript(rawOptions = {}) {
  const { options, base } = buildXhsAutoscriptBase(rawOptions, {
    name: 'xhs-unified-harvest-autoscript',
    source: 'scripts/xiaohongshu/phase-unified-harvest.mjs',
  });

  const operations = [
    ...buildXhsBootstrapOperations(options),
    ...buildXhsSearchOperations(options),
    ...buildXhsTabPoolOperation(options),
    ...buildXhsCollectOperations(options),
    ...buildXhsDetailOperations(options),
    ...buildXhsGuardOperations(options),
  ];

  return {
    ...base,
    operations,
  };
}
