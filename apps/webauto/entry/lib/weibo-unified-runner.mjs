import { runCamo } from './camo-cli.mjs';
import {
  resolveTimelineOutputContext,
  resolveWeiboOutputContext,
  mergeWeiboPosts,
  writeWeiboLinks,
  writeCollectionMeta,
  appendLog,
  ensureDir,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';
import {
  navigateToWeiboHomepage,
  checkWeiboLoggedIn,
  harvestTimeline,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/timeline-ops.mjs';
import { extractSearchPage } from './weibo-search-extract.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRunId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const rand = Math.random().toString(36).slice(2, 6);
  return `wb_${ts}_${rand}`;
}

function resolveUnifiedArgs(argv = {}) {
  const taskType = String(argv['task-type'] || argv.taskType || 'timeline').trim();
  const profileId = String(argv.profile || argv.p || 'weibo').trim();
  const target = Math.max(1, Number(argv.target || argv.t || 50));
  const env = String(argv.env || argv.e || 'prod').trim();
  const date = String(argv.date || '').trim() || new Date().toISOString().slice(0, 10);
  const outputRoot = String(argv['output-root'] || '').trim();
  const scrollDelay = Math.max(500, Number(argv['scroll-delay'] || 2500));
  const maxEmptyScrolls = Math.max(1, Number(argv['max-empty-scrolls'] || 2));
  const keyword = String(argv.keyword || argv.k || '').trim();
  const maxPages = Math.max(1, Number(argv['max-pages'] || 3));

  return {
    taskType,
    profileId,
    target,
    env,
    date,
    outputRoot,
    scrollDelay,
    maxEmptyScrolls,
    keyword,
    maxPages,
  };
}

export function printWeiboUnifiedHelp() {
  console.log(`
weibo-unified - Weibo unified collection runner

Usage: node weibo-unified.mjs [options]

Options:
  --task-type <timeline|search|monitor>  Task type (default: timeline)
  --profile <id>                         Camoufox profile ID (default: weibo)
  --target <number>                      Max posts to collect (default: 50)
  --env <string>                         Environment label (default: prod)
  --date <YYYY-MM-DD>                    Collection date (default: today)
  --output-root <path>                   Output root directory
  --scroll-delay <ms>                    Scroll interval in ms (default: 2500)
  --max-empty-scrolls <n>                Stop after N empty scrolls (default: 2)
  --keyword <string>                     Search keyword (required for search type)
  --max-pages <number>                   Max search pages (default: 3)
  -h, --help                             Show this help
`.trim());
}

async function runTimelineTask(args) {
  const { profileId, target, env, date, outputRoot, scrollDelay, maxEmptyScrolls } = args;
  const runId = generateRunId();
  const params = { env, date, outputRoot };
  const ctx = resolveTimelineOutputContext({ params });
  await ensureDir(ctx.collectionDir);

  await appendLog({ filePath: ctx.logPath, message: `[${runId}] timeline task started, target=${target}` });
  console.log(`[${runId}] Navigating to weibo homepage...`);

  const navResult = await navigateToWeiboHomepage(profileId);
  if (!navResult.ok) {
    await appendLog({ filePath: ctx.logPath, message: `[${runId}] navigation failed: ${navResult.error}` });
    throw new Error(`WEIBO_TIMELINE_NAV_FAILED: ${navResult.error}`);
  }

  const loginCheck = await checkWeiboLoggedIn(profileId);
  if (!loginCheck.ok) {
    await appendLog({ filePath: ctx.logPath, message: `[${runId}] not logged in, title=${loginCheck.title}` });
    throw new Error(`WEIBO_TIMELINE_NOT_LOGGED_IN: title=${loginCheck.title}`);
  }
  console.log(`[${runId}] Logged in: ${loginCheck.title}`);

  const harvestResult = await harvestTimeline({
    profileId,
    maxPosts: target,
    scrollDelayMs: scrollDelay,
    maxEmptyScrolls,
  });
  console.log(`[${runId}] Harvested ${harvestResult.total} posts, emptyScrolls=${harvestResult.emptyScrolls}`);

  if (harvestResult.posts.length > 0) {
    await mergeWeiboPosts({ filePath: ctx.postsPath, posts: harvestResult.posts });
    await writeWeiboLinks({ filePath: ctx.linksPath, posts: harvestResult.posts });
  }

  await writeCollectionMeta({ filePath: ctx.metaPath, meta: {
    runId,
    taskType: 'timeline',
    date,
    env,
    totalPosts: harvestResult.total,
    emptyScrolls: harvestResult.emptyScrolls,
    completedAt: new Date().toISOString(),
  }});

  await appendLog({ filePath: ctx.logPath, message: `[${runId}] timeline task completed, total=${harvestResult.total}` });

  return {
    ok: true,
    taskType: 'timeline',
    runId,
    total: harvestResult.total,
    outputDir: ctx.collectionDir,
  };
}

async function runSearchTask(args) {
  const { profileId, keyword, env, maxPages, outputRoot, target } = args;
  if (!keyword) {
    throw new Error('WEIBO_SEARCH_KEYWORD_REQUIRED: --keyword is required for search task type');
  }
  const runId = generateRunId();
  const params = { keyword, env, outputRoot };
  const ctx = resolveWeiboOutputContext({ params });
  await ensureDir(ctx.keywordDir);

  await appendLog({ filePath: ctx.logPath, message: `[${runId}] search task started, keyword=${keyword}` });
  console.log(`[${runId}] Navigating to weibo search page...`);

  // Navigate to search page first (no keyword in URL)
  const navResult = runCamo(['goto', profileId, '--url', 'https://s.weibo.com/weibo'], { timeoutMs: 15000 });
  if (!navResult.ok) {
    await appendLog({ filePath: ctx.logPath, message: `[${runId}] navigation failed: ${navResult.stderr}` });
    throw new Error(`WEIBO_SEARCH_NAV_FAILED: ${navResult.stderr}`);
  }
  await sleep(3000);

  // Type keyword into search box and submit (in-page input, not URL construction)
  const fillScript = `(() => {
    const input = document.querySelector('input.search-input') || document.querySelector('input[type="text"]') || document.querySelector('#pl_keyword');
    if (!input) return JSON.stringify({ ok: false, error: 'search input not found' });
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, ${JSON.stringify(keyword)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify({ ok: true });
  })()`;
  const fillResult = runCamo(['devtools', 'eval', profileId, '--script', fillScript], { timeoutMs: 10000 });
  const fillData = JSON.parse(String(fillResult.stdout || '{}'));
  if (!fillData?.result?.value?.ok) {
    throw new Error('WEIBO_SEARCH_INPUT_FAILED: could not fill search input');
  }
  await sleep(500);

  // Press Enter to submit search
  const submitResult = runCamo(['keyboard', 'press', profileId, '--key', 'Enter'], { timeoutMs: 5000 });
  if (!submitResult.ok) {
    throw new Error(`WEIBO_SEARCH_SUBMIT_FAILED: ${submitResult.stderr}`);
  }
  await sleep(3000);

  const allPosts = [];
  const seenUrls = new Set();

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) {
      // Click next page button in-page instead of constructing URL
      const nextBtnScript = `(() => {
        const nextBtn = document.querySelector('a.next') || document.querySelector('.page.next') || document.querySelector('[class*="next"]');
        if (nextBtn) { nextBtn.click(); return 'clicked'; }
        return 'not-found';
      })()`;
      runCamo(['devtools', 'eval', profileId, '--script', nextBtnScript], { timeoutMs: 5000 });
      await sleep(3000);
    }

    const extractResult = await extractSearchPage({ profileId });
    if (!extractResult.ok || !extractResult.json) {
      console.warn(`[${runId}] Page ${page} extract failed: ${extractResult.stderr}`);
      continue;
    }

    const evalData = extractResult.json;
    if (!evalData.result?.value) continue;

    let posts;
    try {
      posts = JSON.parse(evalData.result.value).posts || [];
    } catch {
      console.warn(`[${runId}] Page ${page} JSON parse failed`);
      continue;
    }

    for (const post of posts) {
      if (!post.url || seenUrls.has(post.url)) continue;
      if (allPosts.length >= target) break;
      seenUrls.add(post.url);
      post.collectedAt = new Date().toISOString();
      allPosts.push(post);
    }

    if (allPosts.length >= target) break;
    await appendLog({ filePath: ctx.logPath, message: `[${runId}] page ${page}: ${posts.length} raw, ${allPosts.length} total` });
  }

  if (allPosts.length > 0) {
    await mergeWeiboPosts({ filePath: ctx.postsPath, posts: allPosts });
    await writeWeiboLinks({ filePath: ctx.linksPath, posts: allPosts });
  }

  await writeCollectionMeta({ filePath: ctx.metaPath, meta: {
    runId,
    taskType: 'search',
    keyword,
    env,
    totalPosts: allPosts.length,
    maxPages,
    completedAt: new Date().toISOString(),
  }});

  await appendLog({ filePath: ctx.logPath, message: `[${runId}] search task completed, total=${allPosts.length}` });

  return {
    ok: true,
    taskType: 'search',
    runId,
    total: allPosts.length,
    outputDir: ctx.keywordDir,
  };
}

async function runMonitorTask(args) {
  console.log('[weibo-unified] monitor mode: delegating to timeline task');
  return runTimelineTask(args);
}

export async function runWeiboUnified(argv = {}) {
  const args = resolveUnifiedArgs(argv);
  console.log(`[weibo-unified] task-type=${args.taskType} profile=${args.profileId} target=${args.target}`);

  switch (args.taskType) {
    case 'search':
      return runSearchTask(args);
    case 'monitor':
      return runMonitorTask(args);
    case 'timeline':
    default:
      return runTimelineTask(args);
  }
}
