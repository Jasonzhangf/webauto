/**
 * 小红书关键词采集 Workflow v2（容器驱动版）
 * 
 * 新增：
 * - WaitSearchPermitBlock：在执行搜索前先向 SearchGate 申请许可
 */

export const xiaohongshuCollectWorkflowV2 = {
  id: 'xiaohongshu-collect-v2',
  name: '小红书关键词采集（容器驱动版）',
  steps: [
    {
      blockName: 'EnsureSession',
      input: {
        profileId: '$sessionId',
        url: 'https://www.xiaohongshu.com'
      }
    },
    {
      blockName: 'EnsureLoginBlock',
      input: {
        sessionId: '$sessionId',
        maxWaitMs: 180000,
        checkIntervalMs: 5000
      }
    },
    {
      blockName: 'WaitSearchPermitBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
      }
    },
    {
      blockName: 'GoToSearchBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword'
      }
    },
    {
      blockName: 'CollectSearchListBlock',
      input: {
        sessionId: '$sessionId',
        targetCount: '$targetCount'
      }
    },
    {
      blockName: 'OpenDetailBlock',
      input: {
        sessionId: '$sessionId',
        containerId: '$firstItemContainerId'
      }
    },
    {
      blockName: 'ExtractDetailBlock',
      input: {
        sessionId: '$sessionId'
      }
    },
    {
      blockName: 'WarmupCommentsBlock',
      input: {
        sessionId: '$sessionId',
        maxRounds: 8
      }
    },
    {
      blockName: 'ExpandCommentsBlock',
      input: {
        sessionId: '$sessionId'
      }
    },
    {
      blockName: 'CloseDetailBlock',
      input: {
        sessionId: '$sessionId'
      }
    }
  ]
};
