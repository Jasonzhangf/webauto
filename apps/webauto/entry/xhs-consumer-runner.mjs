/**
 * XHS Consumer Runner — Always-On 模式的链接处理端
 *
 * 职责：
 * 1. 从服务端队列取链接（claim）
 * 2. 打开详情页
 * 3. 执行 harvest/like/comments 等操作
 * 4. 完成后标记（complete）
 * 5. 队列为空时等待，不退出
 * 6. 健康检查 + 自动恢复（core feature）
 * 7. 状态持久化（崩溃恢复） — NEW
 */

import {
  loadConsumerState,
  saveConsumerState,
  updateProcessedCount,
  recordError,
  resetConsumerState,
} from './lib/consumer-state.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 运行配置
const CONSUMER_IDLE_INTERVAL_MS = 30_000;   // 队列空时每 30s 轮询
const CONSUMER_HEARTBEAT_MS = 60_000;       // 每 60s 发心跳
const CONSUMER_MAX_IDLE_ROUNDS = 0;         // 0 = 无限等待（持久运行）

// 自动恢复配置（Always-On 核心能力）
const CONSUMER_MAX_CONSECUTIVE_ERRORS = 3;  // 连续错误阈值
const HEALTH_CHECK_URL = 'http://127.0.0.1:7704/health';
const HEALTH_CHECK_INTERVAL_MS = 300_000;   // 每 5 分钟健康检查

/**
 * 健康检查 + 自动恢复
 */
async function healthCheckAndRecover(profileId) {
  console.log(`[consumer] running health check...`);
  
  // 1. 检查 browser-service
  try {
    const res = await fetch(HEALTH_CHECK_URL, { method: 'GET' });
    const health = await res.json();
    if (health.ok) {
      console.log(`[consumer] health check passed`);
      return { ok: true };
    }
  } catch (e) {
    console.log(`[consumer] health check fetch failed: ${e.message}`);
  }

  // 2. 健康检查失败，尝试恢复
  console.log(`[consumer] health check failed, attempting auto-recovery...`);

  // 3. 尝试启动 camo
  const { execSync } = await import('node:child_process');
  const cmd = `camo start ${profileId} --url https://www.xiaohongshu.com --visible`;
  
  try {
    console.log(`[consumer] running: ${cmd}`);
    execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    console.log(`[consumer] camo started, waiting 10s for ready...`);
    await sleep(10000);

    // 4. 验证恢复
    const res2 = await fetch(HEALTH_CHECK_URL);
    const health2 = await res2.json();
    if (health2.ok) {
      console.log(`[consumer] ✅ auto-recovery successful!`);
      return { ok: true, recovered: true };
    }
  } catch (err) {
    console.error(`[consumer] recovery command failed: ${err.message}`);
  }

  console.log(`[consumer] ❌ auto-recovery failed`);
  return { ok: false, reason: 'health_check_failed' };
}

/**
 * 检查错误是否为 session/browser 相关（可恢复）
 */
function isSessionError(errMsg) {
  const keywords = ['session', 'profile', 'browser', 'cdp', 'disconnected', 'target closed'];
  return keywords.some(k => errMsg.toLowerCase().includes(k));
}

/**
 * 主入口
 */
