#!/usr/bin/env node
/**
 * Phase 5: 小红书 100 条帖子采集（基于 Workflow Blocks）
 *
 * 约束：
 * - 必须复用已有会话：profile = xiaohongshu_fresh（unattached）
 * - 搜索必须走对话框 + SearchGate（WaitSearchPermitBlock + GoToSearchBlock）
 * - 列表 / 详情 / 评论全部走容器驱动 Block
 * - 评论为空的帖子通过 empty_state 容器闭环，视为合法结果
 * - 任务必须支持断点续采（进度持久化 + 去重）
 * - 每阶段必须进入/离开锚点验证（回环校验）
 * - 支持优雅降级和行为随机化（P2 新增）
 */

import minimist from 'minimist';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

import { execute as ensureSession } from '../../../modules/workflow/blocks/EnsureSession.ts';
import { execute as waitSearchPermit } from '../../../modules/workflow/blocks/WaitSearchPermitBlock.ts';
import { execute as goToSearch } from '../../../modules/workflow/blocks/GoToSearchBlock.ts';
import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.ts';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.ts';
import { execute as extractDetail } from '../../../modules/workflow/blocks/ExtractDetailBlock.ts';
import { execute as warmupComments } from '../../../modules/workflow/blocks/WarmupCommentsBlock.ts';
import { execute as expandComments } from '../../../modules/workflow/blocks/ExpandCommentsBlock.ts';
import { execute as closeDetail } from '../../../modules/workflow/blocks/CloseDetailBlock.ts';
import { execute as loginRecovery } from '../../../modules/workflow/blocks/LoginRecoveryBlock.ts';
import { execute as sessionHealth } from '../../../modules/workflow/blocks/SessionHealthBlock.ts';
import { createProgressTracker } from '../../../modules/workflow/blocks/ProgressTracker.ts';
import { execute as verifyAnchor } from '../../../modules/workflow/blocks/AnchorVerificationBlock.ts';
import { execute as errorRecovery } from '../../../modules/workflow/blocks/ErrorRecoveryBlock.ts';
import { retryWithBackoff } from '../../../modules/workflow/blocks/ErrorClassifier.ts';
import { randomDelay } from '../../../modules/workflow/blocks/BehaviorRandomizer.ts';
import { createDetailExtractFallback, createCommentExpandFallback, execute as gracefulFallback } from '../../../modules/workflow/blocks/GracefulFallbackBlock.ts';
import { recordSuccess, recordFailure, execute as monitoring } from '../../../modules/workflow/blocks/MonitoringBlock.ts';

const DEFAULT_PROFILE = 'xiaohongshu_fresh';
const UNIFIED_API = 'http://127.0.0.1:7701';
const DEFAULT_KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.warn(`[Collect100] Failed to create dir ${dir}:`, err.message || err);
  }
}

async function downloadImage(url, baseDir, noteId, index) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const safeNoteId = noteId || 'unknown';
    const filename = `${safeNoteId}_${String(index).padStart(2, '0')}.jpg`;
    const filepath = path.join(baseDir, filename);
    await fs.writeFile(filepath, buf);
    return filepath;
  } catch (err) {
    console.warn(`[Collect100] Image download error for ${url}: ${err.message || err}`);
    return null;
  }
}

