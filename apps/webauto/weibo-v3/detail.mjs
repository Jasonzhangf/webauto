// Single post detail page DAG. The post body and media come from the mobile
// status API; comments and replies follow their API cursors.

import fs from 'node:fs/promises';
import { WEIBO_ANCHORS } from './browser.mjs';
import { readPostWithComments, readStatus } from './api-reader.mjs';
import {
  appendLog,
  ensureDir,
  resolveDetailContext,
  writeComments,
  writeCommentsMarkdown,
  writeContentMarkdown,
  writeJson,
} from './artifacts.mjs';
import { postIdFromUrl } from './extract.mjs';

async function extractDetailPage({
  browser,
  mid,
  commentLimit = 0,
  repliesPerComment = 0,
  commentsEnabled = true,
  expandAllReplies = true,
}) {
  if (!commentsEnabled) {
    return {
      status: await readStatus(browser, mid),
      comments: [],
    };
  }
  return readPostWithComments(browser, mid, {
    commentLimit,
    repliesPerComment,
    expandAllReplies,
  });
}

export async function extractDetail({
  runtime,
  browser,
  url,
  commentLimit = 0,
  repliesPerComment = 0,
  commentsEnabled = true,
  expandAllReplies = true,
} = {}) {
  if (!runtime) throw new Error('extractDetail requires the v3 runtime');
  if (!browser) throw new Error('extractDetail requires browser');
  const mid = postIdFromUrl(url);
  if (!mid) throw new Error(`cannot resolve post id from URL: ${url}`);
  const pageResult = await runtime.runPage({
    pageDagId: 'weibo.mobile.detail',
    browser,
    selectors: WEIBO_ANCHORS.mobileDetail,
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: 'detail',
      binding_id: 'weibo.detail',
      item_key: mid,
    },
    nodes: [
      {
        node_id: 'open',
        kind: 'Act',
        operation_kind: 'goto',
        operation_args: { url: `https://m.weibo.cn/detail/${mid}` },
        post_anchors: ['post.root'],
      },
      { node_id: 'extract', kind: 'Extract', post_anchors: ['post.root'] },
    ],
    executor: async (node, _observation, context) => {
      if (node.node_id !== 'open') return { ok: true, outputs: {} };
      const targetUrl = String(context.binding.item_key
        ? `https://m.weibo.cn/detail/${context.binding.item_key}`
        : node.operation_args?.url || '');
      await browser.goto(targetUrl);
      return { ok: true, outputs: { url: targetUrl } };
    },
    extractors: {
      extract: async () => extractDetailPage({
        browser,
        mid,
        commentLimit,
        repliesPerComment,
        commentsEnabled,
        expandAllReplies,
      }),
    },
  });
  if (pageResult.status !== 'succeeded') {
    throw new Error(`detail page DAG failed for ${mid}: ${pageResult.reason_code || pageResult.verdict || pageResult.status}`);
  }
  const extracted = pageResult.outputs.extract || {};
  return {
    mid,
    post: extracted.status,
    comments: extracted.comments || [],
    pageResult,
  };
}

export async function persistDetail({
  runtime,
  mid,
  post,
  comments = [],
  keyword = 'detail',
  env = 'prod',
  outputRoot = '',
  contentEnabled = true,
  imagesEnabled = true,
  videosEnabled = false,
  linksEnabled = true,
  commentsEnabled = true,
  onLog = null,
} = {}) {
  const ctx = resolveDetailContext({ keyword, env, outputRoot, postId: mid });
  await ensureDir(ctx.postDir);
  const images = imagesEnabled ? post.images : [];
  const video = videosEnabled ? post.video : null;
  const links = linksEnabled ? post.links || [] : [];

  if (contentEnabled) {
    await writeContentMarkdown({ filePath: ctx.contentPath, post });
  }
  if (commentsEnabled) {
    await writeComments({ filePath: ctx.commentsPath, comments });
    await writeCommentsMarkdown({ filePath: ctx.commentsMdPath, comments });
  }
  await writeJson(ctx.linksPath, links);

  const meta = {
    postId: mid,
    url: post.url,
    authorName: post.author?.name || null,
    collectedAt: new Date().toISOString(),
    publishedDate: post.createdAt || null,
    contentLength: post.content?.length || 0,
    imageCount: images.length,
    videoCount: video ? 1 : 0,
    linkCount: links.length,
    commentCount: comments.length,
    counts: post.counts,
    region: post.region,
    source: post.source,
  };
  await writeJson(ctx.metaPath, meta);
  await appendLog(ctx.logPath, `post_done postId=${mid} comments=${comments.length} images=${images.length}`);

  const artifact = runtime?.recordArtifact({
    artifactType: 'weibo-detail',
    artifactId: `${keyword}:${mid}`,
    payload: meta,
    path: ctx.metaPath,
  });
  runtime?.validateArtifact({
    artifact,
    validationSpecId: 'weibo.detail.v1',
    result: 'pass',
    observedCount: comments.length,
    expectedCount: null,
  });
  if (onLog) onLog({ event: 'weibo.detail.done', ...meta });
  return { ok: true, mid, context: ctx, meta, post, comments, images, video, links, artifact };
}

export async function collectDetail({
  runtime,
  browser,
  url,
  keyword = 'detail',
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
  onLog = null,
} = {}) {
  if (!runtime) throw new Error('collectDetail requires the v3 runtime');
  const mid = postIdFromUrl(url);
  if (!mid) throw new Error(`cannot resolve post id from URL: ${url}`);
  const ctx = resolveDetailContext({ keyword, env, outputRoot, postId: mid });
  await ensureDir(ctx.postDir);
  if (!force) {
    try {
      await fs.access(ctx.metaPath);
      return { ok: true, skipped: true, mid, context: ctx };
    } catch {
      // not completed yet
    }
  }

  const extracted = await extractDetail({
    runtime,
    browser,
    url,
    commentLimit,
    repliesPerComment,
    commentsEnabled,
    expandAllReplies,
  });
  return persistDetail({
    runtime,
    mid,
    post: extracted.post,
    comments: extracted.comments,
    keyword,
    env,
    outputRoot,
    contentEnabled,
    imagesEnabled,
    videosEnabled,
    linksEnabled,
    commentsEnabled,
    onLog,
  });
}
