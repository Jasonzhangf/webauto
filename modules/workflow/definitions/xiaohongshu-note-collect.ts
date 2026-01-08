/**
 * 小红书单条笔记采集 Workflow（离线仿真版）
 *
 * 约定：
 * - 详情页（或仿真详情页）已在当前 session 中打开，并匹配 xiaohongshu_detail.modal_shell；
 * - 不负责打开/关闭详情，只做提取评论 + 持久化；
 * - 适用于基于本地仿真 HTML 的离线回放测试。
 */

export const xiaohongshuNoteCollectWorkflow = {
  id: 'xiaohongshu-note-collect',
  name: '小红书单条笔记采集（离线仿真）',
  steps: [
    {
      blockName: 'AnchorVerificationBlock',
      input: {
        sessionId: '$sessionId',
        containerId: 'xiaohongshu_detail.modal_shell',
        operation: 'enter',
      },
    },
    {
      blockName: 'ExtractDetailBlock',
      input: {
        sessionId: '$sessionId',
      },
    },
    {
      blockName: 'CollectCommentsBlock',
      input: {
        sessionId: '$sessionId',
      },
    },
    {
      blockName: 'PersistXhsNoteBlock',
      input: {
        sessionId: '$sessionId',
        env: '$env',
        platform: 'xiaohongshu',
        keyword: '$keyword',
        noteId: '$noteId',
        detailUrl: '$detailUrl',
        // 由 ExtractDetailBlock / CollectCommentsBlock 写入的上下文字段
        detail: '$detail',
        commentsResult: '$comments',
      },
    },
  ],
};

