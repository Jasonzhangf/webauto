// Special-follow user discovery and new-post inspection.
// Navigation remains manual/anchor-driven; no selector probing is invented.

import fs from 'node:fs/promises';
import path from 'node:path';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function monitorDir(env = 'prod') {
  return path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), '.webauto', 'weibo-special-follow', env);
}

export function userListPath(env = 'prod') {
  return path.join(monitorDir(env), 'users.json');
}

export function postStatePath(env = 'prod') {
  return path.join(monitorDir(env), 'post-state.json');
}

export function newPostsPath(env = 'prod') {
  return path.join(monitorDir(env), 'new-posts.jsonl');
}

const USER_LIST_SCRIPT = `(() => {
  const users = [];
  const seen = new Set();
  for (const link of document.querySelectorAll("a[href*='/u/']")) {
    const match = (link.getAttribute('href') || '').match(/\\/u\\/(\\d+)/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    users.push({ uid: match[1], name: (link.textContent || '').trim().split('\\n')[0].slice(0, 50) });
  }
  return { url: location.href, users };
})()`;

function recordPassedArtifact({
  runtime,
  artifactType,
  artifactId,
  payload,
  path = null,
  validationSpecId,
  observedCount = null,
}) {
  const artifact = runtime.recordArtifact({
    artifactType,
    artifactId,
    payload,
    path,
  });
  runtime.validateArtifact({
    artifact,
    validationSpecId,
    result: 'pass',
    observedCount,
    expectedCount: null,
  });
  return artifact;
}

async function runReadPage({
  runtime,
  browser,
  pageDagId,
  bindingId,
  itemKey,
  url = null,
  read,
}) {
  if (!runtime) throw new Error(`${bindingId} requires the v3 runtime`);
  const nodes = [];
  if (url) {
    nodes.push({
      node_id: 'open',
      kind: 'Act',
      operation_kind: 'goto',
      operation_args: { url },
    });
  }
  nodes.push({ node_id: 'read', kind: 'Extract' });
  const pageResult = await runtime.runPage({
    pageDagId,
    browser,
    selectors: {},
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: bindingId,
      binding_id: bindingId,
      item_key: itemKey,
    },
    nodes,
    executor: url
      ? async (node) => {
          if (node.node_id === 'open') await browser.goto(url);
          return { ok: true, outputs: {} };
        }
      : null,
    extractors: {
      read: async () => read(),
    },
  });
  if (pageResult.status !== 'succeeded') {
    throw new Error(`${bindingId} page DAG failed: ${pageResult.reason_code || pageResult.verdict || pageResult.status}`);
  }
  return pageResult.outputs.read;
}

export async function readSpecialFollowUsers({ browser, runtime } = {}) {
  const users = await runReadPage({
    runtime,
    browser,
    pageDagId: 'weibo.special-follow.users',
    bindingId: 'weibo.special-follow.users',
    itemKey: 'users',
    read: async () => {
      const result = await browser.evaluate(USER_LIST_SCRIPT);
      return Array.isArray(result?.users) ? result.users : [];
    },
  });
  if (users.length === 0) {
    throw new Error('no special-follow users found on the current page');
  }
  return users;
}

export async function writeSpecialFollowUsers(users, { env = 'prod' } = {}) {
  const dir = monitorDir(env);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(userListPath(env), `${JSON.stringify({
    users,
    updatedAt: new Date().toISOString(),
    total: users.length,
  }, null, 2)}\n`, 'utf8');
}

export async function readStoredSpecialFollowUsers(env = 'prod') {
  try {
    const payload = JSON.parse(await fs.readFile(userListPath(env), 'utf8'));
    return Array.isArray(payload?.users) ? payload.users : [];
  } catch {
    return [];
  }
}

export async function readSpecialFollowState(env = 'prod') {
  try {
    return JSON.parse(await fs.readFile(postStatePath(env), 'utf8'));
  } catch {
    return { states: {}, updatedAt: null };
  }
}

