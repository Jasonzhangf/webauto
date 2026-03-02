import { buildXhsAutoscriptBase } from './xhs-autoscript-base.mjs';
import {
  buildXhsBootstrapOperations,
  buildXhsCollectOperations,
  buildXhsDetailOperations,
  buildXhsGuardOperations,
  buildXhsSearchOperations,
  buildXhsTabPoolOperation,
} from './xhs-autoscript-ops.mjs';

export function buildXhsUnifiedAutoscript(rawOptions = {}) {
  const { options, base } = buildXhsAutoscriptBase(rawOptions, {
    name: 'xhs-unified-harvest-autoscript',
    source: '/Users/fanzhang/Documents/github/webauto/scripts/xiaohongshu/phase-unified-harvest.mjs',
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
