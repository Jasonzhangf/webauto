/**
 * 小红书 Phase3/4 Workflow v3（基于 Phase2 links）
 *
 * 流程：
 * - XiaohongshuCollectFromLinksBlock：按 phase2-links.jsonl 逐条新开详情 tab → 详情+评论 → 落盘
 *   - 评论：rotate4（每 tab 50 条，开满 4 个后循环）
 */

export const xiaohongshuPhase34FromLinksWorkflowV3 = {
  id: 'xiaohongshu-phase34-from-links-v3',
  name: '小红书 Phase3/4（从 Phase2 links 采集详情+评论）',
  steps: [
    {
      blockName: 'XiaohongshuCollectFromLinksBlock',
      input: {
        sessionId: '$sessionId',
        keyword: '$keyword',
        env: '$env',
        targetCount: '$targetCount',
        targetCountMode: '$targetCountMode',
        maxComments: '$maxComments',
      },
    },
  ],
};

