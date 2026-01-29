/**
 * 小红书 Phase2 Workflow v3（搜索 + 链接采集）
 *
 * 流程：
 * - WaitSearchPermit（SearchGate）
 * - GoToSearch（对话框搜索，禁止 URL 直达）
 * - XiaohongshuCollectLinksBlock（点击采集安全链接，searchUrl 严格一致）
 */

export const xiaohongshuPhase2LinksWorkflowV3 = {
  id: 'xiaohongshu-phase2-links-v3',
  name: '小红书 Phase2（搜索 + 链接采集）',
  steps: [
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
        env: '$env',
      },
    },
    {
      blockName: 'XiaohongshuCollectLinksBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        env: '$env',
        targetCount: '$targetCount',
        targetCountMode: '$targetCountMode',
      },
    },
  ],
};
