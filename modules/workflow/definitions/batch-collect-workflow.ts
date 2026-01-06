/**
 * 批量采集 Workflow 定义
 *
 * 采集150条微博并生成 Markdown
 */

export const batchCollectWorkflow = {
  id: 'weibo-batch-collect-150',
  name: '微博批量采集150条',
  config: {
    targetCount: 150,
    scrollDistance: 800,
    stableWait: 10000,
    outputPath: 'output/weibo/collect-150.md'
  },
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
        profileId: 'weibo_fresh',
        url: 'https://weibo.com'
      }
    },
    {
      blockName: 'InitAutoScroll',
      input: {
        sessionId: '$sessionId',
        scrollDistance: 800
      }
    },
    {
      blockName: 'CollectBatch',
      input: {
        sessionId: '$sessionId',
        targetCount: 150,
        containerSelector: '[class*="Feed_retweated"]',
        scrollDistance: 800,
        stableWait: 10000
      }
    },
    {
      blockName: 'RenderMarkdown',
      input: {
        posts: '$collectedPosts',
        template: 'default'
      }
    },
    {
      blockName: 'SaveFile',
      input: {
        content: '$markdown',
        path: 'output/weibo/collect-150.md'
      }
    }
  ]
};
