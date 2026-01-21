/**
 * 小红书采集 Workflow 定义
 */

export const xiaohongshuCollectWorkflow = {
  id: 'xiaohongshu-collect',
  name: '小红书关键词采集（已迁移到 v3 安全链路）',
  steps: [
    {
      blockName: 'StartBrowserService',
      input: {
        host: '127.0.0.1',
        port: 7704
      }
    },
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
        checkIntervalMs: 5000,
      },
    },
    {
      blockName: 'WaitSearchPermitBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
      },
    },
    {
      blockName: 'GoToSearchBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
      },
    },
    {
      blockName: 'XiaohongshuFullCollectBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        env: '$env',
        targetCount: '$targetCount',
        maxWarmupRounds: '$maxWarmupRounds',
        allowClickCommentButton: '$allowClickCommentButton',
      },
    },
  ]
};
