/**
 * XHS Consumer Runner — Always-On 模式的链接处理端
 *
 * 职责：
 * 1. 从服务端队列取链接（claim）
 * 2. 打开详情页
 * 3. 执行 harvest/like/comments 等操作
 * 4. 完成后标记（complete）
 * 5. 队列为空时等待，不退出
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONSUMER_IDLE_INTERVAL_MS = 30_000;   // 队列空时每 30s 轮询
const CONSUMER_HEARTBEAT_MS = 60_000;       // 每 60s 发心跳
const CONSUMER_MAX_IDLE_ROUNDS = 0;          // 0 = 无限等待（持久运行）

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

  if (!keyword) {
    return { ok: false, error: 'keyword is required' };
  }

  console.log(`[consumer] keyword=${keyword} env=${env} profile=${profileId}`);
  console.log(`[consumer] doComments=${doComments} doLikes=${doLikes} maxNotes=${maxNotes}`);
  console.log(`[consumer] tabCount=${tabCount} commentBudget=${commentBudget}`);
  console.log(`[consumer] mode=always-on (persistent, idle interval=${CONSUMER_IDLE_INTERVAL_MS}ms)`);

  // Dynamic import unified runner — Consumer reuses the existing XHS unified pipeline
  const { runXhsUnified } = await import('./xhs-unified.mjs');

  let totalProcessed = 0;
  let idleRounds = 0;
  let lastHeartbeat = Date.now();

  while (true) {
    // Check stop signal (from daemon)
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      console.log(`[consumer] stop signal received, exiting. processed=${totalProcessed}`);
      return { ok: true, processed: totalProcessed, reason: 'stop_signal' };
    }

    // Heartbeat
    if (Date.now() - lastHeartbeat > CONSUMER_HEARTBEAT_MS) {
      console.log(`[consumer] heartbeat: processed=${totalProcessed} idleRounds=${idleRounds}`);
      lastHeartbeat = Date.now();
    }

    // Run unified pipeline (one batch)
    // The unified pipeline handles claim/process/complete internally
    try {
      const batchResult = await runXhsUnified({
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
        console.log(`[consumer] batch done: processed=${processed} total=${totalProcessed}`);
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

        // Other terminal reasons (error, user cancel, etc.)
        console.log(`[consumer] terminal reason: ${reason}, exiting. processed=${totalProcessed}`);
        return { ok: false, processed: totalProcessed, reason };
      }

      // Check maxNotes limit
      if (maxNotes > 0 && totalProcessed >= maxNotes) {
        console.log(`[consumer] maxNotes reached (${totalProcessed}/${maxNotes}), exiting.`);
        return { ok: true, processed: totalProcessed, reason: 'max_notes_reached' };
      }
    } catch (err) {
      console.error(`[consumer] batch error: ${err.message}`);
      idleRounds++;

      if (CONSUMER_MAX_IDLE_ROUNDS > 0 && idleRounds >= CONSUMER_MAX_IDLE_ROUNDS) {
        console.log(`[consumer] max idle rounds reached after errors, exiting.`);
        return { ok: false, processed: totalProcessed, reason: 'max_idle_rounds', error: err.message };
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
