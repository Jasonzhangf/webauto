import { pressKey, sleepRandom } from './dom-ops.mjs';
import { emitOperationProgress } from './trace.mjs';
import { readFeedWindowSignature, waitForFeedWindowChange } from './feed-like-shared.mjs';

export async function handleNoFeedTargetsLike({
  profileId,
  context,
  stage,
  currentTabIndex,
  tabData,
  scrollDirection,
  noCandidateDown,
  noCandidateUp,
  scrollCount,
  noCandidateLimit,
  scrollIntervalMinMs,
  scrollIntervalMaxMs,
  kind,
  desc,
  tag,
}) {
  const beforeWindow = await readFeedWindowSignature(profileId).catch(() => null);
  const beforeSignature = String(beforeWindow?.signature || '').trim();
  if (beforeSignature) tabData.seenWindowSignatures.add(beforeSignature);

  try {
    await pressKey(profileId, scrollDirection === 'up' ? 'PageUp' : 'PageDown');
  } catch {
    emitOperationProgress(context, { kind: kind('feed_like_scroll_key_error'), stage });
    tabData.exhausted = true;
    return { action: 'exhausted', scrollDirection, noCandidateDown, noCandidateUp, scrollCount };
  }

  let changed = false;
  try {
    const changedResult = await waitForFeedWindowChange(profileId, beforeSignature);
    changed = changedResult?.ok === true;
  } catch {}

  const afterWindow = await readFeedWindowSignature(profileId).catch(() => null);
  const afterSignature = String(afterWindow?.signature || '').trim();
  if (afterSignature) tabData.seenWindowSignatures.add(afterSignature);

  const progressed = changed || (beforeSignature && afterSignature && beforeSignature !== afterSignature);
  if (scrollDirection === 'up') {
    noCandidateUp += 1;
  } else {
    noCandidateDown += 1;
  }
  tabData.noCandidateDown = noCandidateDown;
  tabData.noCandidateUp = noCandidateUp;

  scrollCount += 1;
  tabData.scrollCount = scrollCount;
  emitOperationProgress(context, {
    kind: kind('feed_like_scroll_probe'),
    stage,
    tabIndex: currentTabIndex,
    scrollCount,
    scrollDirection,
    noCandidateDown,
    noCandidateUp,
    progressed,
    beforeSignature: beforeSignature ? beforeSignature.slice(0, 120) : null,
    afterSignature: afterSignature ? afterSignature.slice(0, 120) : null,
  });

  await sleepRandom(scrollIntervalMinMs, scrollIntervalMaxMs, null, tag('feed_like_scroll_interval'));

  const directionLimitReached = scrollDirection === 'up'
    ? noCandidateUp >= noCandidateLimit
    : noCandidateDown >= noCandidateLimit;
  const shouldSwitchDirection = !progressed || directionLimitReached;
  const nextDirection = shouldSwitchDirection ? (scrollDirection === 'up' ? 'down' : 'up') : scrollDirection;
  tabData.scrollDirection = nextDirection;

  if (noCandidateDown >= noCandidateLimit && noCandidateUp >= noCandidateLimit) {
    emitOperationProgress(context, {
      kind: kind('feed_like_scroll_exhausted'),
      stage,
      scrollCount,
      noCandidateDown,
      noCandidateUp,
    });
    tabData.exhausted = true;
    return { action: 'exhausted', scrollDirection: nextDirection, noCandidateDown, noCandidateUp, scrollCount };
  }

  return { action: 'continue', scrollDirection: nextDirection, noCandidateDown, noCandidateUp, scrollCount };
}

export async function handleNoFeedTargetsUnlike({
  profileId,
  context,
  stage,
  currentTabIndex,
  tabData,
  scrollDirection,
  noUnlikeScrolls,
  noUnlikeCycles,
  scrollCount,
  noCandidateLimit,
  scrollIntervalMinMs,
  scrollIntervalMaxMs,
  kind,
  desc,
  tag,
}) {
  const beforeWindow = await readFeedWindowSignature(profileId).catch(() => null);
  const beforeSignature = String(beforeWindow?.signature || '').trim();
  if (beforeSignature) tabData.seenWindowSignatures.add(beforeSignature);

  try {
    await pressKey(profileId, scrollDirection === 'up' ? 'PageUp' : 'PageDown');
  } catch {
    emitOperationProgress(context, { kind: kind('feed_like_scroll_key_error'), stage });
    tabData.exhausted = true;
    return { action: 'exhausted', scrollDirection, noUnlikeScrolls, noUnlikeCycles, scrollCount };
  }

  let changed = false;
  try {
    const changedResult = await waitForFeedWindowChange(profileId, beforeSignature);
    changed = changedResult?.ok === true;
  } catch {}

  const afterWindow = await readFeedWindowSignature(profileId).catch(() => null);
  const afterSignature = String(afterWindow?.signature || '').trim();
  if (afterSignature) tabData.seenWindowSignatures.add(afterSignature);
  const progressed = changed || (beforeSignature && afterSignature && beforeSignature !== afterSignature);

  noUnlikeScrolls += 1;
  tabData.noUnlikeScrolls = noUnlikeScrolls;
  scrollCount += 1;
  tabData.scrollCount = scrollCount;

  emitOperationProgress(context, {
    kind: kind('feed_like_scroll_probe'),
    stage,
    tabIndex: currentTabIndex,
    scrollCount,
    scrollDirection,
    noUnlikeScrolls,
    noUnlikeCycles,
    progressed,
    beforeSignature: beforeSignature ? beforeSignature.slice(0, 120) : null,
    afterSignature: afterSignature ? afterSignature.slice(0, 120) : null,
  });

  await sleepRandom(scrollIntervalMinMs, scrollIntervalMaxMs, null, tag('feed_like_scroll_interval'));

  if (noUnlikeScrolls >= noCandidateLimit) {
    noUnlikeScrolls = 0;
    noUnlikeCycles += 1;
    tabData.noUnlikeScrolls = 0;
    tabData.noUnlikeCycles = noUnlikeCycles;
    emitOperationProgress(context, {
      kind: kind('feed_like_no_candidate_round_done'),
      stage,
      tabIndex: currentTabIndex,
      noUnlikeCycles,
      scrollCount,
    });
    if (noUnlikeCycles >= 3) {
      emitOperationProgress(context, {
        kind: kind('feed_like_scroll_exhausted'),
        stage,
        scrollCount,
        noUnlikeCycles,
      });
      tabData.exhausted = true;
      return { action: 'exhausted', scrollDirection, noUnlikeScrolls, noUnlikeCycles, scrollCount };
    }
    return { action: 'break', scrollDirection, noUnlikeScrolls, noUnlikeCycles, scrollCount };
  }

  return { action: 'continue', scrollDirection, noUnlikeScrolls, noUnlikeCycles, scrollCount };
}
