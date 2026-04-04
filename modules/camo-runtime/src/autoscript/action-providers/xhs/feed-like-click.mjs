import path from 'node:path';
import { clickPoint, waitForAnchor } from './dom-ops.mjs';
import { captureScreenshotToFile } from '../../shared/diagnostic-utils.mjs';
import { readNoteLikeStatus } from './feed-like-candidates.mjs';

export async function executeFeedLikeClick({ profileId, candidate, pushTrace }) {
  if (!candidate || !candidate.center) {
    return { ok: false, code: 'INVALID_CANDIDATE' };
  }

  const captureLikeSnapshot = async (suffix) => {
    const kw = String(candidate?.keyword || 'unknown').trim() || 'unknown';
    const note = String(candidate?.noteId || 'unknown').trim() || 'unknown';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(
      process.env.HOME || process.env.USERPROFILE || '/tmp',
      '.webauto', 'download', 'xiaohongshu', 'debug', kw, 'diagnostics',
      `feed-like-${suffix}-${note}-${ts}.png`,
    );
    return captureScreenshotToFile({ profileId, filePath }).catch(() => null);
  };

  const preShot = await Promise.race([
    captureLikeSnapshot('pre'),
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const noteId = String(candidate?.noteId || '').trim();
  const likeActiveSelectors = noteId
    ? [
        `.note-item a.cover[href*="${noteId}"] ~ .footer .like-wrapper svg.reds-icon.like-icon use[*|href="#liked"]`,
      ]
    : [];

  if (likeActiveSelectors.length > 0) {
    const preCheck = await waitForAnchor(profileId, {
      selectors: likeActiveSelectors,
      timeoutMs: 1000,
      intervalMs: 100,
      description: 'feed_like_pre_check_already_liked',
    }).catch(() => null);

    if (preCheck?.ok === true) {
      pushTrace({
        kind: 'click',
        stage: 'feed_like',
        noteId: candidate.noteId,
        center: candidate.center,
        selectorChanged: false,
        preShot,
        postShot: null,
        code: 'ALREADY_LIKED',
      });
      return { ok: false, code: 'ALREADY_LIKED', noteId: candidate.noteId, preShot };
    }
  }

  try {
    await clickPoint(profileId, candidate.center, { clicks: 1 });
  } catch {
    pushTrace({
      kind: 'skip',
      stage: 'feed_like',
      noteId: candidate.noteId,
      reason: 'click_timeout_or_error',
    });
    return { ok: false, code: 'CLICK_FAILED', noteId: candidate.noteId, preShot };
  }

  const postSelector = likeActiveSelectors.length > 0
    ? await waitForAnchor(profileId, {
        selectors: likeActiveSelectors,
        timeoutMs: 5000,
        intervalMs: 200,
        description: 'feed_like_selector_turned_active',
      }).catch(() => ({ ok: false, reason: 'anchor_timeout' }))
    : { ok: false, reason: 'no_noteId' };

  const postStatus = { ok: postSelector?.ok === true, liked: postSelector?.ok === true };

  const postShot = await Promise.race([
    captureLikeSnapshot('post'),
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const selectorChanged = postSelector?.ok === true && postStatus?.ok === true && postStatus?.liked === true;

  pushTrace({
    kind: 'click',
    stage: 'feed_like',
    noteId: candidate.noteId,
    center: candidate.center,
    selectorChanged,
    preShot,
    postShot,
    postStatus,
  });

  return {
    ok: selectorChanged,
    code: selectorChanged ? 'LIKE_DONE' : 'LIKE_SELECTOR_NOT_CHANGED',
    noteId: candidate.noteId,
    preShot,
    postShot,
    selectorChanged,
  };
}

export async function executeFeedUnlikeClick({ profileId, candidate, pushTrace }) {
  if (!candidate || !candidate.center) {
    return { ok: false, code: 'INVALID_CANDIDATE' };
  }

  const captureUnlikeSnapshot = async (suffix) => {
    const kw = String(candidate?.keyword || 'unknown').trim() || 'unknown';
    const note = String(candidate?.noteId || 'unknown').trim() || 'unknown';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(
      process.env.HOME || process.env.USERPROFILE || '/tmp',
      '.webauto', 'download', 'xiaohongshu', 'debug', kw, 'diagnostics',
      `feed-unlike-${suffix}-${note}-${ts}.png`,
    );
    return captureScreenshotToFile({ profileId, filePath }).catch(() => null);
  };

  const preShot = await Promise.race([
    captureUnlikeSnapshot('pre'),
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const noteId = String(candidate?.noteId || '').trim();
  const likeActiveSelectors = noteId
    ? [
        `.note-item a.cover[href*="${noteId}"] ~ .footer .like-wrapper svg.reds-icon.like-icon use[*|href="#liked"]`,
      ]
    : [];

  if (likeActiveSelectors.length > 0) {
    const preCheck = await waitForAnchor(profileId, {
      selectors: likeActiveSelectors,
      timeoutMs: 1000,
      intervalMs: 100,
      description: 'feed_unlike_pre_check_liked',
    }).catch(() => null);
    if (preCheck?.ok !== true) {
      pushTrace({
        kind: 'skip',
        stage: 'feed_unlike',
        noteId: candidate.noteId,
        reason: 'NOT_LIKED',
        preShot,
      });
      return { ok: false, code: 'NOT_LIKED', noteId: candidate.noteId, preShot };
    }
  }

  try {
    await clickPoint(profileId, candidate.center, { clicks: 1 });
  } catch {
    pushTrace({
      kind: 'skip',
      stage: 'feed_unlike',
      noteId: candidate.noteId,
      reason: 'click_timeout_or_error',
      preShot,
    });
    return { ok: false, code: 'CLICK_FAILED', noteId: candidate.noteId, preShot };
  }

  const postSelector = await waitForAnchor(profileId, {
    selectors: [],
    timeoutMs: 5000,
    intervalMs: 200,
    description: 'feed_unlike_selector_turned_inactive',
    probe: async () => {
      const status = await readNoteLikeStatus(profileId, noteId).catch(() => null);
      return status?.ok === true && status?.liked === false;
    },
  }).catch(() => ({ ok: false, reason: 'anchor_timeout' }));

  const postStatus = { ok: postSelector?.ok === true, liked: postSelector?.ok !== true };

  const postShot = await Promise.race([
    captureUnlikeSnapshot('post'),
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const selectorChanged = postSelector?.ok === true && postStatus?.ok === true;

  pushTrace({
    kind: 'click',
    stage: 'feed_unlike',
    noteId: candidate.noteId,
    center: candidate.center,
    selectorChanged,
    preShot,
    postShot,
    postStatus,
  });

  return {
    ok: selectorChanged,
    code: selectorChanged ? 'UNLIKE_DONE' : 'UNLIKE_SELECTOR_NOT_CHANGED',
    noteId: candidate.noteId,
    preShot,
    postShot,
    selectorChanged,
  };
}

