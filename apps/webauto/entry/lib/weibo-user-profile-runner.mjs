import {
  resolveWeiboOutputContext,
  mergeWeiboPosts,
  writeWeiboLinks,
  writeCollectionMeta,
  appendLog,
  ensureDir,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';
import {
  navigateToUserProfile,
  harvestUserProfile,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/user-profile-ops.mjs';
import { runWeiboDetail } from './weibo-detail-runner.mjs';
import { sleep } from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/common.mjs';

function generateRunId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const rand = Math.random().toString(36).slice(2, 6);
  return `wbup_${ts}_${rand}`;
}

function resolveUserProfileOutputContext({ userId, params = {} }) {
  const keyword = `user-profile:${userId}`;
  return resolveWeiboOutputContext({ params: { ...params, keyword } });
}

export async function runUserProfileTask(args) {
  const {
    profileId,
    userIds,
    target,
    env,
    date,
    outputRoot,
    scrollDelay,
    maxEmptyScrolls,
    withDetail,
  } = args;

  const allResults = [];

  for (const userId of userIds) {
    const runId = generateRunId();
    const keyword = `user-profile:${userId}`;
    const ctx = resolveUserProfileOutputContext({ userId, params: { env, date, outputRoot } });
    await ensureDir(ctx.keywordDir);

    await appendLog({ filePath: ctx.logPath, message: `[${runId}] user-profile task started, userId=${userId}, target=${target}` });
    console.log(`[${runId}] Navigating to user profile: ${userId}...`);

    const navResult = await navigateToUserProfile(profileId, userId);
    if (!navResult.ok) {
      await appendLog({ filePath: ctx.logPath, message: `[${runId}] navigation failed: ${navResult.error}` });
      console.error(`[${runId}] Navigation failed: ${navResult.error}`);
      allResults.push({ ok: false, userId, error: navResult.error });
      continue;
    }
    console.log(`[${runId}] Page loaded: ${navResult.title}`);

    const harvestResult = await harvestUserProfile({
      profileId,
      userId,
      target,
      scrollDelay,
      maxEmptyScrolls,
    });

    if (!harvestResult.ok) {
      await appendLog({ filePath: ctx.logPath, message: `[${runId}] harvest failed` });
      allResults.push({ ok: false, userId, error: 'harvest failed' });
      continue;
    }

    console.log(`[${runId}] Harvested ${harvestResult.total} posts in ${harvestResult.rounds} rounds`);

    const posts = harvestResult.posts || [];
    if (posts.length > 0) {
      await mergeWeiboPosts({ filePath: ctx.postsPath, posts });
      await writeWeiboLinks({ filePath: ctx.linksPath, posts });
    }

    await writeCollectionMeta({ filePath: ctx.metaPath, meta: {
      runId,
      taskType: 'user-profile',
      userId,
      env,
      totalPosts: harvestResult.total,
      rounds: harvestResult.rounds,
      target,
      completedAt: new Date().toISOString(),
    }});

    await appendLog({ filePath: ctx.logPath, message: `[${runId}] user-profile harvest completed, total=${harvestResult.total}` });

    let detailResult = null;
    if (withDetail && posts.length > 0) {
      console.log(`[${runId}] Starting detail collection for ${posts.length} posts...`);
      await appendLog({ filePath: ctx.logPath, message: `[${runId}] starting detail collection for ${posts.length} posts` });

      detailResult = await runWeiboDetail({
        profile: profileId,
        'links-file': ctx.linksPath,
        'max-posts': posts.length,
        env,
        'output-root': outputRoot || undefined,
        keyword,
        'content-enabled': 'true',
        'images-enabled': 'true',
        'videos-enabled': 'false',
        'links-enabled': 'true',
        'comments-enabled': 'true',
        'expand-all-replies': 'true',
        'post-interval-min': '2000',
        'post-interval-max': '5000',
      });
    }

    allResults.push({
      ok: true,
      taskType: 'user-profile',
      runId,
      userId,
      total: harvestResult.total,
      outputDir: ctx.keywordDir,
      detailResult: detailResult || null,
    });
  }

  const okCount = allResults.filter(r => r.ok).length;
  return {
    ok: okCount > 0,
    taskType: 'user-profile',
    results: allResults,
    totalUsers: userIds.length,
    successUsers: okCount,
  };
}

