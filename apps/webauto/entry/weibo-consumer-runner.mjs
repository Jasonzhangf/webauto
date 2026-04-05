/**
 * Weibo Consumer Runner — Always-On 模式的链接处理端
 *
 * 职责：
 * 1. 从已有 posts.jsonl 中读取未处理的帖子
 * 2. 逐条打开 detail 进行内容采集/视频解析
 * 3. 完成后标记
 * 4. 队列为空时等待
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONSUMER_IDLE_INTERVAL_MS = 30_000;
const CONSUMER_HEARTBEAT_MS = 60_000;
const CONSUMER_MAX_IDLE_ROUNDS = 0; // 0 = 无限等待

/**
 * 主入口
 */
export async function runWeiboConsumerTask(args = {}) {
  const profileId = String(args.profile || 'weibo').trim();
  const env = String(args.env || 'prod').trim();
  const taskType = String(args['task-type'] || 'timeline').trim();
  const withDetail = args['with-detail'] === 'true' || args['with-detail'] === true;
  const maxPosts = Math.max(1, Number(args['max-posts'] || 0)); // 0 = unlimited

  console.log(`[weibo-consumer] taskType=${taskType} env=${env} profile=${profileId}`);
  console.log(`[weibo-consumer] withDetail=${withDetail} maxPosts=${maxPosts}`);
  console.log(`[weibo-consumer] mode=always-on (persistent)`);

  const { runWeiboUnified } = await import('./weibo-unified-runner.mjs');

  let totalProcessed = 0;
  let idleRounds = 0;
  let lastHeartbeat = Date.now();

  while (true) {
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      console.log(`[weibo-consumer] stop signal received, exiting. processed=${totalProcessed}`);
      return { ok: true, processed: totalProcessed, reason: 'stop_signal' };
    }

    if (Date.now() - lastHeartbeat > CONSUMER_HEARTBEAT_MS) {
      console.log(`[weibo-consumer] heartbeat: processed=${totalProcessed} idleRounds=${idleRounds}`);
      lastHeartbeat = Date.now();
    }

    try {
      const batchResult = await runWeiboUnified({
        profile: profileId,
        env,
        'task-type': taskType,
        'with-detail': String(withDetail),
        target: maxPosts > 0 ? String(maxPosts) : '50',
      });

      if (batchResult?.ok) {
        const processed = batchResult.total || batchResult.posts?.length || 0;
        totalProcessed += processed;
        idleRounds = 0;
        console.log(`[weibo-consumer] batch done: processed=${processed} total=${totalProcessed}`);
      } else {
        const reason = batchResult?.error || 'unknown';
        idleRounds++;
        console.log(`[weibo-consumer] batch ended: reason=${reason}`);

        if (CONSUMER_MAX_IDLE_ROUNDS > 0 && idleRounds >= CONSUMER_MAX_IDLE_ROUNDS) {
          return { ok: true, processed: totalProcessed, reason: 'max_idle_rounds' };
        }

        console.log(`[weibo-consumer] waiting ${CONSUMER_IDLE_INTERVAL_MS}ms...`);
        await sleep(CONSUMER_IDLE_INTERVAL_MS);
        continue;
      }

      if (maxPosts > 0 && totalProcessed >= maxPosts) {
        console.log(`[weibo-consumer] maxPosts reached (${totalProcessed}/${maxPosts})`);
        return { ok: true, processed: totalProcessed, reason: 'max_posts_reached' };
      }
    } catch (err) {
      console.error(`[weibo-consumer] batch error: ${err.message}`);
      idleRounds++;
      if (CONSUMER_MAX_IDLE_ROUNDS > 0 && idleRounds >= CONSUMER_MAX_IDLE_ROUNDS) {
        return { ok: false, processed: totalProcessed, reason: 'max_idle_rounds', error: err.message };
      }
      await sleep(CONSUMER_IDLE_INTERVAL_MS);
    }
  }
}
