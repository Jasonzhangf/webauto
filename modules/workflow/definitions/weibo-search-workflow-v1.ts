/**
 * 微博搜索工作流 v1
 *
 * 流程：
 * 1) 执行搜索
 * 2) 采集搜索结果链接（支持翻页）
 * 3) 从链接采集详情内容和评论
 */

export const weiboSearchWorkflowV1 = {
  id: 'weibo-search-v1',
  name: '微博搜索采集 v1',
  steps: [
    {
      blockName: 'ExecuteWeiboSearchBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        env: '$env',
        serviceUrl: '$serviceUrl',
      },
    },
    {
      blockName: 'WeiboCollectSearchLinksBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        env: '$env',
        targetCount: '$targetCount',
        maxPages: '$maxPages',
        serviceUrl: '$serviceUrl',
      },
    },
    {
      blockName: 'WeiboCollectFromLinksBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        env: '$env',
        targetCount: '$targetCount',
        maxComments: '$maxComments',
        collectComments: '$collectComments',
        serviceUrl: '$serviceUrl',
      },
    },
  ],
};
