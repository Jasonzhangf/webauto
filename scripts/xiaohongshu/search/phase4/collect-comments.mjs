/**
 * Phase4: 评论采集
 */
import { execute as collectCommentsBlock } from '../../../../dist/modules/workflow/blocks/CollectCommentsBlock.js';
import { execute as persistXhsNote } from '../../../../dist/modules/workflow/blocks/PersistXhsNoteBlock.js';
import { browserCommand } from '../lib/browser-helper.mjs';

export async function collectComments(item, logger, env = 'download') {
  const noteId = item.noteId;
  logger.info(`Collecting comments for ${noteId}`);
  
  const result = await collectCommentsBlock({
    sessionId: 'xiaohongshu_fresh',
    maxRounds: 10
  });
  
  if (result.success) {
    logger.info(`Collected ${result.comments?.length || 0} comments`);
    
    // 落盘
    const persistRes = await persistXhsNote({
      sessionId: 'xiaohongshu_fresh',
      env: env,
      platform: 'xiaohongshu',
      keyword: 'unknown', // Orchestrator 传入 keyword 会更好，这里暂时 unknown
      noteId: noteId,
      detailUrl: item.detailUrl || item.safeDetailUrl,
      detail: {}, // Phase3 已提取，但这里无法直接获取 Phase3 结果，除非传入。
                  // 实际上 PersistXhsNoteBlock 支持追加模式，或者我们应该把 Phase3 的结果传进来
      commentsResult: result
    });
    
    if (persistRes.success) {
      logger.info(`Persisted note ${noteId}`);
    } else {
      logger.error(`Failed to persist note ${noteId}: ${persistRes.error}`);
    }
    
  } else {
    logger.warn(`Failed to collect comments: ${result.error}`);
  }
  
  return result;
}
