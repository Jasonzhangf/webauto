/**
 * 小红书关键词完整采集 Workflow v3（Phase2 + Phase3/4 一体编排）
 *
 * 流程：
 * - EnsureSession / EnsureLogin
 * - WaitSearchPermit + GoToSearch（对话框搜索，避免 URL 直达）
 * - XiaohongshuFullCollectBlock：列表 → 详情 → 评论 → 持久化（~/.webauto/download）
 */

export const xiaohongshuFullCollectWorkflowV3 = {
  id: 'xiaohongshu-collect-full-v3',
  name: '小红书关键词完整采集（Phase3/4 编排）',
  steps: [
    {
      blockName: 'EnsureSession',
      input: {
        profileId: '$sessionId',
        url: 'https://www.xiaohongshu.com',
      },
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
        enableOcr: true,
        ocrLanguages: '$ocrLanguages',
        ocrConcurrency: 1,
      },
    },
    {
      blockName: 'OrganizeXhsNotesBlock',
      input: {
        platform: 'xiaohongshu',
        env: '$env',
        keyword: '$keyword',
        ocrLanguages: '$ocrLanguages',
        runOcr: false,
      },
    },
  ],
};
