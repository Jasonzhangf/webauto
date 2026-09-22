// Compatibility CLI for every existing Weibo command name.
// Entries are thin; all orchestration lives in the v3 modules.

import minimist from 'minimist';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CamoAdapter } from '../../../modules/webauto-v3/src/camo-adapter.mjs';
import { WeiboBrowser } from './browser.mjs';
import { collectProfile, collectTimeline } from './profile.mjs';
import { collectSearch } from './search.mjs';
import { resolveVideo } from './video.mjs';
import { runConsumer, runDetailBatch, runProducer } from './workflows.mjs';
import { resolveKeywordContext, resolveTimelineContext } from './artifacts.mjs';
import { createWeiboRuntime } from './runtime.mjs';

function stringArg(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function numberArg(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boolArg(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function browserFor(argv, defaultProfile = 'weibo') {
  const profileId = stringArg(argv.profile || argv.p, defaultProfile);
  return new WeiboBrowser({
    adapter: new CamoAdapter(),
    profileId,
    target: stringArg(argv.targetId || argv['target-id']) || null,
  });
}

function runtimeFor(argv, defaultProfile = 'weibo') {
  return createWeiboRuntime({
    profileId: stringArg(argv.profile || argv.p, defaultProfile),
  });
}

// Pre-v3 `weibo video --copy` wrote the resolved URL to the system clipboard.
// pbcopy is the macOS path the old entry actually exercised.
export function writeClipboard(text) {
  const result = spawnSync('pbcopy', { input: String(text), encoding: 'utf8' });
  return !result.error && result.status === 0;
}

// Applies the legacy `--copy` side effect and reports whether it happened.
// The writer is injectable so the contract is testable without touching the
// real system clipboard.
export function applyVideoCopy({ argv = {}, result = {}, writeClipboardFn = writeClipboard } = {}) {
  if (!boolArg(argv.copy || argv.c, false)) return false;
  if (!result.videoUrl) return false;
  return writeClipboardFn(result.videoUrl) === true;
}

function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

export function assertDaemonAdmission(env = process.env) {
  const daemonWorkerId = String(env.WEBAUTO_DAEMON_WORKER_ID || '').trim();
  const daemonBypass = env.WEBAUTO_DAEMON_BYPASS === '1';
  if (daemonWorkerId || daemonBypass) return;
  const error = new Error([
    'WEIBO_DAEMON_REQUIRED: 非 daemon 方式启动已禁止',
    '',
    '请通过 daemon 启动任务：',
    '  webauto daemon start',
    '  webauto daemon task submit -- weibo <command> [options...]',
    '',
    '如需调试绕过（仅限开发环境）：',
    '  WEBAUTO_DAEMON_BYPASS=1 node bin/webauto.mjs weibo <command> [options...]',
  ].join('\n'));
  error.code = 'WEIBO_DAEMON_REQUIRED';
  throw error;
}

function requireKeyword(argv, message) {
  const keyword = stringArg(argv.keyword || argv.k);
  if (!keyword) throw new Error(message);
  return keyword;
}

function assertArtifactPassed(validation, message) {
  if (validation?.result === 'pass') return;
  const error = new Error(message);
  error.code = 'WEIBO_ARTIFACT_VALIDATION_FAILED';
  throw error;
}

async function collectCommand(argv) {
  const keyword = requireKeyword(argv, 'WEIBO_COLLECT_KEYWORD_REQUIRED: --keyword is required');
  const runtime = runtimeFor(argv);
  const browser = browserFor(argv);
  try {
    await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
    const result = await collectSearch({
      runtime,
      browser,
      topic: keyword,
      maxPages: Math.max(1, numberArg(argv['max-pages'], 50)),
      limit: Math.max(1, numberArg(argv['max-notes'] ?? argv.target ?? argv.n, 10)),
    });
    const ctx = resolveKeywordContext({
      keyword: `search:${keyword}`,
      env: stringArg(argv.env || argv.e, 'prod'),
      outputRoot: stringArg(argv['output-root']),
    });
    const { updateQueue, writeJson, appendLog } = await import('./artifacts.mjs');
    const merged = await updateQueue({
      postsPath: ctx.postsPath,
      linksPath: ctx.linksPath,
      posts: result.posts,
    });
    const meta = {
      platform: 'weibo',
      taskType: 'search',
      keyword,
      target: result.posts.length,
      status: result.tailReason || 'complete',
      completedAt: new Date().toISOString(),
    };
    await writeJson(ctx.metaPath, meta);
    await appendLog(ctx.logPath, `collect_done keyword=${keyword} collected=${result.posts.length}`);
    const artifact = runtime.recordArtifact({
      artifactType: 'weibo-search-links',
      artifactId: `search:${keyword}`,
      payload: { posts: result.posts, meta },
      path: ctx.linksPath,
    });
    const validation = runtime.validateArtifact({
      artifact,
      validationSpecId: 'weibo.search.v1',
      result: result.posts.length > 0 ? 'pass' : 'fail',
      observedCount: result.posts.length,
      expectedCount: null,
    });
    assertArtifactPassed(validation, `WEIBO_SEARCH_EMPTY: no posts collected for ${keyword}`);
    runtime.finish('succeeded', { task_type: 'search', collected: result.posts.length });
    return {
      runId: runtime.runId,
      eventFile: runtime.eventStore.file(),
      collected: merged.total,
      keywordDir: ctx.keywordDir,
      posts: result.posts,
      meta: { status: result.tailReason || 'complete' },
    };
  } catch (error) {
    runtime.finish('failed', { task_type: 'search', error: error?.message || String(error) });
    throw error;
  }
}

async function detailCommand(argv) {
  const linksFile = stringArg(argv['links-file']);
  if (!linksFile) throw new Error('WEIBO_DETAIL_LINKS_FILE_REQUIRED: --links-file is required');
  const runtime = runtimeFor(argv);
  const browser = browserFor(argv);
  try {
    const { readJsonl } = await import('./artifacts.mjs');
    let links;
    try {
      links = await readJsonl(linksFile);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const emptyError = new Error(`WEIBO_DETAIL_EMPTY_LINKS: no readable links file: ${linksFile}`);
        emptyError.code = 'WEIBO_DETAIL_EMPTY_LINKS';
        throw emptyError;
      }
      throw error;
    }
    if (links.length === 0) {
      const emptyError = new Error(`WEIBO_DETAIL_EMPTY_LINKS: no links found in ${linksFile}`);
      emptyError.code = 'WEIBO_DETAIL_EMPTY_LINKS';
      throw emptyError;
    }
    await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
    const posts = links.slice(0, Math.max(1, numberArg(argv['max-posts'] ?? argv['max-notes'] ?? argv.n, 10)));
    const result = await runDetailBatch({
      runtime,
      browser,
      posts,
      keyword: stringArg(argv.keyword || argv.k, 'detail'),
      env: stringArg(argv.env || argv.e, 'prod'),
      outputRoot: stringArg(argv['output-root']),
      commentLimit: Math.max(0, numberArg(argv['max-comments'], 0)),
      repliesPerComment: Math.max(0, numberArg(argv['replies-per-comment'], 0)),
      contentEnabled: boolArg(argv['content-enabled'], true),
      imagesEnabled: boolArg(argv['images-enabled'], true),
      videosEnabled: boolArg(argv['videos-enabled'], false),
      linksEnabled: boolArg(argv['links-enabled'], true),
      commentsEnabled: boolArg(argv['comments-enabled'], true),
      expandAllReplies: boolArg(argv['expand-all-replies'], true),
      force: boolArg(argv.force, false),
    });
    runtime.finish(result.failed === 0 ? 'succeeded' : 'failed', {
      task_type: 'detail',
      requested: result.requested,
      succeeded: result.succeeded,
      failed: result.failed,
    });
    return {
      runId: runtime.runId,
      eventFile: runtime.eventStore.file(),
      ok: result.failed === 0,
      totalLinks: links.length,
      successCount: result.succeeded,
      failCount: result.failed,
      results: result.results,
    };
  } catch (error) {
    runtime.finish('failed', { task_type: 'detail', error: error?.message || String(error) });
    throw error;
  }
}

async function unifiedCommand(argv) {
  const taskType = stringArg(argv['task-type'] || argv.taskType, 'timeline');
  const withDetail = boolArg(argv['with-detail'], false);
  const profileId = stringArg(argv.profile || argv.p, 'weibo');
  const runtime = runtimeFor(argv);
  const browser = browserFor(argv);
  try {
    await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
    const target = Math.max(1, numberArg(argv.target || argv.t, 50));
    const env = stringArg(argv.env || argv.e, 'prod');
    const outputRoot = stringArg(argv['output-root']);
    const date = stringArg(argv.date, new Date().toISOString().slice(0, 10));
    const scrollWaitMs = Math.max(500, numberArg(argv['scroll-wait-ms'] ?? argv['scroll-delay'], 2500));
    const maxEmptyScrolls = Math.max(1, numberArg(argv['max-empty-scrolls'], 2));

    if (taskType === 'user-profile') {
      const userIds = stringArg(argv['user-ids']).split(',').map((value) => value.trim()).filter(Boolean);
      const results = [];
      for (const userId of userIds) {
        const collected = await collectProfile({
          runtime,
          browser,
          userId,
          target,
          surface: stringArg(argv.surface, 'mobile'),
          scrollWaitMs,
          maxEmptyScrolls,
        });
        const ctx = resolveKeywordContext({
          keyword: `user-profile:${userId}`,
          env,
          outputRoot,
        });
        const { updateQueue, writeJson, appendLog } = await import('./artifacts.mjs');
        await updateQueue({
          postsPath: ctx.postsPath,
          linksPath: ctx.linksPath,
          posts: collected.posts,
        });
        const meta = {
          platform: 'weibo',
          taskType,
          userId,
          target,
          totalPosts: collected.posts.length,
          completedAt: new Date().toISOString(),
        };
        await writeJson(ctx.metaPath, meta);
        await appendLog(ctx.logPath, `user_profile_done userId=${userId} posts=${collected.posts.length}`);
        const artifact = runtime.recordArtifact({
          artifactType: 'weibo-profile-links',
          artifactId: `user-profile:${userId}`,
          payload: { posts: collected.posts, meta },
          path: ctx.linksPath,
        });
        const validation = runtime.validateArtifact({
          artifact,
          validationSpecId: 'weibo.user-profile.v1',
          result: collected.posts.length > 0 ? 'pass' : 'fail',
          observedCount: collected.posts.length,
          expectedCount: target,
        });
        // The pre-v3 user-profile runner collected details for every harvested
        // post when --with-detail was set. Dropping the flag would silently
        // skip a requested stage while still reporting the profile as done.
        let detail = null;
        if (withDetail && collected.posts.length > 0) {
          detail = await runDetailBatch({
            runtime,
            browser,
            posts: collected.posts,
            keyword: `user-profile:${userId}`,
            env,
            outputRoot,
            commentLimit: Math.max(0, numberArg(argv['max-comments'], 0)),
            repliesPerComment: Math.max(0, numberArg(argv['replies-per-comment'], 0)),
            contentEnabled: boolArg(argv['content-enabled'], true),
            imagesEnabled: boolArg(argv['images-enabled'], true),
            videosEnabled: boolArg(argv['videos-enabled'], false),
            linksEnabled: boolArg(argv['links-enabled'], true),
            commentsEnabled: boolArg(argv['comments-enabled'], true),
            expandAllReplies: boolArg(argv['expand-all-replies'], true),
          });
        }
        const ok = validation.result === 'pass' && (detail ? detail.ok : true);
        results.push({
          ok,
          userId,
          total: collected.posts.length,
          outputDir: ctx.keywordDir,
          ...(detail ? { detail } : {}),
          ...(ok ? {} : { error: detail && !detail.ok ? 'detail_failed' : 'empty_profile' }),
        });
      }
      const ok = results.length > 0 && results.every((result) => result.ok);
      runtime.finish(ok ? 'succeeded' : 'failed', { task_type: taskType, total_users: userIds.length });
      return { runId: runtime.runId, eventFile: runtime.eventStore.file(), ok, taskType, results, totalUsers: userIds.length };
    }

    if (taskType === 'search') {
      const keyword = requireKeyword(argv, 'WEIBO_SEARCH_KEYWORD_REQUIRED: --keyword is required for search task type');
      const result = await collectSearch({
        runtime,
        browser,
        topic: keyword,
        maxPages: Math.max(1, numberArg(argv['max-pages'], 3)),
        limit: target,
      });
      const ctx = resolveKeywordContext({ keyword: `search:${keyword}`, env, outputRoot });
      const { updateQueue, writeJson, appendLog } = await import('./artifacts.mjs');
      await updateQueue({
        postsPath: ctx.postsPath,
        linksPath: ctx.linksPath,
        posts: result.posts,
      });
      const meta = {
        platform: 'weibo',
        taskType,
        keyword,
        totalPosts: result.posts.length,
        completedAt: new Date().toISOString(),
      };
      await writeJson(ctx.metaPath, meta);
      await appendLog(ctx.logPath, `search_done keyword=${keyword} posts=${result.posts.length}`);
      const artifact = runtime.recordArtifact({
        artifactType: 'weibo-search-links',
        artifactId: `search:${keyword}`,
        payload: { posts: result.posts, meta },
        path: ctx.linksPath,
      });
      const validation = runtime.validateArtifact({
        artifact,
        validationSpecId: 'weibo.search.v1',
        result: result.posts.length > 0 ? 'pass' : 'fail',
        observedCount: result.posts.length,
        expectedCount: target,
      });
      assertArtifactPassed(validation, `WEIBO_SEARCH_EMPTY: no posts collected for ${keyword}`);
      runtime.finish('succeeded', { task_type: taskType, collected: result.posts.length });
      return { runId: runtime.runId, eventFile: runtime.eventStore.file(), ok: true, taskType, total: result.posts.length, outputDir: ctx.keywordDir };
    }

    const result = await collectTimeline({
      runtime,
      browser,
      target,
      scrollWaitMs,
      maxEmptyScrolls,
    });
    const ctx = resolveTimelineContext({ date, env, outputRoot });
    const { updateQueue, writeJson, appendLog } = await import('./artifacts.mjs');
    await updateQueue({
      postsPath: ctx.postsPath,
      linksPath: ctx.linksPath,
      posts: result.posts,
    });
    const meta = {
      platform: 'weibo',
      taskType: taskType === 'monitor' ? 'timeline' : taskType,
      date,
      totalPosts: result.posts.length,
      completedAt: new Date().toISOString(),
    };
    await writeJson(ctx.metaPath, meta);
    await appendLog(ctx.logPath, `timeline_done posts=${result.posts.length}`);
    const artifact = runtime.recordArtifact({
      artifactType: 'weibo-timeline-links',
      artifactId: `timeline:${date}`,
      payload: { posts: result.posts, meta },
      path: ctx.linksPath,
    });
    const validation = runtime.validateArtifact({
      artifact,
      validationSpecId: 'weibo.timeline.v1',
      result: result.posts.length > 0 ? 'pass' : 'fail',
      observedCount: result.posts.length,
      expectedCount: target,
    });
    assertArtifactPassed(validation, 'WEIBO_TIMELINE_EMPTY: no posts collected from timeline');
    runtime.finish('succeeded', { task_type: taskType, collected: result.posts.length });
    return { runId: runtime.runId, eventFile: runtime.eventStore.file(), ok: true, taskType, total: result.posts.length, outputDir: ctx.keywordDir };
  } catch (error) {
    runtime.finish('failed', { task_type: taskType, error: error?.message || String(error) });
    throw error;
  }
}

async function videoCommand(argv) {
  const url = stringArg(argv._?.[0] || argv.url);
  if (!url) throw new Error('video requires <url>');
  const profileId = stringArg(argv.profile || argv.p, 'weibo');
  const runtime = runtimeFor(argv);
  try {
    const result = await resolveVideo({ adapter: new CamoAdapter(), profileId, url });
    const artifact = runtime.recordArtifact({
      artifactType: 'weibo-video',
      artifactId: `video:${url}`,
      payload: result,
    });
    runtime.validateArtifact({
      artifact,
      validationSpecId: 'weibo.video.v1',
      result: result.videoUrl ? 'pass' : 'fail',
      observedCount: result.videoUrl ? 1 : 0,
      expectedCount: 1,
    });
    runtime.finish('succeeded', { task_type: 'video' });
    const copied = applyVideoCopy({ argv, result });
    return { ...result, copied, runId: runtime.runId, eventFile: runtime.eventStore.file() };
  } catch (error) {
    runtime.finish('failed', { task_type: 'video', error: error?.message || String(error) });
    throw error;
  }
}

async function producerCommand(argv) {
  const runtime = runtimeFor(argv);
  const browser = browserFor(argv);
  try {
    await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
    const result = await runProducer({
      runtime,
      browser,
      profileId: stringArg(argv.profile || argv.p, 'weibo'),
      taskType: stringArg(argv['task-type'], 'timeline'),
      userIds: stringArg(argv['user-ids']).split(',').map((value) => value.trim()).filter(Boolean),
      keyword: stringArg(argv.keyword || argv.k),
      env: stringArg(argv.env, 'prod'),
      outputRoot: stringArg(argv['output-root']),
      maxLinksPerScan: Math.max(1, numberArg(argv['max-links-per-scan'], 50)),
      maxScans: Math.max(1, numberArg(argv['max-scans'], 1)),
      scanIntervalMs: Math.max(1000, numberArg(argv['scan-interval-ms'], 30_000)),
      scrollWaitMs: Math.max(500, numberArg(argv['scroll-wait-ms'] ?? argv['scroll-delay'], 2500)),
      maxEmptyScrolls: Math.max(1, numberArg(argv['max-empty-scrolls'], 2)),
    });
    runtime.finish(result.ok ? 'succeeded' : 'failed', { task_type: 'producer' });
    return { ...result, runId: runtime.runId, eventFile: runtime.eventStore.file() };
  } catch (error) {
    runtime.finish('failed', { task_type: 'producer', error: error?.message || String(error) });
    throw error;
  }
}

async function consumerCommand(argv) {
  const runtime = runtimeFor(argv);
  const browser = browserFor(argv);
  try {
    await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
    const result = await runConsumer({
      runtime,
      browser,
      profileId: stringArg(argv.profile || argv.p, 'weibo'),
      taskType: stringArg(argv['task-type'], 'timeline'),
      keyword: stringArg(argv.keyword || argv.k),
      env: stringArg(argv.env, 'prod'),
      outputRoot: stringArg(argv['output-root']),
      maxPosts: Math.max(0, numberArg(argv['max-posts'], 0)),
      commentLimit: Math.max(0, numberArg(argv['max-comments'], 0)),
      repliesPerComment: Math.max(0, numberArg(argv['replies-per-comment'], 0)),
      contentEnabled: boolArg(argv['content-enabled'], true),
      imagesEnabled: boolArg(argv['images-enabled'], true),
      videosEnabled: boolArg(argv['videos-enabled'], false),
      linksEnabled: boolArg(argv['links-enabled'], true),
      commentsEnabled: boolArg(argv['comments-enabled'], true),
      expandAllReplies: boolArg(argv['expand-all-replies'], true),
      stopWhenIdle: boolArg(argv['stop-when-idle'], false),
      idleIntervalMs: Math.max(1000, numberArg(argv['idle-interval-ms'], 30_000)),
    });
    runtime.finish(result.ok ? 'succeeded' : 'failed', { task_type: 'consumer' });
    return { ...result, runId: runtime.runId, eventFile: runtime.eventStore.file() };
  } catch (error) {
    runtime.finish('failed', { task_type: 'consumer', error: error?.message || String(error) });
    throw error;
  }
}

async function specialFollowCommand(argv) {
  const subcommand = stringArg(argv.subcommand || argv._?.[0], 'status');
  const runtime = runtimeFor(argv, 'xhs-qa-1');
  const browser = browserFor(argv, 'xhs-qa-1');
  try {
    const {
      autoSyncSpecialFollowUsers,
      inspectSpecialFollow,
      readStoredSpecialFollowUsers,
      specialFollowStatus,
      startSpecialFollowMonitor,
      updateSpecialFollowUsers,
    } = await import('./special-follow.mjs');
    let result;
    if (subcommand === 'status') {
      result = await specialFollowStatus(stringArg(argv.env, 'prod'));
    } else if (subcommand === 'update-user-list' || subcommand === 'update') {
      await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
      result = await updateSpecialFollowUsers({
        runtime,
        browser,
        env: stringArg(argv.env, 'prod'),
        force: boolArg(argv.force || argv.f, false),
      });
    } else if (subcommand === 'sync' || subcommand === 'auto-sync') {
      await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
      result = await autoSyncSpecialFollowUsers({
        runtime,
        browser,
        env: stringArg(argv.env, 'prod'),
      });
    } else if (subcommand === 'inspect' || subcommand === 'check') {
      await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
      result = await inspectSpecialFollow({
        runtime,
        browser,
        env: stringArg(argv.env, 'prod'),
        delayMs: Math.max(1000, numberArg(argv.delay, 5000)),
      });
    } else if (subcommand === 'start' || subcommand === 'monitor') {
      const users = await readStoredSpecialFollowUsers(stringArg(argv.env, 'prod'));
      if (users.length > 0) {
        await browser.ensureStarted({ headless: boolArg(argv.headless, false) });
      }
      result = await startSpecialFollowMonitor({
        runtime,
        browser,
        env: stringArg(argv.env, 'prod'),
        intervalMs: Math.max(1000, numberArg(argv.interval, 600_000)),
        maxRounds: Math.max(1, numberArg(argv['max-rounds'], 100)),
        delayMs: Math.max(1000, numberArg(argv.delay, 5000)),
      });
    } else if (subcommand !== 'status') {
      throw new Error(`unknown special-follow command: ${subcommand}`);
    }
    runtime.finish(result.success === false ? 'failed' : 'succeeded', { task_type: 'special-follow', subcommand });
    return { ...result, runId: runtime.runId, eventFile: runtime.eventStore.file() };
  } catch (error) {
    runtime.finish('failed', { task_type: 'special-follow', error: error?.message || String(error) });
    throw error;
  }
}

function printHelp() {
  console.log(`webauto weibo v3

Usage:
  webauto weibo collect --profile <id> --keyword <kw> [options]
  webauto weibo detail --profile <id> --links-file <path> [options]
  webauto weibo unified --task-type <timeline|search|user-profile> [options]
  webauto weibo video <url> [options]
  webauto weibo producer [options]
  webauto weibo consumer [options]
`);
}

export async function runWeiboCli(command, argv = {}) {
  if (argv.help || argv.h) {
    printHelp();
    return { ok: true, help: true };
  }
  switch (command) {
    case 'collect': return collectCommand(argv);
    case 'detail': return detailCommand(argv);
    case 'unified':
    case 'timeline':
    case 'watch':
      return unifiedCommand({ ...argv, 'task-type': argv['task-type'] || (command === 'watch' ? 'monitor' : 'timeline') });
    case 'user-profile':
      return unifiedCommand({ ...argv, 'task-type': 'user-profile' });
    case 'video': return videoCommand(argv);
    case 'producer': return producerCommand(argv);
    case 'consumer': return consumerCommand(argv);
    case 'special-follow': return specialFollowCommand(argv);
    default:
      throw new Error(`unknown weibo v3 command: ${command}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = minimist(argv);
  const command = String(parsed._[0] || 'unified');
  const result = await runWeiboCli(command, parsed);
  if (!result?.help) output(result);
  if (result?.ok === false || result?.success === false) {
    process.exitCode = 1;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  assertDaemonAdmission();
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
