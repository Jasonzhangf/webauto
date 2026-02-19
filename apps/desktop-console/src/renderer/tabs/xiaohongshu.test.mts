import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entryPath = path.join(__dirname, 'xiaohongshu.mts');
const helperPath = path.join(__dirname, 'xiaohongshu', 'helpers.mts');
const layoutPath = path.join(__dirname, 'xiaohongshu', 'layout-block.mts');
const accountPath = path.join(__dirname, 'xiaohongshu', 'account-flow.mts');
const runPath = path.join(__dirname, 'xiaohongshu', 'run-flow.mts');
const livePath = path.join(__dirname, 'xiaohongshu', 'live-stats.mts');
const liveTypesPath = path.join(__dirname, 'xiaohongshu', 'live-stats', 'types.mts');
const liveParserPath = path.join(__dirname, 'xiaohongshu', 'live-stats', 'stdout-parser.mts');
const liveStatePatchPath = path.join(__dirname, 'xiaohongshu', 'live-stats', 'state-patch.mts');
const guidePath = path.join(__dirname, 'xiaohongshu', 'guide-browser-check.mts');

async function readText(filePath: string) {
  return readFile(filePath, 'utf8');
}

async function readAll() {
  const [entry, helper, layout, account, run, live, liveTypes, liveParser, liveStatePatch, guide] = await Promise.all([
    readText(entryPath),
    readText(helperPath),
    readText(layoutPath),
    readText(accountPath),
    readText(runPath),
    readText(livePath),
    readText(liveTypesPath),
    readText(liveParserPath),
    readText(liveStatePatchPath),
    readText(guidePath),
  ]);
  const liveAll = [live, liveTypes, liveParser, liveStatePatch].join('\n');
  return {
    entry,
    helper,
    layout,
    account,
    run,
    live,
    liveAll,
    liveTypes,
    liveParser,
    liveStatePatch,
    guide,
    all: [entry, helper, layout, account, run, live, liveTypes, liveParser, liveStatePatch, guide].join('\n'),
  };
}

test('xiaohongshu tab keeps orchestrate modes and run script wiring after modular split', async () => {
  const { entry, run, layout } = await readAll();
  assert.match(entry, /buildXhsLayout/);
  assert.match(entry, /createRunFlowController/);
  assert.match(entry, /xhs-tile--\$\{id\}/);
  assert.match(layout, /phase1-phase2-unified/);
  assert.match(layout, /phase1-phase2/);
  assert.match(layout, /phase1-only/);
  assert.match(layout, /unified-only/);
  assert.match(run, /xhs-orchestrate\.mjs/);
});

test('xiaohongshu layout uses bento grid cards for account and operation areas', async () => {
  const { layout, entry } = await readAll();
  assert.match(layout, /xhs-bento-grid/);
  assert.match(layout, /accountBento/);
  assert.match(layout, /commentBento/);
  assert.match(layout, /collectBento/);
  assert.match(layout, /\[boardTile\.tile, likeTile\.tile, runTile\.tile, accountTile\.tile, commentTile\.tile, collectTile\.tile\]/);
  assert.match(entry, /xhs-guide-grid/);
  assert.match(entry, /xhs-guide-step/);
});

