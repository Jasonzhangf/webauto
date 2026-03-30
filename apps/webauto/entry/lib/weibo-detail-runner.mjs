import { runCamo } from './camo-cli.mjs';
import {
  resolveWeiboDetailOutputContext,
  ensureDir,
  appendLog,
  writeDetailContent,
  writeDetailComments,
  writeDetailCommentsMd,
  writeDetailLinks,
  writeDetailMeta,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';
import { executeHarvestDetailOperation } from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/harvest-ops.mjs';

import { sleep } from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/common.mjs';

function generateRunId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const rand = Math.random().toString(36).slice(2, 6);
  return `wbd_${ts}_${rand}`;
}

function resolveDetailArgs(argv = {}) {
  const profileId = String(argv.profile || argv.p || '').trim();
  if (!profileId) throw new Error('WEIBO_DETAIL_PROFILE_REQUIRED: --profile is required');

  const linksFile = String(argv['links-file'] || '').trim();
  if (!linksFile) throw new Error('WEIBO_DETAIL_LINKS_FILE_REQUIRED: --links-file is required');

  const maxPosts = Number.isFinite(Number(argv['max-posts'] ?? argv['max-notes'] ?? argv.n)) ? Math.max(1, Number(argv['max-posts'] ?? argv['max-notes'] ?? argv.n)) : 10;
  const contentEnabled = argv['content-enabled'] !== 'false';
  const imagesEnabled = argv['images-enabled'] !== 'false';
  const videosEnabled = argv['videos-enabled'] === 'true';
  const linksEnabled = argv['links-enabled'] !== 'false';
  const commentsEnabled = argv['comments-enabled'] !== 'false';
  const expandAllReplies = argv['expand-all-replies'] !== 'false';
  const maxComments = Number.isFinite(Number(argv['max-comments'])) ? Math.max(0, Number(argv['max-comments'])) : 0;
  const env = String(argv.env || argv.e || 'prod').trim() || 'prod';
  const outputRoot = String(argv['output-root'] || '').trim();
  const postIntervalMinMs = Number.isFinite(Number(argv['post-interval-min'] ?? argv['note-interval'])) ? Number(argv['post-interval-min'] ?? argv['note-interval']) : 2000;
  const postIntervalMaxMs = Number.isFinite(Number(argv['post-interval-max'] ?? argv['note-interval'])) ? Number(argv['post-interval-max'] ?? (Number(argv['note-interval']) * 2 || 5000)) : 5000;
  const force = argv.force === 'true' || argv.force === true;

  const keyword = String(argv.keyword || argv.k || '').trim();
  return {
    profileId,
    linksFile,
    maxPosts,
    contentEnabled,
    imagesEnabled,
    videosEnabled,
    linksEnabled,
    commentsEnabled,
    expandAllReplies,
    maxComments,
    env,
    outputRoot,
    postIntervalMinMs,
    postIntervalMaxMs,
    force,
    keyword,
  };
}

export function getWeiboDetailHelpLines() {
  return [
    'Usage: webauto weibo detail --profile <id> --links-file <path> [options]',
    '',
    'Required:',
    '  -p, --profile <id>              camo profile ID (required)',
    '  --links-file <path>         links.jsonl 文件路径 (required)',
    '',
    'Options:',
    '  -n, --max-posts <n>             最大帖子数 (default: 10)',
    '      --max-notes <n>             alias for --max-posts',
    '  --content-enabled <bool>    采集正文 (default: true)',
    '  --images-enabled <bool>     下载图片 (default: true)',
    '  --videos-enabled <bool>     下载视频 (default: false)',
    '  --links-enabled <bool>      采集外链 (default: true)',
    '  --comments-enabled <bool>   采集评论 (default: true)',
    '  --expand-all-replies <bool> 展开子回复 (default: true)',
    '  --max-comments <n>          最大评论数 0=全部 (default: 0)',
    '  -e, --env <name>                输出env目录 (default: prod)',
    '  --output-root <path>        自定义输出根目录',
    '  --post-interval-min <ms>    帖子间隔最小ms (default: 2000)',
    '  --post-interval-max <ms>    帖子间隔最大ms (default: 5000)',
    '  --force                     强制重新采集，跳过已完成 (default: false)',
    '  -k, --keyword <kw>              关键词，用于输出目录命名 (default: detail)',
    '',
    'Examples:',
    '  WEBAUTO_DAEMON_BYPASS=1 webauto weibo detail --profile weibo --links-file ./links.jsonl --max-posts 5',
    '  WEBAUTO_DAEMON_BYPASS=1 webauto weibo detail --profile weibo --links-file ./links.jsonl --max-posts 1 --comments-enabled false',
  ];
}

function randomMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function extractPostIdFromUrl(url) {
  try {
    const parts = url.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.split('?')[0].split('#')[0];
  } catch {}
  return null;
}

function buildContentMarkdown(harvest) {
  const lines = [];
  lines.push('# 微博正文');
  lines.push('');
  if (harvest.postId) lines.push(`- Post ID: ${harvest.postId}`);
  if (harvest.authorName) lines.push(`- 作者: ${harvest.authorName}`);
  if (harvest.url) lines.push(`- 链接: ${harvest.url}`);
  if (harvest.publishedDate) lines.push(`- 发布时间: ${harvest.publishedDate}`);
  lines.push(`- 采集时间: ${harvest.capturedAt || new Date().toISOString()}`);
  lines.push('');
  lines.push('## 正文');
  lines.push('');
  lines.push(harvest.content || '（无正文）');
  if (harvest.quotedContent) {
    lines.push('');
    lines.push('## 转发原文');
    lines.push('');
    lines.push(`> 作者: ${harvest.quotedAuthor || '未知'}`);
    lines.push('');
    lines.push(harvest.quotedContent);
  }
  lines.push('');
  if (Array.isArray(harvest.links) && harvest.links.length > 0) {
    lines.push('## 外链');
    lines.push('');
    for (const link of harvest.links) {
      lines.push(`- [${link.text || link.href}](${link.href})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function loadLinks(linksFile) {
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(linksFile, 'utf8');
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && r.url);
}

async function harvestSinglePost(profileId, post, args) {
  const url = post.url;
  const postId = post.id || extractPostIdFromUrl(url) || 'unknown';

  // Resolve output context first so harvest-ops can download directly to target dirs
  const preCtx = resolveWeiboDetailOutputContext({
    params: {
      keyword: args.keyword || 'detail',
      env: args.env,
      outputRoot: args.outputRoot,
      postId,
    },
  });

  const harvest = await executeHarvestDetailOperation({
    profileId,
    params: {
      url,
      contentEnabled: args.contentEnabled,
      imagesEnabled: args.imagesEnabled,
      videosEnabled: args.videosEnabled,
      linksEnabled: args.linksEnabled,
      commentsEnabled: args.commentsEnabled,
      expandAllReplies: args.expandAllReplies,
      maxComments: args.maxComments,
      bottomSelector: 'div[class*="_box_1px0u"]',
      bottomText: '没有更多',
      imagesDir: args.imagesEnabled ? preCtx.imagesDir : null,
      videosDir: args.videosEnabled ? preCtx.videosDir : null,
    },
  });

  // Promote postId from URL extraction if harvest-ops didn't return it
  if (harvest?.ok && !harvest.postId) {
    harvest.postId = postId;
  }

  if (!harvest?.ok) {
    return { ok: false, postId, error: harvest?.error || 'harvest_failed' };
  }

  return harvest;
}

async function persistPostResult(harvest, args, logPath) {
  const postId = harvest?.postId || 'unknown';
  const ctx = resolveWeiboDetailOutputContext({
    params: {
      keyword: args.keyword || 'detail',
      env: args.env,
      outputRoot: args.outputRoot,
      postId,
    },
  });

  await ensureDir(ctx.postDir);

  if (args.contentEnabled && harvest.content) {
    const markdown = buildContentMarkdown(harvest);
    await writeDetailContent({ filePath: ctx.contentPath, content: markdown });
  }

  if (args.linksEnabled && harvest.links) {
    await writeDetailLinks({ filePath: ctx.linksPath, links: harvest.links });
  }

  if (args.commentsEnabled) {
    await writeDetailComments({ filePath: ctx.commentsPath, comments: harvest.comments || [] });
    await writeDetailCommentsMd({ filePath: ctx.commentsMdPath, comments: harvest.comments || [] });
  }

  if (args.imagesEnabled && harvest.images?.length > 0 && ctx.imagesDir) {
    await ensureDir(ctx.imagesDir);
  }

  if (args.videosEnabled && harvest.videos?.length > 0 && ctx.videosDir) {
    await ensureDir(ctx.videosDir);
  }

  await writeDetailMeta({
    filePath: ctx.metaPath,
    meta: {
      postId,
      url: harvest.url,
      authorName: harvest.authorName,
      collectedAt: harvest.capturedAt,
      publishedDate: harvest.publishedDate || null,
      contentLength: (harvest.content || '').length,
      imageCount: harvest.images?.length || 0,
      videoCount: harvest.videos?.length || 0,
      linkCount: harvest.links?.length || 0,
      commentCount: harvest.commentCount || 0,
      commentScrollResult: harvest.commentScrollResult || null,
      quotedContent: harvest.quotedContent || null,
      quotedAuthor: harvest.quotedAuthor || null,
    },
  });

  await appendLog({
    filePath: logPath,
    message: `post_done postId=${postId} content=${!!harvest.content} images=${harvest.images?.length || 0} comments=${harvest.commentCount || 0}`,
  });

  return ctx;
}

export async function runWeiboDetail(argv = {}) {
  const args = resolveDetailArgs(argv);
  const runId = generateRunId();
  const startedAt = new Date().toISOString();

  const links = await loadLinks(args.linksFile);
  if (links.length === 0) {
    console.log(JSON.stringify({ ok: false, error: 'WEIBO_DETAIL_EMPTY_LINKS', message: 'links.jsonl is empty' }));
    return;
  }

  const maxPosts = Math.min(args.maxPosts, links.length);
  const keyword = args.keyword || 'detail';
  const logCtx = resolveWeiboDetailOutputContext({
    params: { keyword, env: args.env, outputRoot: args.outputRoot, postId: '_meta' },
  });
  const logPath = logCtx.logPath;

  await appendLog({
    filePath: logPath,
    message: `run_start runId=${runId} totalLinks=${links.length} maxPosts=${maxPosts} profile=${args.profileId}`,
  });

  let successCount = 0;
  let failCount = 0;
  const results = [];

  // Scan for already-completed posts (skip visited unless --force)
  const visitedPostIds = new Set();
  if (!args.force) {
    const fs = await import('node:fs/promises');
    for (let j = 0; j < links.length; j++) {
      const pid = links[j].id || extractPostIdFromUrl(links[j].url) || `idx_${j}`;
      const preCtx = resolveWeiboDetailOutputContext({
        params: { keyword, env: args.env, outputRoot: args.outputRoot, postId: pid },
      });
      try {
        await fs.access(preCtx.metaPath);
        visitedPostIds.add(pid);
      } catch {}
    }
    if (visitedPostIds.size > 0) {
      await appendLog({ filePath: logPath, message: `skip_visited count=${visitedPostIds.size} posts=${[...visitedPostIds].slice(0, 10).join(',')}` });
    }
  }

  for (let i = 0; i < maxPosts; i++) {
    const post = links[i];
    const postId = post.id || extractPostIdFromUrl(post.url) || `idx_${i}`;

    if (!args.force && visitedPostIds.has(postId)) {
      await appendLog({ filePath: logPath, message: `post_skip postId=${postId} reason=already_completed` });
      results.push({ postId, ok: true, skipped: true });
      successCount++;
      continue;
    }

    try {
      const harvest = await harvestSinglePost(args.profileId, post, args);
      if (harvest && harvest.ok) {
        const ctx = await persistPostResult(harvest, { ...args, keyword }, logPath);
        successCount++;
        results.push({ postId, ok: true, dir: ctx?.postDir });
      } else {
        failCount++;
        results.push({ postId, ok: false, error: harvest?.error || 'harvest_failed' });
        await appendLog({ filePath: logPath, message: `post_fail postId=${postId} error=${harvest?.error || 'unknown'}` });
      }
    } catch (err) {
      failCount++;
      results.push({ postId, ok: false, error: err?.message || String(err) });
      await appendLog({ filePath: logPath, message: `post_exception postId=${postId} error="${err?.message || String(err)}"` });
    }

    if (i < maxPosts - 1) {
      const delay = randomMs(args.postIntervalMinMs, args.postIntervalMaxMs);
      await appendLog({ filePath: logPath, message: `post_interval postId=${postId} nextIn=${delay}ms` });
      await sleep(delay);
    }
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    ok: true,
    runId,
    startedAt,
    finishedAt,
    profileId: args.profileId,
    totalLinks: links.length,
    maxPosts,
    successCount,
    failCount,
    results,
  };

  await appendLog({
    filePath: logPath,
    message: `run_end runId=${runId} success=${successCount} fail=${failCount}`,
  });

  console.log(JSON.stringify(summary, null, 2));
}
