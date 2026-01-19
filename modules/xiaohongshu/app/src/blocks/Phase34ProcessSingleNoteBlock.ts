/**
 * Phase 3-4 Block: 处理单条笔记（详情 + 评论）
 *
 * 职责：
 * - 打开详情页（使用 safeUrl）
 * - 提取详情内容
 * - 采集评论（支持分批）
 * - 持久化结果
 */

import { execute as openDetail } from './Phase34OpenDetailBlock.js';
import { execute as extractDetail } from './Phase34ExtractDetailBlock.js';
import { execute as collectComments } from './Phase34CollectCommentsBlock.js';
import { execute as persistDetail } from './Phase34PersistDetailBlock.js';

export interface ProcessSingleNoteInput {
  noteId: string;
  safeUrl: string;
  searchUrl: string;
  keyword: string;
  env?: string;
  profile?: string;
  unifiedApiUrl?: string;
  maxCommentRounds?: number;
  commentBatchSize?: number;
}

export interface ProcessSingleNoteOutput {
  success: boolean;
  noteId: string;
  detail: any;
  comments: any[];
  noteDir?: string;
  readmePath?: string;
  error?: string;
}

export async function execute(input: ProcessSingleNoteInput): Promise<ProcessSingleNoteOutput> {
  const {
    noteId,
    safeUrl,
    searchUrl,
    keyword,
    env = 'download',
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
    maxCommentRounds = 50,
    commentBatchSize = 50,
  } = input;

    console.log(`[Phase34ProcessSingleNote] 开始处理: ${noteId}`);

  try {
    // 1. 打开详情页
    await openDetail({ noteId, safeUrl, profile, unifiedApiUrl });

    // 2. 提取详情内容
    const detailResult = await extractDetail({ noteId, profile, unifiedApiUrl });
    if (!detailResult.success) {
      throw new Error(`提取详情失败: ${detailResult.error || 'unknown'}`);
    }

    // 3. 采集评论
    const commentsResult = await collectComments({
      sessionId: profile,
      maxRounds: maxCommentRounds,
      batchSize: commentBatchSize,
      unifiedApiUrl,
    });

    // 4. 持久化详情
    const persistResult = await persistDetail({
      noteId,
      detail: detailResult.detail || {},
      keyword,
      env,
      unifiedApiUrl,
    });

    console.log(`[Phase34ProcessSingleNote] ✅ 完成: ${noteId}`);

    return {
      success: true,
      noteId,
      detail: detailResult.detail || null,
      comments: commentsResult.comments,
      noteDir: persistResult.noteDir,
      readmePath: persistResult.readmePath,
    };
  } catch (err: any) {
    console.error(`[Phase34ProcessSingleNote] ❌ 失败: ${noteId}`, err.message);
    return {
      success: false,
      noteId,
      detail: null,
      comments: [],
      error: err.message,
    };
  }
}
