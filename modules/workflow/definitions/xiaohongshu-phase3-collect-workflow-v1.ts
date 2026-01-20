/**
 * 小红书 Phase3 采集 Workflow v1（仅详情落盘）
 *
 * 流程：
 * - EnsureSession / EnsureLogin
 * - WaitSearchPermit + GoToSearch（对话框搜索）
 * - XiaohongshuFullCollectBlock(mode=phase3)：列表 → 详情 → 持久化（~/.webauto/download）
 */

export const xiaohongshuPhase3CollectWorkflowV1 = {
  id: 'xiaohongshu-collect-phase3-v1',
  name: '小红书 Phase3 采集（仅详情）',
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
        mode: 'phase3',
      },
    },
  ],
};

