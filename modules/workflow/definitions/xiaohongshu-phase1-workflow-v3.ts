/**
 * 小红书 Phase1 Workflow v3（仅会话 + 登录）
 *
 * 流程：
 * - EnsureSession（固定高视口，降低第二排误点）
 * - EnsureLoginBlock（容器驱动登录探针）
 */

export const xiaohongshuPhase1WorkflowV3 = {
  id: 'xiaohongshu-phase1-v3',
  name: '小红书 Phase1（会话 + 登录）',
  steps: [
    {
      blockName: 'EnsureSession',
      input: {
        profileId: '$sessionId',
        url: 'https://www.xiaohongshu.com',
        viewport: { width: 1440, height: 2160 },
        headless: '$headless',
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
  ],
};
