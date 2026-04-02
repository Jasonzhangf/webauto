import { runCamo } from './camo-cli.mjs';
import { extractSearchPage } from './weibo-search-extract.mjs';
import {
  resolveWeiboOutputContext,
  mergeWeiboPosts,
  writeWeiboLinks,
  writeCollectionMeta,
  appendLog,
  readJsonlRows,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRunId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const rand = Math.random().toString(36).slice(2, 6);
  return `wb_${ts}_${rand}`;
}
// NOTE: Weibo search card DOM does not reliably expose publish date.


function normalizePost(raw) {
  if (!raw || !raw.url) return null;
  return {
    id: raw.url.split('/').pop() || null,
    url: raw.url,
    authorId: raw.authorId || null,
    authorName: raw.author || null,
    content: raw.content || null,
    publishedDate: raw.publishedDate || "unknown",
    collectedAt: new Date().toISOString(),
  };
}

function resolveCollectArgs(argv = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  if (!keyword) throw new Error('WEIBO_COLLECT_KEYWORD_REQUIRED: --keyword is required');
  const maxNotes = Number.isFinite(Number(argv['max-notes'] ?? argv.target ?? argv.n))
    ? Math.max(1, Number(argv['max-notes'] ?? argv.target ?? argv.n))
    : 10;
  const env = String(argv.env || argv.e || 'prod').trim() || 'prod';
  const outputRoot = String(argv['output-root'] || '').trim();
  const maxPages = Number.isFinite(Number(argv['max-pages'])) ? Math.max(1, Number(argv['max-pages'])) : 50;
  const profileId = String(argv.profile || argv.p || '').trim();
  if (!profileId) throw new Error('WEIBO_COLLECT_PROFILE_REQUIRED: --profile is required');
  const pageDelayMs = Number.isFinite(Number(argv['page-delay'] ?? argv['note-interval']))
    ? Math.max(500, Number(argv['page-delay'] ?? argv['note-interval']))
    : 2000;
  return { keyword, maxNotes, env, outputRoot, maxPages, profileId, pageDelayMs };
}

export function getWeiboCollectHelpLines() {
  return [
    'Usage: webauto weibo collect --profile <id> --keyword <kw> [options]',
    '',
    'Options:',
    '  -p, --profile <id>       camo profile ID (required)',
    '  -k, --keyword <kw>       search keyword (required)',
    '  -n, --max-notes <n>      target link count (default: 10)',
    '      --target <n>         alias for --max-notes',
    '  -e, --env <name>         output env dir (default: prod)',
    '  --output-root <p>    custom output root dir',
    '  --max-pages <n>      max pages to crawl (default: 50)',
    '  --page-delay <ms>    delay between pages (default: 2000)',
    '',
    'Examples:',
    '  WEBAUTO_DAEMON_BYPASS=1 webauto weibo collect -p weibo -k "AI" -n 10',
    '  WEBAUTO_DAEMON_BYPASS=1 webauto weibo collect --profile weibo --keyword "AI" --max-pages 3',
    ];
}

export async function runWeiboCollect(argv = {}) {
  const { keyword, maxNotes: target, env, outputRoot, maxPages, profileId, pageDelayMs } = resolveCollectArgs(argv);
  const runId = generateRunId();
  const startedAt = new Date().toISOString();
  const ctx = resolveWeiboOutputContext({ params: { keyword: 'search:' + keyword, env, outputRoot } });

  await appendLog({ filePath: ctx.logPath, message: `run_start runId=${runId} keyword="${keyword}" target=${target} profile=${profileId}` });

  const allPosts = [];
  let consecutiveEmptyPages = 0;
  let currentPage = 1;

  for (let page = 1; page <= maxPages; page++) {
    currentPage = page;
    const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&page=${page}`;

    await appendLog({ filePath: ctx.logPath, message: `page_start page=${page} url="${searchUrl}" collected=${allPosts.length}` });

    const gotoResult = runCamo(['goto', profileId, searchUrl], { timeoutMs: 30000 });
    if (!gotoResult.ok) {
      await appendLog({ filePath: ctx.logPath, message: `page_error page=${page} error="goto failed: ${gotoResult.stderr?.slice(0, 200) || 'unknown'}"` });
      console.error(`page ${page}: goto failed - ${gotoResult.stderr?.slice(0, 200) || 'unknown'}`);
      break;
    }

    await sleep(Math.min(pageDelayMs, 1500));

    const { posts, hasNext, nextHref, error } = await extractSearchPage({ profileId });
    if (error) {
      await appendLog({ filePath: ctx.logPath, message: `page_error page=${page} error="${error}"` });
      console.error(`page ${page}: extract error - ${error}`);
    }

    const newPosts = posts.map(normalizePost).filter(Boolean);
    let addedCount = 0;
    for (const post of newPosts) {
      const exists = allPosts.some((p) => p.url === post.url);
      if (!exists) {
        allPosts.push(post);
        addedCount++;
      }
    }

    await appendLog({ filePath: ctx.logPath, message: `page_done page=${page} extracted=${newPosts.length} new=${addedCount} total=${allPosts.length} hasNext=${hasNext}` });
    console.log(JSON.stringify({ event: 'weibo.collect.page', page, extracted: newPosts.length, added: addedCount, total: allPosts.length, hasNext }));

    if (addedCount === 0) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= 2) {
        await appendLog({ filePath: ctx.logPath, message: `stopping consecutive_empty_pages=${consecutiveEmptyPages}` });
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
    }

    if (allPosts.length >= target) {
      await appendLog({ filePath: ctx.logPath, message: `target_reached target=${target} collected=${allPosts.length}` });
      break;
    }

    if (!hasNext || !nextHref) {
      await appendLog({ filePath: ctx.logPath, message: `no_more_pages page=${page}` });
      break;
    }

    await sleep(pageDelayMs);
  }

  const finalPosts = allPosts.slice(0, Math.max(target, allPosts.length));
  await mergeWeiboPosts({ filePath: ctx.postsPath, posts: finalPosts });
  await writeWeiboLinks({ filePath: ctx.linksPath, posts: finalPosts });

  const meta = {
    runId,
    platform: 'weibo',
    keyword,
    target,
    collected: finalPosts.length,
    pages: currentPage,
    profileId,
    env,
    startedAt,
    completedAt: new Date().toISOString(),
    status: finalPosts.length >= target ? 'TARGET_REACHED' : 'PAGES_EXHAUSTED',
  };
  await writeCollectionMeta({ filePath: ctx.metaPath, meta });

  await appendLog({ filePath: ctx.logPath, message: `run_done runId=${runId} collected=${finalPosts.length} status=${meta.status}` });

  console.log(JSON.stringify({
    event: 'weibo.collect.done',
    runId,
    keyword,
    target,
    collected: finalPosts.length,
    pages: currentPage,
    status: meta.status,
    keywordDir: ctx.keywordDir,
  }));

  return { runId, collected: finalPosts.length, keywordDir: ctx.keywordDir, meta };
}
