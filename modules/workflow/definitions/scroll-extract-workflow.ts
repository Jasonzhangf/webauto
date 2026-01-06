/**
 * 完整滚动+提取测试 Workflow 定义
 *
 * 组合 blocks 实现端到端数据采集
 */

export const scrollExtractWorkflow = {
  id: 'weibo-scroll-extract',
  name: '微博滚动+提取完整流程',
  steps: [
    {
      blockName: 'StartBrowserService',
      input: {
        host: '127.0.0.1',
        port: 7704,
        wsPort: 8765
      }
    },
    {
      blockName: 'EnsureSession',
      input: {
        profileId: 'weibo_fresh',
        url: 'https://weibo.com',
        serviceUrl: 'http://127.0.0.1:7704'
      }
    },
    {
      blockName: 'InitAutoScroll',
      input: {
        sessionId: '$sessionId',
        scrollStrategy: 'smooth',
        scrollDistance: 800
      }
    },
    {
      blockName: 'ScrollNextBatch',
      input: {
        sessionId: '$sessionId',
        distance: 800,
        behavior: 'smooth'
      }
    },
    {
      blockName: 'WaitStable',
      input: {
        sessionId: '$sessionId',
        checkInterval: 500,
        maxWait: 10000
      }
    },
    {
      blockName: 'MatchContainers',
      input: {
        sessionId: '$sessionId',
        rootSelector: 'body'
      }
    },
    {
      blockName: 'ExtractPostFields',
      input: {
        sessionId: '$sessionId',
        containerSelector: '[class*="Feed_retweeted"]',
        index: 0
      }
    },
    {
      blockName: 'ValidateExtract',
      input: {
        fields: '$fields',
        requiredFields: ['author', 'content']
      }
    }
  ]
};
