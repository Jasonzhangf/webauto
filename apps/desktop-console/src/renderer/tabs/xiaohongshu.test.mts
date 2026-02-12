import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

test('xiaohongshu tab uses preferred+available profile selectors (no manual profile typing)', async () => {
  const src = await getSrc();
  assert.match(src, /const profilePickSel = createEl\('select'/);
  assert.match(src, /const shardProfilesBox = createEl\('div'/);
  assert.match(src, /const getSelectedShardProfiles = \(\) =>/);
  assert.match(src, /void refreshProfileChoices\(\);/);
  assert.match(src, /profileArgs\.push\('--profiles', shardProfiles\.join\(','\)\)/);
  assert.match(src, /profileArgs\.push\('--profile', singleProfile\)/);
  assert.doesNotMatch(src, /分片 profiles（逗号分隔）/);
  assert.doesNotMatch(src, /主 profile（单账号）/);
  assert.match(src, /if \(mode !== 'phase1-only'\) \{\s*args\.push\('--target'/s);
  assert.match(src, /if \(unifiedEnabled\) \{[\s\S]*args\.push\(/s);
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
  assert.match(src, /INPUT_HISTORY_MAX = 10/);
  assert.match(src, /bindInputHistory\(input: HTMLInputElement, key: string/);
  assert.match(src, /input\.setAttribute\('list', safeId\)/);
  assert.match(src, /Ctrl\+Shift\+Backspace/);
  assert.match(src, /persistHistoryFns\.forEach\(\(persist\) => persist\(\)\)/);
});


test('xiaohongshu tab clarifies active profile and account-mode visibility', async () => {
  const src = await getSrc();
  assert.match(src, /单账号（一个 profile）/);
  assert.match(src, /首次引导：先配置账号/);
  assert.match(src, /分片并发（多个 profiles）/);
  assert.match(src, /请选择账号：alias \/ profile/);
  assert.match(src, /单账号（账号名 \/ profile）/);
  assert.match(src, /当前实际使用：\(未选择账号\)/);
  assert.match(src, /singleProfileRow\.style\.display = isSingleMode \? '' : 'none';/);
  assert.match(src, /shardProfilesSection\.style\.display = isSingleMode \? 'none' : '';/);
  assert.match(src, /if \(isSingleMode\) renderSingleProfileHint\(\);/);
  assert.match(src, /else renderShardHints\(\);/);
  assert.match(src, /链接：0\/0/);
  assert.match(src, /已点赞帖子/);
  assert.match(src, /已回复帖子/);
});

test('xiaohongshu tab persists and restores last config for default values', async () => {
  const src = await getSrc();
  assert.match(src, /XHS_LAST_CONFIG_KEY = 'webauto\.xhs\.lastConfig\.v1'/);
  assert.match(src, /const persistedConfig = readLastConfig\(\);/);
  assert.match(src, /applyPersistedValue\(keywordInput, persistedConfig\.keyword\)/);
  assert.match(src, /if \(typeof persistedConfig\.dryRun === 'boolean'\) dryRunCheckbox\.checked = persistedConfig\.dryRun/);
  assert.match(src, /const persistLastConfig = \(\) => \{/);
  assert.match(src, /writeLastConfig\(\{/);
});


test('xiaohongshu tab maps like-only results to like evidence directory', async () => {
  const src = await getSrc();
  assert.match(src, /const likeEvidenceDir = String\(evt\?\.likeEvidenceDir \|\| ''\)\.trim\(\);/);
  assert.match(src, /else if \(likeEvidenceDir\) current\.path = likeEvidenceDir;/);
  assert.match(src, /if \(!current\.path && likeEvidenceDir\) current\.path = likeEvidenceDir;/);
});


test('xiaohongshu tab enables OCR toggle and forwards ocr command', async () => {
  const src = await getSrc();
  assert.match(src, /图片 OCR（DeepSeek OCR）/);
  assert.match(src, /const ocrCommandInput = makeTextInput\('', 'OCR命令/);
  assert.match(src, /registerHistoryInput\(ocrCommandInput, 'ocrCommand'\)/);
  assert.match(src, /args\.push\('--ocr-command', String\(ocrCommandInput\.value \|\| ''\)\.trim\(\)\)/);
});

test('xiaohongshu tab aggregates multi-shard runIds within current session', async () => {
  const src = await getSrc();
  assert.match(src, /const activeUnifiedRunIds = new Set<string>\(\);/);
  assert.match(src, /const runDoneAgg = new Map<string, \{ processed: number; liked: number; replied: number \}>\(\);/);
  assert.match(src, /return tsMs \+ 2000 >= sessionStartMs;/);
  assert.match(src, /if \(activeUnifiedRunIds\.size > 0 && evtRunId && !activeUnifiedRunIds\.has\(evtRunId\)\) continue;/);
  assert.match(src, /if \(activeUnifiedRunIds\.size === 0 && evtRunId\) activeUnifiedRunIds\.add\(evtRunId\);/);
  assert.match(src, /if \(runId\) \{[\s\S]*runDoneAgg\.set\(runId,/);
  assert.match(src, /事件流\$\{shardHint\}：\$\{liveStats\.eventsPath\}/);
});
