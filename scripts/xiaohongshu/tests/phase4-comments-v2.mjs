#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase 4: 评论展开验证（Workflow 版）
 *
 * 目标：
 * - 在当前详情页上，通过 CollectCommentsBlock 走完整的
 *   WarmupCommentsBlock（预热滚动+展开）+ ExpandCommentsBlock（提取）链路
 * - 不再在脚本里写任何 DOM 操作，仅做 Block 编排和结果打印
 */

import minimist from 'minimist';
import { execute as collectComments } from '../../../modules/workflow/blocks/CollectCommentsBlock.ts';
import { execute as verifyAnchor } from '../../../modules/workflow/blocks/AnchorVerificationBlock.ts';

const UNIFIED_API = 'http://127.0.0.1:7701';

async function main() {
  const args = minimist(process.argv.slice(2));
  const sessionId = args.sessionId || args.session || 'xiaohongshu_fresh';
  const serviceUrl = args.serviceUrl || UNIFIED_API;

  console.log('💬 Phase 4: 评论展开验证（Workflow 版）\n');
  console.log(`Session: ${sessionId}\n`);

  try {
    // 1. 验证当前处于详情页（modal_shell 锚点）
    console.log('1️⃣ 验证详情页锚点 (xiaohongshu_detail.modal_shell)...');
    const detailAnchor = await verifyAnchor({
      sessionId,
      containerId: 'xiaohongshu_detail.modal_shell',
      operation: 'enter',
      serviceUrl,
    });

    if (!detailAnchor.success) {
      console.error(
        `   ❌ 详情锚点验证失败: ${detailAnchor.error || 'unknown'}（请确认当前在详情 modal 页面）`,
      );
      process.exit(1);
    }

    if (detailAnchor.rect) {
      const r = detailAnchor.rect;
      console.log(
        `   ✅ 详情 modal Rect: x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, w=${r.width.toFixed(
          1,
        )}, h=${r.height.toFixed(1)}`,
      );
    }

    // 2. 调用 CollectCommentsBlock：内部完成 Warmup + Expand
    console.log('\n2️⃣ 执行 CollectCommentsBlock（Warmup + Expand）...');
    const result = await collectComments({
      sessionId,
      serviceUrl,
    });

    if (!result.success) {
      console.error(
        `   ❌ CollectCommentsBlock 失败: ${result.error || 'unknown error'}`,
      );
      if (result.anchor?.commentSectionRect) {
        const r = result.anchor.commentSectionRect;
        console.log(
          `   ℹ️ comment_section Rect (fallback): x=${r.x.toFixed(
            1,
          )}, y=${r.y.toFixed(1)}, w=${r.width.toFixed(1)}, h=${r.height.toFixed(1)}`,
        );
      }
      process.exit(1);
    }

    const totalFromHeader =
      typeof result.totalFromHeader === 'number' ? result.totalFromHeader : null;
    const commentsCount = Array.isArray(result.comments)
      ? result.comments.length
      : 0;

    console.log('\n3️⃣ 结果统计');
    console.log(
      `   ✅ Warmup 轮次: ${result.warmupCount}，header 总数: ${
        totalFromHeader !== null ? totalFromHeader : '未知'
      }`,
    );
    console.log(
      `   ✅ 实际抓取评论数: ${commentsCount}，reachedEnd=${result.reachedEnd ? '是' : '否'}，emptyState=${
        result.emptyState ? '是' : '否'
      }`,
    );

    if (result.anchor?.commentSectionRect) {
      const r = result.anchor.commentSectionRect;
      console.log(
        `   ℹ️ comment_section Rect: x=${r.x.toFixed(1)}, y=${r.y.toFixed(
          1,
        )}, w=${r.width.toFixed(1)}, h=${r.height.toFixed(1)}`,
      );
    }

    if (result.anchor?.sampleCommentRect) {
      const r = result.anchor.sampleCommentRect;
      console.log(
        `   ℹ️ sample comment Rect: x=${r.x.toFixed(1)}, y=${r.y.toFixed(
          1,
        )}, w=${r.width.toFixed(1)}, h=${r.height.toFixed(1)}`,
      );
    }

    if (totalFromHeader !== null && commentsCount < totalFromHeader) {
      console.log(
        `   ⚠️ 抓取条数 (${commentsCount}) 小于 header 总数 (${totalFromHeader})，后续可针对 WarmupCommentsBlock 的循环策略进一步调优。`,
      );
    }

    // 4. 打印少量示例评论，确认字段齐全（用户名 / 用户ID / 文本）
    if (commentsCount > 0) {
      const sampleSize = Math.min(5, commentsCount);
      console.log(`\n4️⃣ 示例评论（前 ${sampleSize} 条）：`);
      for (let i = 0; i < sampleSize; i += 1) {
        const c = result.comments[i] || {};
        console.log(
          `   - ${c.user_name || c.username || '未知用户'} (${c.user_id || 'no-id'})：${(c.text || '').slice(
            0,
            60,
          )}`,
        );
      }
    } else {
      console.log('\n4️⃣ 当前页面未抓到任何评论（可能为空评论页或锚点配置有误）');
    }

    console.log('\n✅ Phase 4（Workflow 版）完成');
  } catch (error) {
    console.error('❌ 错误:', error && error.message ? error.message : error);
    process.exit(1);
  }
}

main();
