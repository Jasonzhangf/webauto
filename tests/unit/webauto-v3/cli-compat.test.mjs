import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { readPostWithComments } from '../../../apps/webauto/weibo-v3/api-reader.mjs';
import {
  applyVideoCopy,
  finalizeVideoRun,
  runWeiboCli,
} from '../../../apps/webauto/weibo-v3/cli.mjs';
import { WeiboBrowser } from '../../../apps/webauto/weibo-v3/browser.mjs';
import { createWeiboRuntime } from '../../../apps/webauto/weibo-v3/runtime.mjs';
import { collectProfile } from '../../../apps/webauto/weibo-v3/profile.mjs';
import { resolveVideo } from '../../../apps/webauto/weibo-v3/video.mjs';
import { runConsumer } from '../../../apps/webauto/weibo-v3/workflows.mjs';
import {
  inspectSpecialFollow,
  startSpecialFollowMonitor,
  writeSpecialFollowUsers,
} from '../../../apps/webauto/weibo-v3/special-follow.mjs';

test('all active weibo entries forward to the v3 CLI', () => {
  const entries = [
    'apps/webauto/entry/weibo-collect.mjs',
    'apps/webauto/entry/weibo-detail.mjs',
    'apps/webauto/entry/weibo-unified.mjs',
    'apps/webauto/entry/weibo-video.mjs',
    'apps/webauto/entry/weibo-producer-runner.mjs',
    'apps/webauto/entry/weibo-consumer-runner.mjs',
    'apps/webauto/entry/weibo-special-follow.mjs',
  ];
  for (const entry of entries) {
    const source = fs.readFileSync(entry, 'utf8');
    assert.equal(source.includes('weibo-v3/cli.mjs'), true, `${entry} must forward to v3`);
  }
});

test('bin dispatch maps the video subcommand explicitly', () => {
  const source = fs.readFileSync('bin/webauto.mjs', 'utf8');
  assert.equal(source.includes('video: "weibo-video.mjs"'), true);
  assert.equal(source.includes('scriptBySub[weiboSub]'), true);
});

test('weibo entrypoints map explicit failures to a non-zero exit code', () => {
  const entries = [
    'apps/webauto/entry/weibo-collect.mjs',
    'apps/webauto/entry/weibo-detail.mjs',
    'apps/webauto/entry/weibo-unified.mjs',
    'apps/webauto/entry/weibo-video.mjs',
    'apps/webauto/entry/weibo-producer-runner.mjs',
    'apps/webauto/entry/weibo-consumer-runner.mjs',
    'apps/webauto/entry/weibo-special-follow.mjs',
  ];
  for (const entry of entries) {
    const source = fs.readFileSync(entry, 'utf8');
    assert.match(source, /result\?\.ok === false \|\| result\?\.success === false/);
    assert.match(source, /process\.exitCode = 1/);
  }
});

test('direct weibo execution is rejected before browser startup unless admitted', () => {
  const entry = path.join(process.cwd(), 'apps/webauto/entry/weibo-unified.mjs');
  const env = { ...process.env, WEBAUTO_DAEMON_BYPASS: '1' };
  const denied = spawnSync(process.execPath, [entry, 'unified', '--task-type', 'timeline'], {
    cwd: process.cwd(),
    env: { ...env, WEBAUTO_DAEMON_BYPASS: '0' },
    encoding: 'utf8',
  });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /WEIBO_DAEMON_REQUIRED/);

  const help = spawnSync(process.execPath, [entry, '--help'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /webauto weibo v3/);
});

test('detail rejects a missing links file before browser startup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-detail-links-'));
  const previousRunDir = process.env.WEBAUTO_V3_RUN_DIR;
  process.env.WEBAUTO_V3_RUN_DIR = root;
  try {
    await assert.rejects(
      () => runWeiboCli('detail', {
        'links-file': path.join(root, 'missing-links.jsonl'),
      }),
      (error) => error?.code === 'WEIBO_DETAIL_EMPTY_LINKS',
    );
  } finally {
    if (previousRunDir === undefined) delete process.env.WEBAUTO_V3_RUN_DIR;
    else process.env.WEBAUTO_V3_RUN_DIR = previousRunDir;
  }
});