function preserveExistingState(users, existingUsers) {
  const previous = new Map(
    existingUsers
      .filter((user) => user?.uid)
      .map((user) => [String(user.uid), user]),
  );
  return users.map((user) => ({
    ...user,
    lastWeiboId: previous.get(String(user.uid))?.lastWeiboId || null,
  }));
}

export async function updateSpecialFollowUsers({
  runtime,
  browser,
  env = 'prod',
  force = false,
} = {}) {
  const existing = await readStoredSpecialFollowUsers(env);
  if (!force && existing.length > 0) {
    return {
      success: true,
      users: existing,
      total: existing.length,
      message: 'using_existing_user_list',
    };
  }
  const users = preserveExistingState(await readSpecialFollowUsers({ browser, runtime }), existing);
  await writeSpecialFollowUsers(users, { env });
  recordPassedArtifact({
    runtime,
    artifactType: 'weibo-special-follow-users',
    artifactId: `special-follow:${env}:users`,
    payload: { users, total: users.length },
    path: userListPath(env),
    validationSpecId: 'weibo.special-follow.users.v1',
    observedCount: users.length,
  });
  return {
    success: true,
    users,
    total: users.length,
    message: 'user_list_updated',
  };
}

export async function autoSyncSpecialFollowUsers({ runtime, browser, env = 'prod' } = {}) {
  const existing = await readStoredSpecialFollowUsers(env);
  const current = await readSpecialFollowUsers({ browser, runtime });
  const existingByUid = new Map(existing.map((user) => [String(user.uid), user]));
  const currentUids = new Set(current.map((user) => String(user.uid)));
  const addedUsers = current.filter((user) => !existingByUid.has(String(user.uid)));
  const removedUsers = existing.filter((user) => !currentUids.has(String(user.uid)));
  const users = preserveExistingState(current, existing);
  await writeSpecialFollowUsers(users, { env });
  recordPassedArtifact({
    runtime,
    artifactType: 'weibo-special-follow-users',
    artifactId: `special-follow:${env}:users`,
    payload: { users, total: users.length },
    path: userListPath(env),
    validationSpecId: 'weibo.special-follow.users.v1',
    observedCount: users.length,
  });
  return {
    success: true,
    users,
    added: addedUsers.length,
    removed: removedUsers.length,
    total: users.length,
    addedUsers,
    removedUsers,
    message: addedUsers.length || removedUsers.length ? 'user_list_synced' : 'user_list_unchanged',
  };
}

