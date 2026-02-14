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
const guidePath = path.join(__dirname, 'xiaohongshu', 'guide-browser-check.mts');

async function readText(filePath: string) {
  return readFile(filePath, 'utf8');
}

async function readAll() {
  const [entry, helper, layout, account, run, live, guide] = await Promise.all([
    readText(entryPath),
    readText(helperPath),
    readText(layoutPath),
    readText(accountPath),
    readText(runPath),
    readText(livePath),
    readText(guidePath),
  ]);
  return { entry, helper, layout, account, run, live, guide, all: [entry, helper, layout, account, run, live, guide].join('\n') };
}

test('xiaohongshu tab keeps orchestrate modes and run script wiring after modular split', async () => {
  const { entry, run, layout } = await readAll();
  assert.match(entry, /buildXhsLayout/);
  assert.match(entry, /createRunFlowController/);
  assert.match(layout, /phase1-phase2-unified/);
  assert.match(layout, /phase1-phase2/);
  assert.match(layout, /phase1-only/);
  assert.match(layout, /unified-only/);
  assert.match(run, /phase-orchestrate\.mjs/);
});

test('xiaohongshu module files are split and each stays under 500 lines', async () => {
  const files = [entryPath, helperPath, layoutPath, accountPath, runPath, livePath, guidePath];
  const lengths = await Promise.all(files.map(async (p) => String((await readText(p)).split(/\r?\n/g).length)));
  files.forEach((file, i) => {
    const lines = Number(lengths[i]);
    assert.ok(lines <= 500, `${path.basename(file)} has ${lines} lines`);
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
  assert.match(account, /profilepool\.mjs'/);
  assert.match(account, /'add', kw, '--json'/);
  assert.match(account, /'login-profile'/);
  assert.match(account, /cmdRunJson/);
  assert.match(account, /cmdSpawn/);
  assert.match(account, /await refreshProfileChoices\(targetProfile\)/);
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

test('xiaohongshu live stats uses cmd-event stream as single source', async () => {
  const { live } = await readAll();
  assert.match(live, /cmd-event/);
  assert.doesNotMatch(live, /fsReadTextTail/);
  assert.match(live, /const activeRunIds = new Set<string>\(\);/);
  assert.match(live, /noteProgressMatch/);
});

test('xiaohongshu run flow forwards ocr command and gate/reply guard', async () => {
  const { run, entry } = await readAll();
  assert.match(run, /if \(unifiedEnabled && replyToggle\.checked && !gateToggle\.checked\)/);
  assert.match(run, /jumpToAccountSetup\(\)/);
  assert.match(run, /jumpToKeywordSetup\(\)/);
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
  const { live } = await readAll();
  assert.match(live, /setExpectedLinksTarget: \(target: number\) => void/);
  assert.ok(live.includes('run-events(?:'));
  assert.ok(live.includes('Phase2Collect(?:Links)?'));
});

test('xiaohongshu guide account step always brings account tile into view before checks', async () => {
  const { entry } = await readAll();
  assert.match(entry, /accountStep\.onclick = \(\) => \{ focusTile\('account'\); void runInteractiveAccountCheck\(\); \};/);
});


test('xiaohongshu browser guide checks browser only once at startup', async () => {
  const { entry } = await readAll();
  assert.match(entry, /let startupBrowserChecked = false;/);
  assert.match(entry, /if \(startupBrowserChecked\) return void finalizeGuide\(\);/);
  assert.match(entry, /startupBrowserChecked = true;/);
});

test('xiaohongshu guide does not hard-block run button when not ready', async () => {
  const { entry } = await readAll();
  assert.match(entry, /startRunBtn\.textContent = allReady \? '开始运行' : '仍然开始运行';/);
  assert.match(entry, /runBtn\.disabled = false/);
});

test('xiaohongshu run flow only consumes stdout/stderr from current run id', async () => {
  const { run } = await readAll();
  assert.match(run, /if \(!localRunId\) return;/);
  assert.match(run, /if \(evtRunId && evtRunId !== localRunId\) return;/);
});
