import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { applyStatePatch } from './state-patch.mts';
import { parseStdoutForEvents } from './stdout-parser.mts';
import { setupDom, type DomHarness } from '../../../test-dom.mts';

let dom: DomHarness;

function createRuntime() {
  const shardStats = new Map<string, any>();
  const runtime: any = {
    maxCommentsInput: Object.assign(dom.document.createElement('input'), { value: '88' }),
    liveStats: {
      linksCollected: 0,
      linksTarget: 0,
      postsProcessed: 0,
      currentCommentsCollected: 0,
      currentCommentsTarget: '不限',
      likesTotal: 0,
      likesSkippedTotal: 0,
      likeDedupSkipped: 0,
      likeAlreadySkipped: 0,
      likeGateBlocked: 0,
      repliesTotal: 0,
      eventsPath: '',
      noteId: '',
    },
    activeRunIds: new Set<string>(),
    runToShard: new Map<string, string>(),
    parentRunCurrentShard: new Map<string, string>(),
    shardStats,
    expectedShardProfiles: new Set<string>(),
    likedNotes: new Map<string, { count: number; path: string }>(),
    repliedNotes: new Map<string, { count: number; path: string }>(),
    activeRunId: '',
    hasStateFeed: false,
    renderCalls: 0,
    ensureShardStats(shardKey: string) {
      if (!shardKey) return null;
      if (!shardStats.has(shardKey)) {
        shardStats.set(shardKey, {
          linksCollected: 0,
          linksTarget: 0,
          postsProcessed: 0,
          commentsCollected: 0,
          likesTotal: 0,
          likesSkippedTotal: 0,
          likeDedupSkipped: 0,
          likeAlreadySkipped: 0,
          likeGateBlocked: 0,
          repliesTotal: 0,
          phase: '',
          action: '',
          status: 'idle',
          anomaly: '',
          updatedAt: 0,
        });
      }
      return shardStats.get(shardKey);
    },
    formatLineText(input: string, max = 120) {
      return String(input || '').trim().slice(0, max);
    },
    parentDir(inputPath: string) {
      const raw = String(inputPath || '');
      const idx = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
      return idx >= 0 ? raw.slice(0, idx) : raw;
    },
    renderLiveStats() {
      runtime.renderCalls += 1;
    },
  };
  return runtime;
}

beforeEach(() => {
  dom = setupDom();
});

afterEach(() => {
  dom.cleanup();
});

test('stdout parser updates shard progress, run mapping and like skip stats', () => {
  const runtime = createRuntime();

  parseStdoutForEvents(runtime, '[rid:parentA] [shard-hint] profiles=xhs-0');
  parseStdoutForEvents(runtime, '[Logger] runId=childA');
  parseStdoutForEvents(runtime, '[Phase2Collect] 3/50');
  parseStdoutForEvents(runtime, '[1/50] slot-1(tab-1) note=abc123');
  parseStdoutForEvents(runtime, '[Phase3Interact] round=1 ruleHits=1 gateBlocked=1 dedup=2 alreadyLiked=3 newLikes=4 likedTotal=5/20 end=max');
  parseStdoutForEvents(runtime, 'likeEvidenceDir=/tmp/xhs/note-1/evidence.png');

  assert.ok(runtime.expectedShardProfiles.has('xhs-0'));
  assert.equal(runtime.liveStats.linksTarget, 50);
  assert.equal(runtime.liveStats.postsProcessed, 1);
  assert.equal(runtime.liveStats.noteId, 'abc123');
  assert.equal(runtime.liveStats.currentCommentsTarget, '88');
  assert.equal(runtime.liveStats.likesTotal, 5);
  assert.equal(runtime.liveStats.likesSkippedTotal, 6);
  assert.equal(runtime.liveStats.likeDedupSkipped, 2);
  assert.equal(runtime.liveStats.likeAlreadySkipped, 3);
  assert.equal(runtime.liveStats.likeGateBlocked, 1);
  assert.ok(runtime.likedNotes.has('abc123'));
  assert.ok(runtime.renderCalls > 0);
});

