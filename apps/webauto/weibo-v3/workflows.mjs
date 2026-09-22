// Weibo workflow DAGs. Producer and consumer preserve their always-on
// semantics but now call the v3 collection modules.

import {
  appendLog,
  mergePosts,
  readJsonl,
  resolveKeywordContext,
  resolveTimelineContext,
  writeLinks,
} from './artifacts.mjs';
import { collectDetail } from './detail.mjs';
import { collectProfile, collectTimeline } from './profile.mjs';
import { collectSearch } from './search.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runProducer({
  runtime,
  browser,
  profileId,
  taskType = 'timeline',
  userIds = [],
  keyword = '',
  env = 'prod',
  outputRoot = '',
  date = new Date().toISOString().slice(0, 10),
  maxLinksPerScan = 50,
  maxScans = 1,
  scanIntervalMs = 30_000,
  scrollWaitMs = 2500,
  maxEmptyScrolls = 2,
  } = {}) {
  if (!runtime) throw new Error('runProducer requires the v3 runtime');
  let added = 0;
  let scans = 0;
  let existing = 0;

  for (let scan = 1; scan <= maxScans; scan++) {
    scans = scan;
    let result;
    if (taskType === 'search') {
      result = await collectSearch({ runtime, browser, topic: keyword, maxPages: 3, limit: maxLinksPerScan });
    } else if (taskType === 'user-profile') {
      result = { posts: [] };
      for (const userId of userIds) {
        const profile = await collectProfile({
          runtime,
          browser,
          userId,
          target: maxLinksPerScan,
          surface: 'mobile',
          scrollWaitMs,
          maxEmptyScrolls,
        });
        result.posts.push(...profile.posts);
      }
    } else {
      result = await collectTimeline({
        runtime,
        browser,
        target: maxLinksPerScan,
        scrollWaitMs,
        maxEmptyScrolls,
      });
    }
    const posts = result.posts || [];
    const ctx = taskType === 'timeline'
      ? resolveTimelineContext({ date, env, outputRoot })
      : resolveKeywordContext({
          keyword: taskType === 'search' ? `search:${keyword}` : `user-profile:${userIds.join(',')}`,
          env,
          outputRoot,
        });
    existing = (await readJsonl(ctx.postsPath, { missingOk: true })).length;
    const merged = await mergePosts({ filePath: ctx.postsPath, posts });
    const queued = await readJsonl(ctx.postsPath);
    await writeLinks({ filePath: ctx.linksPath, posts: queued });
    added += merged.added;
    await appendLog(ctx.logPath, `producer_scan scan=${scan} collected=${posts.length} merged=${merged.added}`);
    if (scan < maxScans) await sleep(scanIntervalMs);
  }

  return { ok: true, scans, added, existing };
}

export async function runConsumer({
  runtime,
  browser,
  profileId,
  taskType = 'timeline',
  keyword = '',
  env = 'prod',
  outputRoot = '',
  date = new Date().toISOString().slice(0, 10),
  maxPosts = 0,
  commentLimit = 0,
  repliesPerComment = 0,
  contentEnabled = true,
  imagesEnabled = true,
  videosEnabled = false,
  linksEnabled = true,
  commentsEnabled = true,
  expandAllReplies = true,
  stopWhenIdle = false,
  idleIntervalMs = 30_000,
} = {}) {
  if (!runtime) throw new Error('runConsumer requires the v3 runtime');
  const ctx = taskType === 'timeline'
    ? resolveTimelineContext({ date, env, outputRoot })
    : resolveKeywordContext({
        keyword: taskType === 'search' ? `search:${keyword}` : keyword || 'detail',
        env,
        outputRoot,
      });
  let processed = 0;
  let failed = 0;
  let idleRounds = 0;
  let lastError = null;

  while (maxPosts <= 0 || processed < maxPosts) {
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      return {
        ok: failed === 0,
        processed,
        failed,
        idleRounds,
        lastError,
        reason: 'stop_signal',
      };
    }
    const links = await readJsonl(ctx.linksPath, { missingOk: true });
    const pending = links.slice(processed);
    if (pending.length === 0) {
      idleRounds++;
      if (stopWhenIdle) break;
      await sleep(idleIntervalMs);
      continue;
    }
    for (const link of pending) {
      if (maxPosts > 0 && processed >= maxPosts) break;
      try {
        await collectDetail({
          runtime,
          browser,
          url: link.url,
          keyword: ctx.keyword,
          env,
          outputRoot,
          commentLimit,
          repliesPerComment,
          contentEnabled,
          imagesEnabled,
          videosEnabled,
          linksEnabled,
          commentsEnabled,
          expandAllReplies,
          force: false,
        });
      } catch (error) {
        failed++;
        lastError = error?.message || String(error);
        await appendLog(ctx.logPath, `consumer_item_failed url=${link.url} error=${lastError}`);
      }
      processed++;
    }
  }
  return {
    // A detail that failed is a real failure for this run. Reporting ok while
    // only exposing a miscount would let the scheduler mark the task successful
    // and record success for a queue that did not drain, so the failed count is
    // authoritative: the run fails and the queue tail stays pending, which
    // makes the next run retry exactly those links.
    ok: failed === 0,
    processed,
    failed,
    idleRounds,
    lastError,
    reason: stopWhenIdle ? 'idle' : 'max_posts_reached',
  };
}

export async function runDetailBatch({
  runtime,
  browser,
  posts = [],
  keyword = 'batch',
  env = 'prod',
  outputRoot = '',
  commentLimit = 0,
  repliesPerComment = 0,
  contentEnabled = true,
  imagesEnabled = true,
  videosEnabled = false,
  linksEnabled = true,
  commentsEnabled = true,
  expandAllReplies = true,
  force = false,
} = {}) {
  if (!runtime) throw new Error('runDetailBatch requires the v3 runtime');
  const results = [];
  for (const post of posts) {
    try {
      const result = await collectDetail({
        runtime,
        browser,
        url: post.url,
        keyword,
        env,
        outputRoot,
        commentLimit,
        repliesPerComment,
        contentEnabled,
        imagesEnabled,
        videosEnabled,
        linksEnabled,
        commentsEnabled,
        expandAllReplies,
        force,
      });
      results.push({
        url: post.url,
        ok: true,
        skipped: result.skipped || false,
        mid: result.mid,
      });
    } catch (error) {
      results.push({
        url: post.url,
        ok: false,
        skipped: false,
        mid: post.mid || post.id || null,
        error: error?.message || String(error),
      });
    }
  }
  return {
    ok: results.every((result) => result.ok),
    requested: posts.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}
