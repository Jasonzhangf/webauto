/**
 * Phase 3-4 Block: 处理单条笔记（详情 + 评论）
 *
 * 职责：
 * - 打开详情页（使用 safeUrl）
 * - 提取详情内容
 * - 采集评论（支持分批）
 * - 持久化结果
 * - 返回搜索页
 */

import { execute as openDetail } from './Phase34OpenDetailBlock.js';
import { execute as extractDetail } from './Phase34ExtractDetailBlock.js';
import { execute as collectComments } from './Phase34CollectCommentsBlock.js';
import { execute as persistDetail } from './Phase34PersistDetailBlock.js';
import { execute as closeDetail } from './Phase34CloseDetailBlock.js';

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
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ProcessSingleNoteOutput {
  success: boolean;
  noteId: string;
  detail: any;
  comments: any[];
  noteDir?: string;
  readmePath?: string;
  error?: string;
  retryCount?: number;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(errorMessage)));
      })
    ]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
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
    timeoutMs = 180000,
    maxRetries = 2,
  } = input;

    console.log(`[Phase34ProcessSingleNote] 开始处理: ${noteId}`);

  let retryCount = 0;
  let lastError: string | undefined;

  for (retryCount = 0; retryCount <= maxRetries; retryCount++) {
    if (retryCount > 0) {
      console.log(`[Phase34ProcessSingleNote] 重试 ${retryCount}/${maxRetries}: ${noteId}`);
      await delay(2000);
    }

    try {
      // 1. 打开详情页（带超时）
      await withTimeout(
        openDetail({ noteId, safeUrl, profile, unifiedApiUrl }),
        30000,
        '打开详情页超时'
      );

      // 2. 提取详情内容（带超时）
      const detailResult = await withTimeout(
        extractDetail({ noteId, profile, unifiedApiUrl }),
        30000,
        '提取详情超时'
      );
      if (!detailResult.success) {
        throw new Error(`提取详情失败: ${detailResult.error || 'unknown'}`);
      }

      // 3. 采集评论（带超时）
      const commentsResult = await withTimeout(
        collectComments({
          sessionId: profile,
          maxRounds: maxCommentRounds,
          batchSize: commentBatchSize,
          unifiedApiUrl,
        }),
        timeoutMs,
        '采集评论超时'
      );

      // 4. 持久化详情（带超时）
      const persistResult = await withTimeout(
        persistDetail({
          noteId,
          detail: detailResult.detail || {},
          keyword,
          env,
          unifiedApiUrl,
        }),
        60000,
        '持久化详情超时'
      );

      // 5. 返回搜索页（无论成功失败都要返回）
      try {
        await closeDetail({ profile, unifiedApiUrl });
        await delay(1000);
      } catch (err: any) {
        console.warn(`[Phase34ProcessSingleNote] 返回搜索页失败: ${err.message}`);
      }

      console.log(`[Phase34ProcessSingleNote] ✅ 完成: ${noteId} (重试${retryCount}次)`);

      return {
        success: true,
        noteId,
        detail: detailResult.detail || null,
        comments: commentsResult.comments,
        noteDir: persistResult.noteDir,
        readmePath: persistResult.readmePath,
        retryCount,
      };
    } catch (err: any) {
      lastError = err.message;
      console.error(`[Phase34ProcessSingleNote] ❌ 尝试${retryCount + 1}失败: ${noteId}`, err.message);

      // 失败也要返回搜索页
      try {
        await closeDetail({ profile, unifiedApiUrl });
        await delay(1000);
      } catch (closeErr: any) {
        console.warn(`[Phase34ProcessSingleNote] 返回搜索页失败: ${closeErr.message}`);
      }

      if (retryCount >= maxRetries) {
        break;
      }
    }
  }

  return {
    success: false,
    noteId,
    detail: null,
    comments: [],
    error: lastError || '未知错误',
    retryCount,
  };
}