test('xiaohongshu layout includes shard stats board section', async () => {
  const { layout } = await readAll();
  assert.match(layout, /分片进度（合并 \+ 明细）/);
  assert.match(layout, /const shardStatsList = createEl\('div'/);
});

test('xiaohongshu module files are split and each stays under maintainable line caps', async () => {
  const files = [
    entryPath,
    helperPath,
    layoutPath,
    accountPath,
    runPath,
    livePath,
    liveTypesPath,
    liveParserPath,
    liveStatePatchPath,
    guidePath,
  ];
  const lengths = await Promise.all(files.map(async (p) => String((await readText(p)).split(/\r?\n/g).length)));
  files.forEach((file, i) => {
    const lines = Number(lengths[i]);
    assert.ok(lines <= 800, `${path.basename(file)} has ${lines} lines`);
  });
});

test('xiaohongshu layout imports stringifyLikeRule helper used by rule chips', async () => {
  const { layout } = await readAll();
  assert.match(layout, /stringifyLikeRule/);
  assert.match(layout, /from '\.\/helpers\.mjs'/);
});

test('xiaohongshu keeps homepage toggle wiring between layout and tab orchestration', async () => {
  const { entry, layout } = await readAll();
  assert.match(layout, /homepageToggle/);
  assert.match(layout, /imagesToggle/);
  assert.match(entry, /homepageToggle/);
  assert.match(entry, /imagesToggle/);
});

test('xiaohongshu keeps preferred profile selectors and shard args', async () => {
  const { entry, run, layout } = await readAll();
  assert.match(layout, /const profilePickSel = createEl\('select'/);
  assert.match(layout, /const shardProfilesBox = createEl\('div'/);
  assert.match(entry, /getSelectedShardProfiles/);
  assert.match(entry, /void refreshProfileChoices\(\);/);
  assert.match(run, /profileArgs\.push\('--profiles', shardProfiles\.join\(','\)\)/);
  assert.match(run, /profileArgs\.push\('--profile', singleProfile\)/);
});

test('xiaohongshu history helper supports autocomplete and hotkey delete', async () => {
  const { helper, run } = await readAll();
  assert.match(helper, /INPUT_HISTORY_MAX = 10/);
  assert.match(helper, /bindInputHistory\(input: HTMLInputElement, key: string/);
  assert.match(helper, /input\.setAttribute\('list', safeId\)/);
  assert.match(helper, /evt\.ctrlKey && evt\.shiftKey && evt\.key === 'Backspace'/);
  assert.match(run, /persistHistoryFns\.forEach\(\(persist\) => persist\(\)\)/);
});

test('xiaohongshu persists and restores last config via helper storage', async () => {
  const { helper, entry } = await readAll();
  assert.match(helper, /XHS_LAST_CONFIG_KEY = 'webauto\.xhs\.lastConfig\.v1'/);
  assert.match(entry, /const persistedConfig = readLastConfig\(\);/);
  assert.match(entry, /writeLastConfig\(\{/);
  assert.match(entry, /bindLikeRulePersistence\(\{/);
});

test('xiaohongshu add-account flow creates profile then starts login-profile run', async () => {
  const { account } = await readAll();
  assert.match(account, /apps', 'webauto', 'entry', 'profilepool\.mjs'/);
  assert.match(account, /'add', kw, '--json'/);
  assert.match(account, /'login-profile'/);
  assert.match(account, /cmdRunJson/);
  assert.match(account, /cmdSpawn/);
  assert.match(account, /await refreshProfileChoices\(targetProfile\)/);
  assert.doesNotMatch(account, /--browser-service/);
});

test('xiaohongshu account flow uses one fixed profile naming prefix', async () => {
  const { account } = await readAll();
  assert.match(account, /export function extractBatchBase\(_profileId: string\): string/);
  assert.match(account, /export function inferDefaultBatchBase\(_currentProfileId: string, _latestProfiles: string\[\]\): string/);
  assert.match(account, /const resolveAddBatchPrefix = \(\): string => \{\s*return XHS_DEFAULT_BATCH_KEY;/);
  assert.match(account, /setNavHint\(`Account IDs use fixed pattern: \$\{XHS_DEFAULT_BATCH_KEY\}-N`\);/);
});

test('xiaohongshu account flow auto-selects single profile in shard list', async () => {
  const { account } = await readAll();
  assert.match(account, /profiles\.length === 1 && prevSelected\.size === 0/);
});

test('xiaohongshu account flow deduplicates profile ids before render and audit', async () => {
  const { account } = await readAll();
  assert.match(account, /const uniqueProfileIds = \(items: string\[\]\) => \{/);
  assert.match(account, /const isNewFormatProfileId = \(id: string\) => \/\.\+-batch-\\d\+\$\/\.test/);
  assert.match(account, /let refreshSeq = 0;/);
  assert.match(account, /const seq = \+\+refreshSeq;/);
  assert.match(account, /if \(seq !== refreshSeq\) return;/);
  assert.match(account, /const profiles: string\[\] = uniqueProfileIds\(entries\.map/);
  assert.match(account, /filter\(isNewFormatProfileId\)/);
  assert.match(account, /const uniqueProfiles = uniqueProfileIds\(profiles\);/);
});

test('xiaohongshu consumes preflight navigation target and checks browser with runJson when available', async () => {
  const { entry, guide } = await readAll();
  assert.match(entry, /consumeNavTarget/);
  assert.match(entry, /runGuideBrowserCheck/);
  assert.match(guide, /XHS_NAV_TARGET_KEY/);
  assert.match(guide, /'--check-browser-only'/);
  assert.match(guide, /cmdRunJson/);
});

test('xiaohongshu account check uses browser-status probe without confirm dialog', async () => {
  const { entry } = await readAll();
  assert.match(entry, /browser-status\.mjs/);
  assert.match(entry, /const runBrowserStatusCheck = async/);
  assert.doesNotMatch(entry, /window\.confirm/);
});

test('xiaohongshu live stats combines cmd-event and state-update streams', async () => {
  const { liveAll } = await readAll();
  assert.match(liveAll, /state\+cmd-event/);
  assert.doesNotMatch(liveAll, /fsReadTextTail/);
  assert.match(liveAll, /const activeRunIds = new Set<string>\(\);/);
  assert.match(liveAll, /window\.api\?\.onStateUpdate/);
  assert.match(liveAll, /noteProgressMatch/);
});

test('xiaohongshu run flow forwards ocr command and gate/reply guard', async () => {
  const { run, entry } = await readAll();
  assert.match(run, /if \(unifiedEnabled && replyToggle\.checked && !gateToggle\.checked\)/);
  assert.match(run, /jumpToAccountSetup\(\)/);
  assert.match(run, /jumpToKeywordSetup\(\)/);
  assert.match(run, /--no-dry-run/);
  assert.match(run, /\[ui-run-flags\] dryRun=\$\{dryRunCheckbox\.checked\} doLikes=\$\{likesToggle\.checked\}/);
  assert.match(run, /--do-ocr/);
  assert.match(run, /--ocr-command/);
  assert.match(run, /--match-keywords/);
  assert.match(entry, /focusAccountSetup/);
  assert.match(entry, /focusKeywordSetup/);
});


test('xiaohongshu run flow keeps logs shortcut in action row', async () => {
  const { run } = await readAll();
  assert.match(run, /const logsBtn = createEl\('button', \{ type: 'button', className: 'secondary' \}, \['日志'\]\)/);
  assert.match(run, /api\.setActiveTab\('logs'\)/);
  assert.match(run, /setExpectedLinksTarget\(/);
});

test('xiaohongshu live stats parser accepts rotated events files and phase2 progress lines', async () => {
  const { liveAll } = await readAll();
  assert.match(liveAll, /setExpectedLinksTarget: \(target: number\) => void/);
  assert.ok(liveAll.includes('run-events(?:'));
  assert.ok(liveAll.includes('Phase2Collect(?:Links)?'));
  assert.ok(liveAll.includes('liveStats.linksTarget = Math.max(liveStats.linksTarget, normalized);'));
  assert.ok(liveAll.includes('Like Gate:'));
  assert.ok(liveAll.includes("const readToken = (key: string) =>"));
  assert.ok(liveAll.includes("const ruleHits = readToken('ruleHits');"));
  assert.ok(liveAll.includes("const dedupSkipped = readToken('dedup');"));
  assert.ok(liveAll.includes("const alreadyLikedSkipped = readToken('alreadyLiked');"));
  assert.ok(liveAll.includes("const newLikes = readToken('newLikes');"));
  assert.ok(liveAll.includes("const likedTotalMatch = text.match(/likedTotal=(\\d+)\\s*\\/\\s*(\\d+)/i);"));
});

test('xiaohongshu live stats surfaces phase2 block and fatal reasons on board', async () => {
  const { liveAll } = await readAll();
  assert.match(liveAll, /Rigid gate blocked click index=/);
  assert.match(liveAll, /阻断原因：/);
  assert.match(liveAll, /Post-click gate FAILED/);
  assert.match(liveAll, /Click strategy failed:/);
  assert.match(liveAll, /Click strategy no-open:/);
  assert.match(liveAll, /Phase\\s\*2\\s\*失败/);
});

test('xiaohongshu layout and live stats include like-skip metrics', async () => {
  const { layout, entry, liveAll } = await readAll();
  assert.match(layout, /点赞跳过：0/);
  assert.match(layout, /likesSkipStat/);
  assert.match(entry, /likesSkipStat/);
  assert.match(liveAll, /点赞跳过：\$\{merged\.likesSkippedTotal\}/);
  assert.match(liveAll, /跳过明细：去重/);
});

test('xiaohongshu guide account step always brings account tile into view before checks', async () => {
  const { entry } = await readAll();
  assert.match(entry, /accountStep\.onclick = \(\) => \{ focusTile\('account'\); void runInteractiveAccountCheck\(\); \};/);
});


test('xiaohongshu browser guide checks browser only once at startup', async () => {
  const { entry } = await readAll();
  assert.match(entry, /let startupBrowserChecked = false;/);
  assert.match(entry, /let startupBrowserCheckDone = false;/);
  assert.match(entry, /let browserCheckAttempted = false;/);
  assert.match(entry, /if \(startupBrowserChecked\) return void finalizeGuide\(\);/);
  assert.match(entry, /if \(browserCheckAttempted \|\| startupBrowserCheckDone \|\| guideState\.browserReady\) return;/);
  assert.match(entry, /startupBrowserCheckDone = true;/);
  assert.match(entry, /startupBrowserChecked = true;/);
});

test('xiaohongshu guide does not hard-block run button when not ready', async () => {
  const { entry } = await readAll();
  assert.match(entry, /guideCard\.style\.display = allReady \? 'none' : '';/);
  assert.match(entry, /startRunBtn\.textContent = '仍然开始运行';/);
  assert.match(entry, /if \(!runBtn\.disabled\) \{\s*runBtn\.title = allReady \? '' : '引导未完成，仍可直接运行';/);
});

test('xiaohongshu run flow only consumes stdout/stderr from current run id', async () => {
  const { run } = await readAll();
  assert.match(run, /if \(!localRunId\) return;/);
  assert.match(run, /if \(evtRunId && evtRunId !== localRunId\) return;/);
});

test('xiaohongshu run flow resets board before binding run id and keeps live-stats subscription after exit', async () => {
  const { run } = await readAll();
  assert.match(run, /liveStats\.resetLiveStats\(\);\s*liveStats\.setActiveRunId\(localRunId\);/);
  assert.match(run, /if \(runMode !== 'phase1-only' && Number\.isFinite\(targetNum\) && targetNum > 0\) \{\s*liveStats\.setExpectedLinksTarget\(targetNum\);/);
  assert.match(run, /if \(eventType === 'exit'\) \{\s*const exitedRunId = localRunId;/);
  assert.match(run, /liveStats\.parseStdoutForEvents\(\s*`\[rid:\$\{evtRunId \|\| localRunId\}\] \[exit\] code=\$\{evt\?\.exitCode \?\? 'null'\} signal=\$\{evt\?\.signal \?\? 'null'\}`,/);
  assert.match(run, /void recoverRunFromStateTasks\(\)\.then\(\(restored\) => \{\s*if \(!restored \|\| restored === exitedRunId\) setRunningUi\(false\);/);
  assert.doesNotMatch(run, /if \(eventType === 'exit'\) \{\s*liveStats\.dispose\(\);/);
});

test('xiaohongshu run flow restores running runId after tab re-entry and updates run button label', async () => {
  const { run } = await readAll();
  assert.match(run, /const resolveRunningXhsRunId = \(\) => \{/);
  assert.match(run, /const restoredRunId = resolveRunningXhsRunId\(\);/);
  assert.match(run, /runBtn\.textContent = running \? '编排运行中\.\.\.' : '开始执行编排';/);
  assert.match(run, /runBtn\.disabled = running/);
});

test('xiaohongshu live stats accepts prefixed rid and allows progress\/stats updates from related run ids', async () => {
  const { liveAll } = await readAll();
  assert.match(liveAll, /const prefixedRid = rawText\.match\(\/\^\\\[rid:/);
  assert.match(liveAll, /运行账号 \$\{shardItems\.length\} · 运行中 \$\{runningCount\} · 异常 \$\{errorCount\}/);
  assert.match(liveAll, /阶段 \$\{item\.phase \|\| '未知'\} · 状态 \$\{statusLabel\(item\)\} · 动作 \$\{item\.action \|\| '等待日志'\}/);
  assert.match(liveAll, /异常：\$\{item\.anomaly\}/);
  assert.match(liveAll, /const looksProgress =/);
  assert.match(liveAll, /const looksStats =/);
  assert.match(liveAll, /if \(activeRunIds\.size > 0 && !activeRunIds\.has\(rid\) && !\(looksProgress \|\| looksStats\)\) return;/);
  assert.match(liveAll, /const t = String\(update\?\.type \|\| ''\)\.trim\(\);/);
  assert.match(liveAll, /if \(t === 'progress'\) \{\s*applyStatePatch\(runtime, \{ progress: patch \}, rid\);/);
  assert.match(liveAll, /else if \(t === 'stats'\) \{\s*applyStatePatch\(runtime, \{ stats: patch \}, rid\);/);
  assert.match(liveAll, /const shardStats = new Map<string, ShardProgress>\(\);/);
  assert.match(liveAll, /const renderShardStats = \(\) => \{/);
  assert.match(liveAll, /setShardProfiles: \(profiles: string\[\]\) => void/);
});