test('stdout parser captures events path and phase2 fatal anomaly', () => {
  const runtime = createRuntime();
  runtime.runToShard.set('r-1', 'xhs-1');
  runtime.expectedShardProfiles.add('xhs-1');
  parseStdoutForEvents(runtime, '[rid:r-1] eventsPath="/tmp/kw/run-events.rotate.jsonl"');
  parseStdoutForEvents(runtime, '❌ Phase 2 失败: gate check timeout');

  assert.match(runtime.liveStats.eventsPath, /run-events\.rotate\.jsonl/);
  const shard = runtime.ensureShardStats('xhs-1');
  assert.equal(shard.status, 'error');
  assert.match(shard.anomaly, /gate check timeout/);
});

test('state patch merges progress/stats and marks state feed', () => {
  const runtime = createRuntime();
  runtime.expectedShardProfiles.add('xhs-2');
  runtime.runToShard.set('rid-2', 'xhs-2');

  applyStatePatch(runtime, {
    progress: { processed: 12, total: 60 },
    stats: {
      notesProcessed: 10,
      commentsCollected: 120,
      likesPerformed: 7,
      likesSkippedTotal: 4,
      likeDedupSkipped: 2,
      likeAlreadySkipped: 1,
      likeGateBlocked: 1,
      repliesGenerated: 3,
    },
    phase: 'Phase4',
    status: 'running',
    message: 'collecting',
  }, 'rid-2');

  assert.equal(runtime.liveStats.linksCollected, 12);
  assert.equal(runtime.liveStats.linksTarget, 60);
  assert.equal(runtime.liveStats.postsProcessed, 10);
  assert.equal(runtime.liveStats.currentCommentsCollected, 120);
  assert.equal(runtime.liveStats.likesTotal, 7);
  assert.equal(runtime.liveStats.likesSkippedTotal, 4);
  assert.equal(runtime.liveStats.repliesTotal, 3);
  assert.equal(runtime.hasStateFeed, true);

  const shard = runtime.ensureShardStats('xhs-2');
  assert.equal(shard.phase, 'Phase4');
  assert.equal(shard.status, 'running');

  applyStatePatch(runtime, { status: 'failed', error: 'boom' }, 'rid-2');
  assert.equal(shard.status, 'error');
  assert.match(shard.anomaly, /boom/);

  applyStatePatch(runtime, { status: 'completed' }, 'rid-2');
  assert.equal(shard.status, 'completed');
});

test('stdout parser handles phase2/phase3 diagnostics and summary counters', () => {
  const runtime = createRuntime();
  runtime.expectedShardProfiles.add('xhs-z');

  parseStdoutForEvents(runtime, '[stderr] [Phase2Collect] Rigid gate blocked click index=2: blocked_by_modal');
  parseStdoutForEvents(runtime, '[Phase2Collect] Post-click gate FAILED: explore=false xsec=false');
  parseStdoutForEvents(runtime, '[Phase2Collect] Click decision: strategy=container mode=strict focus=true active=note_card');
  parseStdoutForEvents(runtime, '[Phase2Collect] Focus ensure: strategy=container ok=true beforeFocus=false beforeActive=page afterFocus=true afterActive=modal');
  parseStdoutForEvents(runtime, '[Phase2Collect] Click strategy failed: strategy=container reason=dispatch_failed');
  parseStdoutForEvents(runtime, '[Phase2Collect] Click strategy no-open: strategy=container url=https://www.xiaohongshu.com waitedMs=999');
  parseStdoutForEvents(runtime, '[Phase2Search] protocol fill: selector=".search-input" success=false error=denied');
  parseStdoutForEvents(runtime, '[Phase2Search] protocol input: container_type success=true');
  parseStdoutForEvents(runtime, '[Phase3Interact] Like Gate: 1 / 10 ❌');
  parseStdoutForEvents(runtime, '[Links] 8/100');
  parseStdoutForEvents(runtime, '- 处理帖子: 9');
  parseStdoutForEvents(runtime, '- 评论总量: 77');
  parseStdoutForEvents(runtime, '- 点赞总量: 3');
  parseStdoutForEvents(runtime, '- 回复总量: 2');

  const shard = runtime.ensureShardStats('xhs-z');
  assert.equal(runtime.liveStats.linksCollected, 8);
  assert.equal(runtime.liveStats.linksTarget, 100);
  assert.equal(runtime.liveStats.postsProcessed, 9);
  assert.equal(runtime.liveStats.currentCommentsCollected, 77);
  assert.equal(runtime.liveStats.likesTotal, 3);
  assert.equal(runtime.liveStats.repliesTotal, 2);
  assert.equal(shard.phase.length > 0, true);
  assert.equal(runtime.renderCalls > 0, true);
});
