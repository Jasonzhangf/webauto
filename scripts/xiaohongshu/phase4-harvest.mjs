#!/usr/bin/env node
/**
 * Phase 3-4 - 详情与评论采集
 *
 * 功能：
 * - 读取 Phase2 采集的安全链接
 * - 校验链接有效性（xsec_token + 关键字匹配）
 * - 循环处理每条链接：
 *   - 打开详情页
 *   - 提取详情内容（标题、正文、作者、图片）
 *   - 采集评论（支持分批）
 *   - 持久化结果
 *   - 返回搜索页继续下一条
 *
 * 用法：
 *   node scripts/xiaohongshu/phase3-4-collect.mjs --keyword "手机膜" --env debug
 */

import { resolveKeyword, resolveEnv, PROFILE } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as validateLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ValidateLinksBlock.js';
import { execute as processSingleNote } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ProcessSingleNoteBlock.js';
import { mergeNotesMarkdown } from '../../dist/modules/workflow/blocks/helpers/mergeXhsMarkdown.js';

function nowMs() {
  return Date.now();
}

function formatDurationMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return `${process.env.HOME}/${p.slice(2)}`;
  return p;
}

async function readJsonl(filePath) {
  const { readFile } = await import('node:fs/promises');
  try {
    const content = await readFile(filePath, 'utf8');
    return content.trim().split('\n').filter(Boolean).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function main() {
  const keyword = resolveKeyword();
  const env = resolveEnv();

  // 初始化日志
  const runContext = initRunLogging({ env, keyword, logMode: 'single' });

  console.log(`📝 Phase 3-4: 详情与评论采集 [runId: ${runContext.runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`环境: ${env}`);

  // 获取会话锁
  const lock = createSessionLock({ profileId: PROFILE, lockType: 'phase34' });
  const acquired = lock.acquire();

  if (!acquired) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    process.exit(1);
  }

  try {
    emitRunEvent('phase34_start', { keyword, env });

    const t0 = nowMs();
    emitRunEvent('phase34_timing', { stage: 'start', t0 });

    // 1. 校验链接
    console.log(`\n🔍 步骤 1: 校验链接...`);
    const tValidate0 = nowMs();
    const validateResult = await validateLinks({ keyword, env });
    const tValidate1 = nowMs();
    console.log(`⏱️  校验耗时: ${formatDurationMs(tValidate1 - tValidate0)}`);
    emitRunEvent('phase34_timing', { stage: 'validate_done', ms: tValidate1 - tValidate0 });

    if (!validateResult.success) {
      throw new Error(`链接校验失败: ${validateResult.error}`);
    }

    const validLinks = validateResult.links || [];
    console.log(`✅ 有效链接: ${validLinks.length} 条`);

    if (validLinks.length === 0) {
      console.log('⚠️  没有有效链接，请先运行 Phase2 采集链接');
      process.exit(0);
    }

    // 2. 循环处理每条链接
    console.log(`\n📝 步骤 2: 采集详情与评论...`);
    const results = [];
    const errors = [];

    for (let i = 0; i < validLinks.length; i++) {
      const link = validLinks[i];
      const progress = `[${i + 1}/${validLinks.length}]`;

      console.log(`\n${progress} 处理: ${link.noteId}`);

      const tNote0 = nowMs();
      const result = await processSingleNote({
        noteId: link.noteId,
        safeUrl: link.safeUrl,
        searchUrl: link.searchUrl,
        keyword,
        env,
        maxCommentRounds: 50,
        commentBatchSize: 50,
      });
      const tNote1 = nowMs();

      console.log(`⏱️  耗时: ${formatDurationMs(tNote1 - tNote0)}`);

      if (result.success) {
        results.push(result);
        console.log(`✅ ${progress} 成功`);
      } else {
        errors.push({ noteId: link.noteId, error: result.error });
        console.log(`❌ ${progress} 失败: ${result.error}`);
      }

      emitRunEvent('phase34_note_done', {
        index: i,
        total: validLinks.length,
        noteId: link.noteId,
        success: result.success,
        ms: tNote1 - tNote0,
      });
    }

    // 3. 汇总
    const t1 = nowMs();
    const totalMs = t1 - t0;
    console.log(`\n⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    emitRunEvent('phase34_timing', { stage: 'done', ms: totalMs, count: results.length });

    console.log(`\n📊 采集结果：`);
    console.log(`   成功: ${results.length} 条`);
    console.log(`   失败: ${errors.length} 条`);

    if (errors.length > 0) {
      console.log(`\n❌ 失败列表：`);
      errors.forEach((e, i) => {
        console.log(`   ${i + 1}. ${e.noteId}: ${e.error}`);
      });
    }

    const mergeResult = await mergeNotesMarkdown({
      platform: 'xiaohongshu',
      env,
      keyword,
    });
    if (mergeResult.success) {
      console.log(`\n📄 合并 Markdown 完成: ${mergeResult.outputPath} (notes=${mergeResult.mergedNotes})`);
    } else {
      console.warn(`\n⚠️ 合并 Markdown 跳过: ${mergeResult.error}`);
    }

    console.log(`\n✅ Phase 3-4 完成`);
    emitRunEvent('phase34_done', { success: results.length, failed: errors.length });

  } catch (err) {
    emitRunEvent('phase34_error', { error: safeStringify(err) });
    console.error('\n❌ Phase 3-4 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    lock.release();
  }
}

main();