async function getCurrentNoteIdFromLocation(profile) {
  try {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile, script: 'location.href' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const href = data?.data?.result || data?.result || '';
    if (typeof href !== 'string' || !href) return null;
    const m = href.match(/\/explore\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function checkSessionHealth(sessionId) {
  const health = await sessionHealth({ sessionId }).catch((e) => ({
    success: false,
    healthy: false,
    checks: {
      browserResponsive: false,
      pageAccessible: false,
      containersMatchable: false
    },
    error: e.message || String(e)
  }));
  return health;
}

async function ensureHealthySession(sessionId) {
  const health = await checkSessionHealth(sessionId);
  if (!health.success || !health.healthy) {
    console.warn('[Collect100] Session unhealthy:', health.error || JSON.stringify(health.checks));
    return false;
  }
  return true;
}

async function verifyStageAnchor(sessionId, containerId, operation) {
  const result = await verifyAnchor({ sessionId, containerId, operation });
  if (!result.success) {
    console.warn(`[Collect100] Anchor verification failed: ${containerId} (${operation})`, result.error);
    return false;
  }
  return true;
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const sessionId = args.sessionId || DEFAULT_PROFILE;
  const targetCount = Number(args.target || 100);
  const keywords = Array.isArray(args.keyword)
    ? args.keyword
    : (args.keyword || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    .length > 0
    ? (args.keyword || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : DEFAULT_KEYWORDS;
  const perSearchMax = Number(args.perSearch || 20);
  const maxSearchRounds = Number(args.maxSearchRounds || 20);

  console.log(
    `🚀 Collect 100 Workflow v2\n  profile=${sessionId}\n  target=${targetCount}\n  keywords=${keywords.join(
      ', ',
    )}\n`,
  );

  // 输出目录
  const dataDir = path.join(repoRoot, 'xiaohongshu_data');
  const imageDir = path.join(repoRoot, 'xiaohongshu_images');
  await ensureDir(dataDir);
  await ensureDir(imageDir);

  // 0. 确保会话存在（不重启浏览器）
  console.log('0️⃣ Ensure session...');
  await ensureSession({
    profileId: sessionId,
    url: 'https://www.xiaohongshu.com',
  }).catch(() => ({}));

  // 1. 登录强制检查 + 自动恢复
  const loginState = await loginRecovery({
    sessionId,
    autoRecover: true,
    maxRetries: 2
  });

  if (!loginState.success || !loginState.loggedIn) {
    console.error('[Collect100] 登录恢复失败:', loginState.error);
    console.error('建议手动运行: node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs');
    process.exit(1);
  }

  // 2. 初始化进度追踪
  const tracker = createProgressTracker(dataDir, sessionId);
  const savedState = await tracker.load();

  let searchRound = 0;
  let keywordIndex = 0;
  const seenNoteIds = new Set();
  const collected = [];

  if (savedState) {
    console.log(`[Collect100] 恢复进度: collected=${savedState.collectedCount}, keywordIndex=${savedState.keywordIndex}`);
    searchRound = savedState.searchRound || 0;
    keywordIndex = savedState.keywordIndex || 0;
    savedState.seenNoteIds?.forEach(id => seenNoteIds.add(id));
  }

  while (collected.length < targetCount && searchRound < maxSearchRounds) {
    const keyword = keywords[keywordIndex % keywords.length];
    keywordIndex += 1;
    searchRound += 1;

    console.log(
      `\n🔄 Search round #${searchRound} keyword="${keyword}" (collected=${collected.length}/${targetCount})`,
    );

    // 随机延迟（行为模拟）
    await randomDelay({ minMs: 500, maxMs: 1500 });

    // 3. 会话健康检查（每轮搜索前）
    const healthy = await ensureHealthySession(sessionId);
    if (!healthy) {
      console.warn('[Collect100] 会话异常，尝试重新检查登录状态...');
      const retryLogin = await loginRecovery({ sessionId, autoRecover: true });
      if (!retryLogin.success || !retryLogin.loggedIn) {
        console.error('[Collect100] 会话恢复失败，终止任务');
        break;
      }
    }

    // 4. SearchGate 授权（带重试）
    const permit = await retryWithBackoff(() => waitSearchPermit({ sessionId }), 2, 5000);
    if (!permit.success || !permit.granted) {
      console.error('[Collect100] WaitSearchPermit failed:', permit.error);
      console.warn('[Collect100] 将等待 60s 后继续下一轮搜索');
      await delay(60000);
      continue;
    }

    // 5. 执行搜索（对话框）
    const startTime = Date.now();
    const searchRes = await goToSearch({ sessionId, keyword });
    if (!searchRes.success) {
      console.error('[Collect100] GoToSearchBlock failed:', searchRes.error);
      recordFailure(sessionId, `Search failed: ${searchRes.error}`);
      await errorRecovery({ sessionId, fromStage: 'search', targetStage: 'home' });
      continue;
    }
    recordSuccess(sessionId, Date.now() - startTime);

    // 5.1 进入锚点验证（搜索结果列表）
    const searchEntered = await verifyStageAnchor(sessionId, 'xiaohongshu_search.search_result_list', 'enter');
    if (!searchEntered) {
      await errorRecovery({ sessionId, fromStage: 'search', targetStage: 'home' });
      continue;
    }

    console.log(
      `   ✅ 搜索完成 url=${searchRes.url} searchExecuted=${searchRes.searchExecuted}`,
    );

    // 6. 收集当前页列表
    const listRes = await collectSearchList({ sessionId, targetCount: perSearchMax });
    if (!listRes.success || !Array.isArray(listRes.items) || listRes.items.length === 0) {
      console.warn(
        `[Collect100] CollectSearchListBlock 无结果: success=${listRes.success}, error=${listRes.error}`,
      );
      continue;
    }

    console.log(
      `   ✅ 本次搜索命中条目: ${listRes.count}（去重前），开始逐条采集详情+评论`,
    );

    for (const item of listRes.items) {
      if (collected.length >= targetCount) break;

      // 6.1 去重检查
      if (item.noteId && seenNoteIds.has(item.noteId)) {
        console.log(`[Collect100] 跳过重复 noteId=${item.noteId}`);
        continue;
      }

      console.log(
        `   ➜ 采集第 ${collected.length + 1}/${targetCount} 条 keyword=${keyword}`,
      );

      // 6.2 打开详情
      const detailStartTime = Date.now();
      const openRes = await openDetail({ sessionId, containerId: item.containerId });
      if (!openRes.success) {
        console.warn('[Collect100] OpenDetailBlock 失败:', openRes.error);
        recordFailure(sessionId, `OpenDetail failed: ${openRes.error}`);
        continue;
      }

      // 6.2.1 进入锚点验证（详情 modal）
      const detailEntered = await verifyStageAnchor(sessionId, 'xiaohongshu_detail.modal_shell', 'enter');
      if (!detailEntered) {
        await errorRecovery({ sessionId, fromStage: 'detail', targetStage: 'search' });
        continue;
      }

      const noteId = await getCurrentNoteIdFromLocation(sessionId);
      if (!noteId) {
        console.warn('[Collect100] 无法从当前 URL 提取 noteId，跳过该条');
        await closeDetail({ sessionId }).catch(() => ({}));
        await errorRecovery({ sessionId, fromStage: 'detail', targetStage: 'search' });
        continue;
      }
      if (seenNoteIds.has(noteId)) {
        console.log(`[Collect100] 跳过重复 noteId=${noteId}`);
        await closeDetail({ sessionId }).catch(() => ({}));
        continue;
      }
      seenNoteIds.add(noteId);

      // 6.3 提取详情（支持优雅降级）
      const detailFallback = createDetailExtractFallback(sessionId);
      const detailRes = await gracefulFallback(detailFallback);
      
      if (!detailRes.success) {
        console.warn('[Collect100] ExtractDetailBlock 失败:', detailRes.error);
      } else if (detailRes.usedFallback) {
        console.warn('[Collect100] ExtractDetailBlock 降级:', detailRes.error);
      }

      const detail = detailRes.result?.detail || {};
      const header = detail.header || {};
      const content = detail.content || {};
      const gallery = detail.gallery || {};

      // 6.4 评论 Warmup + 提取（支持优雅降级）
      const warmupRes = await warmupComments({ sessionId, maxRounds: 8 }).catch((e) => ({
        success: false,
        finalCount: 0,
        totalFromHeader: null,
        error: e.message || String(e),
      }));

      const commentFallback = createCommentExpandFallback(sessionId);
      const commentsRes = await gracefulFallback(commentFallback);

      // 6.5 关闭详情
      await closeDetail({ sessionId }).catch(() => ({}));
      recordSuccess(sessionId, Date.now() - detailStartTime);

      // 6.5.1 离开锚点验证（回搜索列表）
      const detailExited = await verifyStageAnchor(sessionId, 'xiaohongshu_search.search_result_list', 'enter');
      if (!detailExited) {
        await errorRecovery({ sessionId, fromStage: 'detail', targetStage: 'search' });
      }

      const images = Array.isArray(gallery.images) ? gallery.images : [];

      const record = {
        noteId,
        keyword,
        title:
          content.title ||
          header.title ||
          content.text_title ||
          header.note_title ||
          item.title ||
          '',
        author: header.author || header.user_name || header.nickname || '',
        contentText: content.text || content.desc || content.content || '',
        images,
        comments: Array.isArray(commentsRes.result?.comments) ? commentsRes.result.comments : [],
        commentsEmpty: !!commentsRes.result?.emptyState,
        commentsReachedEnd: !!commentsRes.result?.reachedEnd,
        commentsWarmupCount: warmupRes.finalCount ?? 0,
        commentsTotalFromHeader: warmupRes.totalFromHeader ?? null,
      };

      collected.push(record);

      // 6.6 保存进度（每5条）
      if (collected.length % 5 === 0) {
        await tracker.save({
          sessionId,
          keywordIndex,
          searchRound,
          collectedCount: collected.length,
          seenNoteIds: Array.from(seenNoteIds),
          lastKeyword: keyword,
          lastNoteId: noteId
        });
        
        // 监控告警检查
        const monitorRes = await monitoring({
          sessionId,
          metric: 'error_rate',
          windowSize: 20,
          alertThresholds: { errorRate: 0.2 }
        });
        if (monitorRes.alert?.triggered) {
          console.warn(`[Monitor] ⚠️ ${monitorRes.alert.message}`);
        }
      }

      // 6.7 下载图片（随机延迟 + 失败不影响）
      let imgIndex = 0;
      for (const url of images) {
        await randomDelay({ minMs: 200, maxMs: 500 });
        imgIndex += 1;
        await downloadImage(url, imageDir, noteId, imgIndex);
      }
    }

    // 7. 每轮搜索结束后保存进度
    await tracker.save({
      sessionId,
      keywordIndex,
      searchRound,
      collectedCount: collected.length,
      seenNoteIds: Array.from(seenNoteIds),
      lastKeyword: keyword,
      lastNoteId: null
    });
  }

  // 输出结果 JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(
    dataDir,
    `xiaohongshu_collect_${targetCount}_${timestamp}.json`,
  );
  await fs.writeFile(outputPath, JSON.stringify({ collected }, null, 2), 'utf-8');

  console.log(
    `\n✅ Collect 100 完成: 实际采集 ${collected.length} 条，输出文件: ${outputPath}`,
  );

  // 成功完成后清理进度文件
  await tracker.cleanup();
}

main().catch((err) => {
  console.error('[Collect100] Unexpected error:', err);
  process.exit(1);
});
