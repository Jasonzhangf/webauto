import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = new URL('.', import.meta.url).pathname;
const tabPath = path.join(__dirname, 'xiaohongshu.mts');

async function getSrc() {
  return readFile(tabPath, 'utf8');
}

test('xiaohongshu tab integrates orchestrate modes including unified-only', async () => {
  const src = await getSrc();
  assert.match(src, /phase1-phase2-unified/);
  assert.match(src, /phase1-phase2/);
  assert.match(src, /phase1-only/);
  assert.match(src, /unified-only/);
  assert.match(src, /phase-orchestrate\.mjs/);
});

test('xiaohongshu tab supports shard profiles and mode-specific args', async () => {
  const src = await getSrc();
  assert.match(src, /const shardProfilesInput = makeTextInput\('', '分片 profiles/);
  assert.match(src, /profileArgs\.push\('--profiles', shardProfiles\.join\(','\)\)/);
  assert.match(src, /if \(mode !== 'phase1-only'\) \{\s*args\.push\('--target'/s);
  assert.match(src, /if \(unifiedEnabled\) \{\s*args\.push\(/s);
});

test('xiaohongshu tab hides unchecked bodies and blocks reply without gate', async () => {
  const src = await getSrc();
  assert.match(src, /body\.style\.display = toggle\.checked \? '' : 'none';/);
  assert.match(src, /开启“自动回复”时，请同时开启“评论命中规则”。/);
  assert.match(src, /homeSection\.style\.display = featureDisplay/);
  assert.match(src, /opOrderRow\.style\.display = featureDisplay/);
});


test('xiaohongshu tab input history supports autocomplete and hotkey delete', async () => {
  const src = await getSrc();
  assert.match(src, /bindInputHistory\(input: HTMLInputElement, key: string/);
  assert.match(src, /input\.setAttribute\('list', safeId\)/);
  assert.match(src, /Ctrl\+Shift\+Backspace/);
  assert.match(src, /persistHistoryFns\.forEach\(\(persist\) => persist\(\)\)/);
});


test('xiaohongshu tab supports clear account mode and live stats panel', async () => {
  const src = await getSrc();
  assert.match(src, /单账号（一个 profile）/);
  assert.match(src, /分片并发（多个 profiles）/);
  assert.match(src, /实时统计/);
  assert.match(src, /链接采集：\$\{liveStats\.linksCollected\}/);
  assert.match(src, /已点赞帖子/);
  assert.match(src, /已回复帖子/);
});