test('detail reply expansion honors expand-all-replies false', async () => {
  let replyCalls = 0;
  const browser = {
    async fetchJson() {
      return { data: { id: 'AbC123', text: 'body', user: { id: 1, screen_name: 'author' } } };
    },
    async evaluate() {
      return { ok: true, maxId: null, rows: [{ id: 'comment-1', text: 'comment' }] };
    },
  };
  const original = browser.evaluate;
  browser.evaluate = async (script) => {
    if (String(script).includes('hotFlowChild')) replyCalls++;
    return original(script);
  };
  const result = await readPostWithComments(browser, 'AbC123', {
    expandAllReplies: false,
  });
  assert.equal(result.comments.length, 1);
  assert.equal(replyCalls, 0);
});

test('reply API failures are not converted into successful partial details', async () => {
  const browser = {
    async fetchJson() {
      return { data: { id: 'AbC123', text: 'body', user: { id: 1, screen_name: 'author' } } };
    },
    async evaluate(script) {
      if (String(script).includes('hotFlowChild')) {
        throw new Error('reply transport failed');
      }
      return { ok: true, maxId: null, rows: [{ id: 'comment-1', text: 'comment', total_number: 1 }] };
    },
  };
  await assert.rejects(
    () => readPostWithComments(browser, 'AbC123'),
    /reply transport failed/,
  );
});

test('video resolution rejects unsupported landing platforms', async () => {
  const adapter = {
    async start() {},
    async evaluate() {
      return {
        videoUrls: ['https://cdn.example/video.mp4'],
        pageUrl: 'https://example.com/video/1',
      };
    },
  };
  await assert.rejects(
    () => resolveVideo({ adapter, profileId: 'weibo', url: 'https://example.com/video/1' }),
    (error) => error.code === 'UNSUPPORTED_PLATFORM',
  );
});

test('video --copy keeps the legacy clipboard side effect', () => {
  const written = [];
  const writer = (value) => {
    written.push(value);
    return true;
  };
  const result = { videoUrl: 'https://video.example/real.mp4' };

  assert.equal(applyVideoCopy({ argv: {}, result, writeClipboardFn: writer }), false);
  assert.equal(applyVideoCopy({ argv: { copy: true }, result, writeClipboardFn: writer }), true);
  assert.equal(applyVideoCopy({ argv: { c: true }, result, writeClipboardFn: writer }), true);
  assert.equal(written.length, 2);
  assert.deepEqual(written, [result.videoUrl, result.videoUrl]);

  // A failed clipboard write must not be reported as a completed copy.
  assert.equal(
    applyVideoCopy({ argv: { copy: true }, result, writeClipboardFn: () => false }),
    false,
  );
  // Nothing to copy is not a copy.
  assert.equal(
    applyVideoCopy({ argv: { copy: true }, result: {}, writeClipboardFn: writer }),
    false,
  );
});

