import { readDetailSnapshot, downloadImage, downloadVideo } from './detail-ops.mjs';
import { readCommentPanelState, scrollCommentsToBottom, extractComments, isCommentPanelEmpty, expandAllSubReplies } from './comments-ops.mjs';
import { executeOpenDetailOperation, executeCloseDetailOperation } from './detail-flow-ops.mjs';
import { sleep, devtoolsEval } from './common.mjs';
import { getWeiboProfileState } from './state.mjs';
import { buildTraceRecorder } from './trace.mjs';
import path from 'node:path';
import { captureScreenshotToFile, sanitizeFileComponent } from './diagnostic-utils.mjs';
import { ensureDir } from './persistence.mjs';

export async function downloadWithRetry(url, destDir, index, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await downloadImage(url, destDir, index);
      if (result) return result;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }
  return null;
}

export async function executeHarvestDetailOperation({ profileId, params = {} } = {}) {
  const url = String(params.url || '').trim();
  if (!url) {
    return { ok: false, error: 'WEIBO_HARVEST_NO_URL', message: 'url is required' };
  }

  const contentEnabled = params.contentEnabled !== false;
  const imagesEnabled = params.imagesEnabled !== false;
  const videosEnabled = params.videosEnabled === true;
  const linksEnabled = params.linksEnabled !== false;
  const commentsEnabled = params.commentsEnabled !== false;
  const expandAllReplies = params.expandAllReplies !== false;
  const maxComments = Number(params.maxComments) || 0;
  const bottomSelector = params.bottomSelector || 'div[class*="_box_1px0u"]';
  const bottomText = params.bottomText || '没有更多';

  const trace = buildTraceRecorder();
  const state = getWeiboProfileState(profileId);
  state.currentHref = url;

  const openResult = await executeOpenDetailOperation({ profileId, params: { url } });
  if (!openResult.ok) {
    const postDir = params.postDir || '';
    const diagDir = postDir ? path.join(postDir, 'diagnostic') : '';
    const diagFile = diagDir ? path.join(diagDir, `open-fail-${sanitizeFileComponent(url)}.png`) : `/tmp/weibo-diag-open-fail-${sanitizeFileComponent(url)}.png`;
    if (diagDir) await ensureDir(diagDir).catch(() => {});
    await captureScreenshotToFile({ profileId, filePath: diagFile }).catch(() => {});
    return { ok: false, error: openResult.error, message: openResult.message, url };
  }

  trace.pushTrace({ action: 'open_detail', ok: true, elapsed: openResult.elapsed });

  await sleep(1500);

  let snapshot = {};
  if (contentEnabled || imagesEnabled || videosEnabled || linksEnabled) {
    // Fix 3: anchor-driven wait for content container before snapshot
    if (contentEnabled) {
      const contentAnchors = ['[class*="detail_wbtext"]', '.wbpro-feed-content', '[class*="wbtext"]'];
      let contentReady = false;
      for (let retry = 0; retry < 2 && !contentReady; retry++) {
        const anchorStart = Date.now();
        const anchorTimeout = retry === 0 ? 5000 : 3000;
        while (Date.now() - anchorStart < anchorTimeout) {
          const checkScript = `(() => {
            const sels = ${JSON.stringify(contentAnchors)};
            for (const s of sels) {
              const el = document.querySelector(s);
              if (el && el.textContent.trim().length > 0) return true;
            }
            return false;
          })()`;
          try {
            const found = await devtoolsEval(profileId, checkScript);
            if (found) { contentReady = true; break; }
          } catch {}
          await sleep(300);
        }
        if (!contentReady && retry === 0) {
          await sleep(1000);
        }
      }
    }
    snapshot = await readDetailSnapshot(profileId).catch(() => ({}));
  }

  trace.pushTrace({ action: 'read_snapshot', hasContent: !!snapshot.contentText, imageCount: snapshot.images?.length || 0, videoCount: snapshot.videos?.length || 0 });

  let images = [];
  if (imagesEnabled && snapshot.images?.length > 0) {
    const imagesDir = params.imagesDir;
    if (imagesDir) {
      for (let i = 0; i < snapshot.images.length; i++) {
        const rawUrl = snapshot.images[i];
        const upgradedUrl = rawUrl
          ? rawUrl.replace(/\/orj480\//, '/large/').replace(/\/orj360\//, '/large/')
          : rawUrl;
        const result = await downloadWithRetry(upgradedUrl, imagesDir, i);
        if (result) images.push(result);
      }
    } else {
      images = snapshot.images;
    }
  }

  let videos = [];
  if (videosEnabled && snapshot.videos?.length > 0) {
    const videosDir = params.videosDir;
    if (videosDir) {
      for (let i = 0; i < snapshot.videos.length; i++) {
        const result = await downloadVideo(snapshot.videos[i], videosDir, i);
        if (result) videos.push(result);
      }
    } else {
      videos = snapshot.videos;
    }
  }

  let commentsResult = { comments: [], total: 0 };
  let commentScrollResult = null;
  if (commentsEnabled) {
    await sleep(1000);
    const isEmpty = await isCommentPanelEmpty(profileId).catch(() => true);
    if (!isEmpty) {
      commentScrollResult = await scrollCommentsToBottom(profileId, {
        maxScrolls: 50,
        scrollIntervalMs: 800,
        bottomSelector,
        bottomText,
        maxComments,
      });
      if (expandAllReplies) {
        const expandResult = await expandAllSubReplies(profileId).catch(() => null);
        if (expandResult) trace.pushTrace({ action: 'expand_sub_replies', expanded: expandResult.expanded });
      }
      commentsResult = await extractComments(profileId).catch(() => ({ comments: [], total: 0 }));
    }
  }

  trace.pushTrace({ action: 'extract_comments', count: commentsResult.total || 0 });

  if (snapshot.postIdFromUrl) state.visitedPostIds.push(snapshot.postIdFromUrl);
  state.metrics.harvestCount++;
  state.metrics.lastHarvestAt = new Date().toISOString();

  return {
    ok: true,
    url,
    postId: snapshot.postIdFromUrl || null,
    authorName: snapshot.authorName || '',
    publishedDate: snapshot.publishedDate || null,
    quotedContent: snapshot.quotedContent || null,
    quotedAuthor: snapshot.quotedAuthor || null,
    content: contentEnabled ? (snapshot.contentText || '') : null,
    images: imagesEnabled ? images : null,
    videos: videosEnabled ? videos : null,
    links: linksEnabled ? (snapshot.links || []) : null,
    comments: commentsEnabled ? (commentsResult.comments || []) : null,
    commentCount: commentsResult.total || 0,
    commentScrollResult,
    capturedAt: snapshot.capturedAt || new Date().toISOString(),
    actionTrace: trace.actionTrace,
  };
}
