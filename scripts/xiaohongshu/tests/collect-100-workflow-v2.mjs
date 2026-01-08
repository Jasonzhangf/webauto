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
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';

import { execute as ensureSession } from '../../../modules/workflow/blocks/EnsureSession.ts';
import { execute as waitSearchPermit } from '../../../modules/workflow/blocks/WaitSearchPermitBlock.ts';
import { execute as goToSearch } from '../../../modules/workflow/blocks/GoToSearchBlock.ts';
import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.ts';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.ts';
import { execute as extractDetail } from '../../../modules/workflow/blocks/ExtractDetailBlock.ts';
import { execute as collectComments } from '../../../modules/workflow/blocks/CollectCommentsBlock.ts';
import { execute as closeDetail } from '../../../modules/workflow/blocks/CloseDetailBlock.ts';
import { execute as loginRecovery } from '../../../modules/workflow/blocks/LoginRecoveryBlock.ts';
import { execute as sessionHealth } from '../../../modules/workflow/blocks/SessionHealthBlock.ts';
import { createProgressTracker, ProgressTracker } from '../../../modules/workflow/blocks/ProgressTracker.ts';
import { execute as verifyAnchor } from '../../../modules/workflow/blocks/AnchorVerificationBlock.ts';
import { execute as errorRecovery } from '../../../modules/workflow/blocks/ErrorRecoveryBlock.ts';
import { retryWithBackoff, getRecoveryAction } from '../../../modules/workflow/blocks/ErrorClassifier.ts';
import { randomDelay } from '../../../modules/workflow/blocks/BehaviorRandomizer.ts';
import { createDetailExtractFallback, createCommentExpandFallback, execute as gracefulFallback } from '../../../modules/workflow/blocks/GracefulFallbackBlock.ts';
import { recordSuccess, recordFailure, execute as monitoring } from '../../../modules/workflow/blocks/MonitoringBlock.ts';
import { execute as persistXhsNote } from '../../../modules/workflow/blocks/PersistXhsNoteBlock.ts';
import { execute as recordFixture } from '../../../modules/workflow/blocks/RecordFixtureBlock.ts';

const DEFAULT_PROFILE = 'xiaohongshu_fresh';
const UNIFIED_API = 'http://127.0.0.1:7701';
const DEFAULT_KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const homeDir = os.homedir();

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.warn(`[Collect100] Failed to create dir ${dir}:`, err.message || err);
  }
}

