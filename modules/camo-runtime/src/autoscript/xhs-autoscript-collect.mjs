export function buildXhsCollectOperations(options) {
  const {
    stageLinksEnabled,
    detailLoopEnabled,
    collectIndexStart,
    collectIndexMaxAttempts,
    collectIndexFailurePolicy,
  } = options;

  return [
    {
      id: 'collect_links',
      enabled: stageLinksEnabled,
      action: 'xhs_collect_links',
      params: {
        maxNotes: options.maxNotes,
        collectIndexStart: collectIndexStart ?? 0,
        collectIndexMaxAttempts: collectIndexMaxAttempts ?? 3,
        collectIndexFailurePolicy: collectIndexFailurePolicy || 'retry',
      },
      trigger: 'search_result_item.exist',
      dependsOn: ['submit_search'],
      once: true,
      timeoutMs: options.collectLinksTimeoutMs || null,
      retry: { attempts: 1, backoffMs: 0 },
      validation: {
        mode: 'post',
        post: {
          container: {
            containerId: 'xiaohongshu_search.search_result_item',
            mustExist: true,
            minCount: 1,
          },
        },
      },
      impact: 'script',
      onFailure: 'stop_all',
      checkpoint: {
        containerId: 'xiaohongshu_search.search_result_item',
        targetCheckpoint: 'search_ready',
        recovery: options.recovery,
      },
    },
    {
      id: 'finish_after_collect_links',
      enabled: stageLinksEnabled && !detailLoopEnabled,
      action: 'raise_error',
      params: { code: 'AUTOSCRIPT_DONE_LINKS_COLLECTED' },
      trigger: 'search_result_item.exist',
      dependsOn: ['collect_links'],
      once: true,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'script',
      onFailure: 'stop_all',
      checkpoint: {
        containerId: 'xiaohongshu_search.search_result_item',
        targetCheckpoint: 'search_ready',
        recovery: options.recovery,
      },
    },
  ];
}