test('the video command wires the copy side effect into its result', () => {
  const source = fs.readFileSync('apps/webauto/weibo-v3/cli.mjs', 'utf8');
  const command = source.slice(source.indexOf('async function videoCommand'));
  assert.equal(command.length > 0, true);
  assert.match(command, /finalizeVideoRun\(\{ runtime, url, result \}\)/);
  assert.match(command, /const copied = applyVideoCopy\(\{ argv, result \}\)/);
  assert.match(command, /return \{ \.\.\.result, copied, runId: runtime\.runId/);
});

test('a video run never reports success when its artifact validation fails', () => {
  const makeRuntime = () => {
    const events = [];
    return {
      events,
      recordArtifact({ artifactType, artifactId, payload }) {
        return { artifact_id: artifactId, artifact_type: artifactType, artifact_generation: 1, content_digest: 'd', payload };
      },
      validateArtifact({ result }) {
        events.push({ type: 'ArtifactValidated', result });
        return { result };
      },
      finish(status, payload) {
        events.push({ type: status === 'succeeded' ? 'RunCompleted' : 'RunFailed', payload });
      },
    };
  };

  const okRuntime = makeRuntime();
  const ok = finalizeVideoRun({
    runtime: okRuntime,
    url: 'https://weibo.com/tv/show/1',
    result: { videoUrl: 'https://cdn.example/v.mp4' },
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(okRuntime.events.map((e) => e.type), ['ArtifactValidated', 'RunCompleted']);
  assert.equal(okRuntime.events[0].result, 'pass');

  const badRuntime = makeRuntime();
  const bad = finalizeVideoRun({
    runtime: badRuntime,
    url: 'https://weibo.com/tv/show/1',
    result: {},
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'video_validation_failed');
  assert.deepEqual(badRuntime.events.map((e) => e.type), ['ArtifactValidated', 'RunFailed']);
  assert.equal(badRuntime.events[0].result, 'fail');
});

test('special-follow keeps the historical xhs-qa-1 default profile', async () => {
  const requested = [];
  const originalEnsure = WeiboBrowser.prototype.ensureStarted;
  const previousRunDir = process.env.WEBAUTO_V3_RUN_DIR;
  const previousHome = process.env.HOME;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-special-follow-'));
  process.env.WEBAUTO_V3_RUN_DIR = sandbox;
  process.env.HOME = sandbox;
  WeiboBrowser.prototype.ensureStarted = async function patched() {
    requested.push(this.profileId);
  };
  try {
    const result = await runWeiboCli('special-follow', {
      subcommand: 'inspect',
      env: 'prod',
    });
    assert.equal(requested.length, 1);
    assert.equal(requested[0], 'xhs-qa-1');
    assert.equal(result.runId.length > 0, true);
  } finally {
    WeiboBrowser.prototype.ensureStarted = originalEnsure;
    if (previousRunDir === undefined) delete process.env.WEBAUTO_V3_RUN_DIR;
    else process.env.WEBAUTO_V3_RUN_DIR = previousRunDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test('special-follow still honors an explicit --profile override', async () => {
  const requested = [];
  const originalEnsure = WeiboBrowser.prototype.ensureStarted;
  const previousRunDir = process.env.WEBAUTO_V3_RUN_DIR;
  const previousHome = process.env.HOME;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-special-follow-override-'));
  process.env.WEBAUTO_V3_RUN_DIR = sandbox;
  process.env.HOME = sandbox;
  WeiboBrowser.prototype.ensureStarted = async function patched() {
    requested.push(this.profileId);
  };
  try {
    await runWeiboCli('special-follow', {
      subcommand: 'inspect',
      profile: 'weibo-6',
      env: 'prod',
    });
    assert.deepEqual(requested, ['weibo-6']);
  } finally {
    WeiboBrowser.prototype.ensureStarted = originalEnsure;
    if (previousRunDir === undefined) delete process.env.WEBAUTO_V3_RUN_DIR;
    else process.env.WEBAUTO_V3_RUN_DIR = previousRunDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test('special-follow paces between users but never waits after the last one', async () => {
  const previousHome = process.env.HOME;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-special-follow-pacing-'));
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-special-follow-pacing-events-'));
  process.env.HOME = sandbox;
  try {
    await writeSpecialFollowUsers(
      [{ uid: '1', name: 'a' }, { uid: '2', name: 'b' }, { uid: '3', name: 'c' }],
      { env: 'prod' },
    );
    const runtime = createWeiboRuntime({ runId: `special_follow_${Date.now()}`, eventDir });
    const visited = [];
    const browser = {
      async goto(url) {
        visited.push(url);
      },
      async pageInfo() {
        return {
          url: visited[visited.length - 1] || 'about:blank',
          title: 'profile',
          viewport: { width: 390, height: 844 },
          scroll: { x: 0, y: 0 },
          textDigest: 'body',
        };
      },
      async observeAnchors() {
        return {};
      },
      async evaluate() {
        return { href: null, text: '' };
      },
    };
    const started = Date.now();
    const result = await inspectSpecialFollow({
      runtime,
      browser,
      env: 'prod',
      delayMs: 250,
    });
    const elapsed = Date.now() - started;
    assert.equal(visited.length, 3);
    assert.equal(result.success, true);
    // Two gaps of 250ms, and crucially no third one after the final user.
    assert.equal(elapsed >= 500, true, `expected >=500ms of pacing, got ${elapsed}ms`);
    assert.equal(elapsed < 720, true, `expected no trailing wait, got ${elapsed}ms`);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test('special-follow monitor reports an unsuccessful round as a failure', async () => {
  const previousHome = process.env.HOME;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-monitor-failure-'));
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-monitor-failure-events-'));
  process.env.HOME = sandbox;
  try {
    await writeSpecialFollowUsers([{ uid: '1', name: 'a' }, { uid: '2', name: 'b' }], { env: 'prod' });
    const runtime = createWeiboRuntime({ runId: `monitor_failure_${Date.now()}`, eventDir });
    // The second user read fails; the monitor must surface that round as a
    // failure instead of reporting a clean sweep.
    let reads = 0;
    const browser = {
      async goto() {},
      async pageInfo() {
        return {
          url: 'https://m.weibo.cn/u/1',
          title: 'profile',
          viewport: { width: 390, height: 844 },
          scroll: { x: 0, y: 0 },
          textDigest: 'body',
        };
      },
      async observeAnchors() {
        return {};
      },
      async evaluate() {
        reads++;
        if (reads === 2) throw new Error('transport failed');
        return { href: 'https://m.weibo.cn/detail/1', text: '' };
      },
    };
    await assert.rejects(
      () => startSpecialFollowMonitor({
        runtime,
        browser,
        env: 'prod',
        maxRounds: 1,
        delayMs: 0,
      }),
      /page DAG failed: node_exception/,
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test('special-follow monitor keeps a clean sweep successful', async () => {
  const previousHome = process.env.HOME;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-monitor-ok-'));
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-monitor-ok-events-'));
  process.env.HOME = sandbox;
  try {
    await writeSpecialFollowUsers([{ uid: '1', name: 'a' }], { env: 'prod' });
    const runtime = createWeiboRuntime({ runId: `monitor_ok_${Date.now()}`, eventDir });
    const browser = {
      async goto() {},
      async pageInfo() {
        return {
          url: 'https://m.weibo.cn/u/1',
          title: 'profile',
          viewport: { width: 390, height: 844 },
          scroll: { x: 0, y: 0 },
          textDigest: 'body',
        };
      },
      async observeAnchors() {
        return {};
      },
      async evaluate() {
        return { href: 'https://m.weibo.cn/detail/1', text: '' };
      },
    };
    const result = await startSpecialFollowMonitor({
      runtime,
      browser,
      env: 'prod',
      maxRounds: 1,
      delayMs: 0,
    });
    assert.equal(result.success, true);
    assert.equal(result.rounds, 1);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test('consumer treats omitted max-posts as unlimited and stops on idle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-consumer-'));
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-consumer-events-'));
  const runtime = createWeiboRuntime({ runId: `consumer_${Date.now()}`, eventDir });
  const browser = {};
  const result = await runConsumer({
    runtime,
    browser,
    taskType: 'timeline',
    outputRoot: root,
    stopWhenIdle: true,
    maxPosts: 0,
    idleIntervalMs: 1000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.processed, 0);
  assert.equal(result.reason, 'idle');
});

test('profile collection waits for anchor content revision after scroll', async () => {
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-profile-events-'));
  const runtime = createWeiboRuntime({ runId: `profile_${Date.now()}`, eventDir });
  let scrolls = 0;
  let reads = 0;
  const browser = {
    async setViewport() {},
    async goto() {},
    async pageInfo() {
      return {
        url: 'https://m.weibo.cn/u/123',
        title: 'profile',
        viewport: { width: 390, height: 844 },
        scroll: { x: 0, y: scrolls * 800 },
        textDigest: `read-${reads}`,
      };
    },
    async observeAnchors() {
      return { 'profile.root': { selector: '.card9', count: 1, visible: true } };
    },
    async evaluate() {
      reads++;
      return reads < 2
        ? { posts: [{ mid: 'one', url: 'https://m.weibo.cn/detail/one' }] }
        : {
            posts: [
              { mid: 'one', url: 'https://m.weibo.cn/detail/one' },
              { mid: 'two', url: 'https://m.weibo.cn/detail/two' },
            ],
          };
    },
    async scroll() {
      scrolls++;
    },
  };
  const result = await collectProfile({
    runtime,
    browser,
    userId: '123',
    target: 2,
    scrollWaitMs: 1000,
    maxEmptyScrolls: 1,
  });
  assert.equal(result.posts.length, 2);
  assert.equal(scrolls, 1);
});

test('profile collection does not treat an invisible anchor as ready', async () => {
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-profile-hidden-events-'));
  const runtime = createWeiboRuntime({ runId: `profile_hidden_${Date.now()}`, eventDir });
  let reads = 0;
  const browser = {
    async setViewport() {},
    async goto() {},
    async pageInfo() {
      return {
        url: 'https://m.weibo.cn/u/123',
        title: 'profile',
        viewport: { width: 390, height: 844 },
        scroll: { x: 0, y: 0 },
        textDigest: 'hidden',
      };
    },
    async observeAnchors() {
      return { 'profile.root': { selector: '.card9', count: 1, visible: false } };
    },
    async evaluate() {
      reads++;
      return { posts: [{ mid: 'hidden', url: 'https://m.weibo.cn/detail/hidden' }] };
    },
    async scroll() {},
  };
  await assert.rejects(
    () => collectProfile({
      runtime,
      browser,
      userId: '123',
      target: 1,
      scrollWaitMs: 1,
      maxEmptyScrolls: 1,
    }),
    /anchor_not_visible/,
  );
  assert.equal(reads, 0);
});
