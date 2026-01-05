/**
 * 小红书采集 Workflow 定义
 */

export const xiaohongshuCollectWorkflow = {
  id: 'xiaohongshu-collect',
  name: '小红书关键词采集',
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
      blockName: 'XiaohongshuCrawlerBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        targetCount: '$targetCount',
        maxNoNew: 10,
        serviceUrl: 'http://127.0.0.1:7701'
      }
    }
  ]
};