async function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getCurrentNoteInfo(profile) {
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
    const noteId = m ? m[1] : null;
    return noteId ? { noteId, url: href } : null;
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

function sanitizeForPath(name) {
  if (!name) return '';
  return name.replace(/[\\/:"*?<>|]+/g, '_').trim();
}

async function runPhase1IfNeeded(sessionId) {
  // 当前 Phase1 脚本内部固定使用 DEFAULT_PROFILE，这里主要用来统一登录 + SearchGate
  if (sessionId !== DEFAULT_PROFILE) {
    console.warn(
      `[Collect100] 当前脚本以 sessionId=${sessionId} 运行，但 Phase1 仅支持 profile=${DEFAULT_PROFILE}，将仍然调用 Phase1 以保证登录态。`,
    );
  }
  const phase1Script = path.join(
    repoRoot,
    'scripts',
    'xiaohongshu',
    'tests',
    'phase1-session-login-with-gate.mjs',
  );
  console.log('0️⃣ Phase1: 启动/复用会话 + 登录 + SearchGate');

  await new Promise((resolve, reject) => {
    const child = spawn('node', [phase1Script], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Phase1 脚本退出码 ${code}`));
      }
    });
  });
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
  const env = args.env || 'debug';

  console.log(
    `🚀 Collect 100 Workflow v2\n  profile=${sessionId}\n  target=${targetCount}\n  keywords=${keywords.join(
      ', ',
    )}\n  env=${env}\n`,
  );

  // 输出根目录（统一采用 ~/.webauto/download/xiaohongshu/{env}）
  const platform = 'xiaohongshu';
  const baseDownloadDir = path.join(homeDir, '.webauto', 'download', platform, env);
  await ensureDir(baseDownloadDir);

  // 0. Phase1：启动/复用会话 + 登录 + SearchGate（包含主页导航）
  await runPhase1IfNeeded(sessionId);

  // 2. 初始化进度追踪
  const tracker = createProgressTracker(baseDownloadDir, sessionId);
  const savedState = await tracker.load();

  let searchRound = 0;
  let keywordIndex = 0;
  const seenKeys = new Set();
  const collected = [];

  if (savedState) {
    console.log(`[Collect100] 恢复进度: collected=${savedState.collectedCount}, keywordIndex=${savedState.keywordIndex}`);
    searchRound = savedState.searchRound || 0;
    keywordIndex = savedState.keywordIndex || 0;
    const keys = savedState.seenKeys && savedState.seenKeys.length > 0
      ? savedState.seenKeys
      : savedState.seenNoteIds?.map((noteId) => ProgressTracker.makeDedupeKey(noteId)) || [];
    keys.forEach((k) => seenKeys.add(k));
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
    const permit = await retryWithBackoff(
      () => waitSearchPermit({ sessionId }),
      2,
      5000,
      'search',
    );
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
      await errorRecovery({
        sessionId,
        fromStage: 'search',
        targetStage: 'home',
        recoveryMode: 'navigate',
      });
      continue;
    }
    recordSuccess(sessionId, Date.now() - startTime);

    // 5.1 进入锚点验证（搜索结果列表）
    const searchEntered = await verifyStageAnchor(
      sessionId,
      'xiaohongshu_search.search_result_list',
      'enter',
    );
    if (!searchEntered) {
      await errorRecovery({
        sessionId,
        fromStage: 'search',
        targetStage: 'home',
        recoveryMode: 'navigate',
      });
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
      const dedupeKey = ProgressTracker.makeDedupeKey(item.noteId || '', item.containerId);
      if (item.noteId && seenKeys.has(dedupeKey)) {
        console.log(`[Collect100] 跳过重复 noteId=${item.noteId} containerId=${item.containerId}`);
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
      const detailEntered = await verifyStageAnchor(
        sessionId,
        'xiaohongshu_detail.modal_shell',
        'enter',
      );
      if (!detailEntered) {
        await errorRecovery({
          sessionId,
          fromStage: 'detail',
          targetStage: 'search',
          recoveryMode: 'esc',
        });
        continue;
      }

      const noteInfo = await getCurrentNoteInfo(sessionId);
      if (!noteInfo || !noteInfo.noteId) {
        console.warn('[Collect100] 无法从当前 URL 提取 noteId，跳过该条');
        await closeDetail({ sessionId }).catch(() => ({}));
        await errorRecovery({
          sessionId,
          fromStage: 'detail',
          targetStage: 'search',
          recoveryMode: 'esc',
        });
        continue;
      }
      const noteId = noteInfo.noteId;
      const detailUrl = noteInfo.url;
      const detailKey = ProgressTracker.makeDedupeKey(noteId, item.containerId);
      if (seenKeys.has(detailKey)) {
        console.log(`[Collect100] 跳过重复 noteId=${noteId} containerId=${item.containerId}`);
        await closeDetail({ sessionId }).catch(() => ({}));
        continue;
      }
      seenKeys.add(detailKey);

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

      // 6.4 评论采集（Warmup + Expand 由 CollectCommentsBlock 统一完成）
      const commentsRes = await collectComments({ sessionId }).catch((e) => ({
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: 0,
        totalFromHeader: null,
        error: e.message || String(e),
      }));

      // 6.4.1 评论阶段错误处理：使用 ErrorClassifier 细化恢复策略
      if (!commentsRes.success) {
        const recovery = getRecoveryAction(commentsRes.error, 'comment');
        console.warn(
          `[Collect100] 评论阶段错误 (${recovery.action}): ${recovery.suggestion}`,
        );

        // 优先确保详情关闭，避免停留在异常状态
        await closeDetail({ sessionId }).catch(() => ({}));

        if (recovery.action === 'ABORT_TASK') {
          console.error('[Collect100] 评论错误被判定为系统性，终止任务');
          break;
        }

        if (recovery.action === 'SKIP_ITEM') {
          console.warn('[Collect100] 跳过本条 note，继续下一条');
          continue;
        }

        if (recovery.action === 'GRACEFUL_DEGRADE') {
          // 标记为降级：保留详情，评论为空数组但继续写盘
          console.warn('[Collect100] 以降级模式继续，详情仍会写盘，评论视为部分缺失');
          commentsRes.comments = [];
        }
      }

      // 6.5 关闭详情
      await closeDetail({ sessionId }).catch(() => ({}));
      recordSuccess(sessionId, Date.now() - detailStartTime);

      // 6.5.1 离开锚点验证（回搜索列表）
      const detailExited = await verifyStageAnchor(
        sessionId,
        'xiaohongshu_search.search_result_list',
        'enter',
      );
      if (!detailExited) {
        await errorRecovery({
          sessionId,
          fromStage: 'detail',
          targetStage: 'search',
          recoveryMode: 'esc',
        });
      }

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
        comments: Array.isArray(commentsRes.comments) ? commentsRes.comments : [],
        commentsEmpty: !!commentsRes.emptyState,
        commentsReachedEnd: !!commentsRes.reachedEnd,
        commentsWarmupCount: commentsRes.warmupCount ?? 0,
        commentsTotalFromHeader: commentsRes.totalFromHeader ?? null,
        url: detailUrl,
      };

      collected.push(record);

      // 6.6 按统一规则持久化到 ~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
      const persistRes = await persistXhsNote({
        sessionId,
        env,
        platform,
        keyword,
        noteId,
        detailUrl,
        detail,
        commentsResult: commentsRes,
      });
      if (!persistRes.success) {
        console.warn(
          `[Collect100] PersistXhsNoteBlock 失败 noteId=${noteId}:`,
          persistRes.error,
        );
      }

      // 6.6.1 可选：录制 fixture 供离线仿真使用
      if (args.recordFixture) {
        const fixtureData = {
          noteId,
          keyword,
          detailUrl,
          detail,
          commentsResult: commentsRes,
        };
        const fixtureRes = await recordFixture({
          platform,
          category: 'note',
          id: noteId,
          data: fixtureData,
        });
        if (!fixtureRes.success) {
          console.warn(
            `[Collect100] RecordFixtureBlock 失败 noteId=${noteId}:`,
            fixtureRes.error,
          );
        } else {
          console.log(`[Collect100] Fixture recorded: ${fixtureRes.path}`);
        }
      }

      // 6.9 保存进度（每5条）
      if (collected.length % 5 === 0) {
        await tracker.save({
          sessionId,
          keywordIndex,
          searchRound,
          collectedCount: collected.length,
          seenNoteIds: [],
          seenKeys: Array.from(seenKeys),
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

    }

    // 7. 每轮搜索结束后保存进度
    await tracker.save({
      sessionId,
      keywordIndex,
      searchRound,
      collectedCount: collected.length,
      seenNoteIds: [],
      seenKeys: Array.from(seenKeys),
      lastKeyword: keyword,
      lastNoteId: null
    });
  }

  console.log(
    `\n✅ Collect 100 完成: 实际采集 ${collected.length} 条，输出根目录: ${baseDownloadDir}`,
  );

  // 成功完成后清理进度文件
  await tracker.cleanup();
}

main().catch((err) => {
  console.error('[Collect100] Unexpected error:', err);
  process.exit(1);
});