export async function runConsumerTask(args = {}) {
  const profileId = String(args.profile || 'xhs-qa-1').trim();
  const keyword = String(args.keyword || args.k || '').trim();
  const env = String(args.env || 'debug').trim();
  const doComments = args['do-comments'] === 'true' || args['do-comments'] === true;
  const doLikes = args['do-likes'] === 'true' || args['do-likes'] === true;
  const maxNotes = Math.max(1, Number(args['max-notes'] || 0)); // 0 = unlimited
  const tabCount = Math.max(1, Number(args['tab-count'] || 4));
  const commentBudget = Math.max(0, Number(args['comment-budget'] || 50));
  const forceReset = args['force-reset'] === 'true' || args['force-reset'] === true;

  if (!keyword) {
    return { ok: false, error: 'keyword is required' };
  }

  console.log(`[consumer] keyword=${keyword} env=${env} profile=${profileId}`);
  console.log(`[consumer] doComments=${doComments} doLikes=${doLikes} maxNotes=${maxNotes}`);
  console.log(`[consumer] tabCount=${tabCount} commentBudget=${commentBudget}`);
  console.log(`[consumer] mode=always-on (persistent, idle interval=${CONSUMER_IDLE_INTERVAL_MS}ms)`);
  console.log(`[consumer] auto-recovery=enabled (max consecutive errors=${CONSUMER_MAX_CONSECUTIVE_ERRORS})`);

  // === 状态持久化集成 ===
  // 1. 加载或初始化状态
  let state;
  if (forceReset) {
    console.log(`[consumer] force-reset=true, resetting state...`);
    state = resetConsumerState(keyword, env);
  } else {
    state = loadConsumerState(keyword, env);
    if (state.processed > 0) {
      console.log(`[consumer] 📂 recovered state: processed=${state.processed} lastNoteId=${state.lastProcessedNoteId}`);
      console.log(`[consumer] started at ${state.startedAt}, last update ${state.updatedAt}`);
    }
  }

  // Dynamic import unified runner
  const { runUnified } = await import('./xhs-unified.mjs');

  // 2. 从恢复状态初始化运行变量
  let totalProcessed = state.processed;
  let idleRounds = 0;
  let consecutiveErrors = state.consecutiveErrors;
  let lastHeartbeat = Date.now();
  let lastHealthCheck = Date.now();

  while (true) {
    // Check stop signal (from daemon)
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      console.log(`[consumer] stop signal received, exiting. processed=${totalProcessed}`);
      // 保存最终状态
      saveConsumerState(keyword, env, {
        processed: totalProcessed,
        consecutiveErrors,
        lastError: state.lastError,
        startedAt: state.startedAt,
      });
      return { ok: true, processed: totalProcessed, reason: 'stop_signal' };
    }

    // Heartbeat（持久化心跳）
    if (Date.now() - lastHeartbeat > CONSUMER_HEARTBEAT_MS) {
      console.log(`[consumer] ❤️ heartbeat: processed=${totalProcessed} idleRounds=${idleRounds} consecutiveErrors=${consecutiveErrors}`);
      // 每次心跳持久化状态
      state = saveConsumerState(keyword, env, {
        processed: totalProcessed,
        consecutiveErrors,
        lastError: state.lastError,
        startedAt: state.startedAt,
      });
      lastHeartbeat = Date.now();
    }

    // Periodic health check (every 5 min)
    if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
      const health = await healthCheckAndRecover(profileId);
      if (!health.ok) {
        consecutiveErrors++;
        console.error(`[consumer] ⚠️ health check failed (${consecutiveErrors}/${CONSUMER_MAX_CONSECUTIVE_ERRORS})`);
        // 记录错误到状态文件
        recordError(keyword, env, 'health_check_failed');
        if (consecutiveErrors >= CONSUMER_MAX_CONSECUTIVE_ERRORS) {
          return { ok: false, processed: totalProcessed, reason: 'health_check_exhausted' };
        }
      } else {
        if (health.recovered) consecutiveErrors = 0;
      }
      lastHealthCheck = Date.now();
    }

    // Run unified pipeline (one batch)
    try {
      const batchResult = await runUnified({
        profile: profileId,
        keyword,
        env,
        'do-comments': String(doComments),
        'do-likes': String(doLikes),
        'max-notes': maxNotes > 0 ? String(maxNotes) : '50',
        'tab-count': String(tabCount),
        'comment-budget': String(commentBudget),
        'task-type': 'consumer',
      });

      if (batchResult?.ok) {
        const processed = batchResult.notesOpened || batchResult.detailContentRuns || 0;
        totalProcessed += processed;
        idleRounds = 0;
        consecutiveErrors = 0; // Reset on success
        
        // === 每次成功处理后持久化进度 ===
        const lastNoteId = batchResult.lastProcessedNoteId || null;
        state = updateProcessedCount(keyword, env, processed, lastNoteId);
        
        console.log(`[consumer] ✅ batch done: processed=${processed} total=${totalProcessed} (persisted)`);
      } else {
        const reason = batchResult?.terminalCode || batchResult?.error || 'unknown';
        console.log(`[consumer] batch ended: reason=${reason}`);

        // If queue exhausted, enter idle mode
        if (reason === 'AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED') {
          idleRounds++;
          console.log(`[consumer] queue empty, idle round ${idleRounds}`);

          if (CONSUMER_MAX_IDLE_ROUNDS > 0 && idleRounds >= CONSUMER_MAX_IDLE_ROUNDS) {
            console.log(`[consumer] max idle rounds reached, exiting. processed=${totalProcessed}`);
            return { ok: true, processed: totalProcessed, reason: 'max_idle_rounds' };
          }

          console.log(`[consumer] waiting ${CONSUMER_IDLE_INTERVAL_MS}ms before next claim...`);
          await sleep(CONSUMER_IDLE_INTERVAL_MS);
          continue;
        }

        // Session error → auto-recovery
        if (isSessionError(reason)) {
          consecutiveErrors++;
          console.error(`[consumer] ⚠️ session error (${consecutiveErrors}/${CONSUMER_MAX_CONSECUTIVE_ERRORS}): ${reason}`);
          
          // 记录错误到状态文件
          recordError(keyword, env, reason);

          if (consecutiveErrors >= CONSUMER_MAX_CONSECUTIVE_ERRORS) {
            const recover = await healthCheckAndRecover(profileId);
            if (!recover.ok) {
              return { ok: false, processed: totalProcessed, reason: 'auto_recovery_failed' };
            }
            consecutiveErrors = 0;
          }
        } else {
          // Other terminal reasons (error, user cancel, etc.)
          console.log(`[consumer] terminal reason: ${reason}, exiting. processed=${totalProcessed}`);
          // 保存最终状态
          saveConsumerState(keyword, env, {
            processed: totalProcessed,
            consecutiveErrors,
            lastError: reason,
            startedAt: state.startedAt,
          });
          return { ok: false, processed: totalProcessed, reason };
        }
      }

      // Check maxNotes limit
      if (maxNotes > 0 && totalProcessed >= maxNotes) {
        console.log(`[consumer] maxNotes reached (${totalProcessed}/${maxNotes}), exiting.`);
        return { ok: true, processed: totalProcessed, reason: 'max_notes_reached' };
      }
    } catch (err) {
      console.error(`[consumer] ❌ batch error: ${err.message}`);
      consecutiveErrors++;
      
      // 记录错误到状态文件
      recordError(keyword, env, err.message);

      if (isSessionError(err.message)) {
        console.error(`[consumer] session error (${consecutiveErrors}/${CONSUMER_MAX_CONSECUTIVE_ERRORS})`);
        if (consecutiveErrors >= CONSUMER_MAX_CONSECUTIVE_ERRORS) {
          const recover = await healthCheckAndRecover(profileId);
          if (!recover.ok) {
            return { ok: false, processed: totalProcessed, reason: 'auto_recovery_failed' };
          }
          consecutiveErrors = 0;
        }
      }

      idleRounds++;
      if (CONSUMER_MAX_IDLE_ROUNDS > 0 && idleRounds >= CONSUMER_MAX_IDLE_ROUNDS) {
        console.log(`[consumer] max idle rounds reached after errors, exiting.`);
        return { ok: false, processed: totalProcessed, reason: 'max_idle_rounds' };
      }

      console.log(`[consumer] waiting ${CONSUMER_IDLE_INTERVAL_MS}ms after error...`);
      await sleep(CONSUMER_IDLE_INTERVAL_MS);
    }
  }
}

// Main entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      parsed[key] = value;
      if (value !== 'true') i++;
    }
  }
  runConsumerTask(parsed).then(result => {
    console.log('[consumer] exit:', result);
    process.exit(result.ok ? 0 : 1);
  }).catch(err => {
    console.error('[consumer] fatal:', err);
    process.exit(1);
  });
}