export async function inspectSpecialFollow({
  runtime,
  browser,
  env = 'prod',
  delayMs = 5000,
  users: providedUsers = null,
} = {}) {
  const users = providedUsers || await readStoredSpecialFollowUsers(env);
  if (users.length === 0) {
    return {
      success: false,
      error: 'no_users',
      message: 'user list is empty; run update-user-list first',
      newCount: 0,
      newPosts: [],
      total: 0,
    };
  }
  const state = await readSpecialFollowState(env);
  const latest = { ...(state.states || {}) };
  const discovered = [];
  for (const [index, user] of users.entries()) {
    const page = await runReadPage({
      runtime,
      browser,
      pageDagId: 'weibo.special-follow.user',
      bindingId: 'weibo.special-follow.user',
      itemKey: user.uid,
      url: `https://m.weibo.cn/u/${user.uid}`,
      read: async () => browser.evaluate(`(() => {
        const link = document.querySelector("a[href*='/detail/']");
        return {
          href: link ? link.href.split('?')[0] : null,
          text: document.body?.innerText?.slice(0, 500) || '',
        };
      })()`),
    });
    const mid = page?.href?.split('/').pop() || null;
    if (mid && latest[user.uid] && latest[user.uid] !== mid) {
      discovered.push({ uid: user.uid, userName: user.name, postHref: page.href, timeISO: new Date().toISOString() });
    }
    if (mid) latest[user.uid] = mid;
    // Inter-user pacing to stay under Weibo rate limits. This is a pacing
    // policy, not a page-readiness wait: page readiness is anchored inside
    // runReadPage. Skipped after the final user so a sweep never ends with a
    // dead wait.
    if (delayMs > 0 && index < users.length - 1) {
      await sleep(delayMs);
    }
  }
  const dir = monitorDir(env);
  await fs.mkdir(dir, { recursive: true });
  const statePayload = {
    states: latest,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(postStatePath(env), `${JSON.stringify(statePayload, null, 2)}\n`, 'utf8');
  recordPassedArtifact({
    runtime,
    artifactType: 'weibo-special-follow-state',
    artifactId: `special-follow:${env}:state`,
    payload: statePayload,
    path: postStatePath(env),
    validationSpecId: 'weibo.special-follow.state.v1',
    observedCount: Object.keys(latest).length,
  });
  if (discovered.length > 0) {
    await fs.appendFile(
      newPostsPath(env),
      `${discovered.map((post) => JSON.stringify({ ...post, discoveredAt: new Date().toISOString() })).join('\n')}\n`,
      'utf8',
    );
    recordPassedArtifact({
      runtime,
      artifactType: 'weibo-special-follow-new-posts',
      artifactId: `special-follow:${env}:new-posts`,
      payload: discovered,
      path: newPostsPath(env),
      validationSpecId: 'weibo.special-follow.new-posts.v1',
      observedCount: discovered.length,
    });
  }
  return {
    success: true,
    total: users.length,
    newCount: discovered.length,
    newPosts: discovered,
    timestamp: new Date().toISOString(),
  };
}

export async function startSpecialFollowMonitor({
  runtime,
  browser,
  env = 'prod',
  intervalMs = 600_000,
  maxRounds = 100,
  delayMs = 5000,
  onRound = null,
} = {}) {
  const users = await readStoredSpecialFollowUsers(env);
  if (users.length === 0) {
    return {
      success: false,
      error: 'no_users',
      message: 'user list is empty; run update-user-list first',
      rounds: 0,
      totalNew: 0,
    };
  }
  const boundedRounds = Math.max(1, Number(maxRounds) || 100);
  const waitMs = Math.max(1000, Number(intervalMs) || 600_000);
  let rounds = 0;
  let totalNew = 0;
  let lastResult = null;
  let failedRound = null;
  for (let round = 1; round <= boundedRounds; round++) {
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') break;
    const result = await inspectSpecialFollow({ runtime, browser, env, delayMs, users });
    lastResult = result;
    rounds++;
    if (!result.success) {
      failedRound = { round, error: result.error || 'inspect_failed', message: result.message || null };
      break;
    }
    totalNew += result.newCount;
    if (onRound) await onRound({ round, result, totalNew });
    if (round < boundedRounds) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  if (failedRound) {
    // A failed round must reach the scheduler as a failure, with the round
    // evidence preserved.
    return {
      success: false,
      rounds,
      totalNew,
      lastResult,
      error: failedRound.error,
      message: failedRound.message,
      reason: 'inspect_failed',
    };
  }
  return {
    success: true,
    rounds,
    totalNew,
    lastResult,
    reason: process.env.WEBAUTO_JOB_STOPPING === 'true' ? 'stop_signal' : 'max_rounds_reached',
  };
}

export async function specialFollowStatus(env = 'prod') {
  const users = await readStoredSpecialFollowUsers(env);
  const state = await readSpecialFollowState(env);
  return {
    success: true,
    status: 'ready',
    users: { total: users.length, list: users.slice(0, 10) },
    postStates: {
      total: Object.keys(state.states || {}).length,
      latest: Object.entries(state.states || {}).slice(0, 5),
    },
    monitorDir: monitorDir(env),
  };
}
