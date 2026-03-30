const WEIBO_PROFILE_STATE = new Map();

export function defaultWeiboProfileState() {
  return {
    keyword: null,
    env: null,
    outputRoot: null,
    currentPostId: null,
    currentHref: null,
    visitedPostIds: [],
    metrics: {
      harvestCount: 0,
      failCount: 0,
      lastHarvestAt: null,
    },
  };
}

export function getWeiboProfileState(profileId) {
  const key = String(profileId || '').trim() || 'default';
  if (!WEIBO_PROFILE_STATE.has(key)) {
    WEIBO_PROFILE_STATE.set(key, defaultWeiboProfileState());
  }
  return WEIBO_PROFILE_STATE.get(key);
}

export function clearWeiboProfileState(profileId) {
  const key = String(profileId || '').trim() || 'default';
  WEIBO_PROFILE_STATE.delete(key);
}
