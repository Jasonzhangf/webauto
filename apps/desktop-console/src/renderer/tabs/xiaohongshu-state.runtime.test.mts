import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  applyConfigToUI,
  bindDependentToggle,
  bindToggleVisibility,
  buildRunArgs,
  computeEffectiveFlags,
  getDefaultConfig,
  initUIFromPersistence,
  parseLikeRules,
  parseLikeRuleToken,
  persistConfig,
  readConfigFromUI,
  serializeLikeRules,
  stringifyLikeRule,
  syncVisibility,
  type XhsControls,
} from './xiaohongshu-state.mts';
import { setupDom, type DomHarness } from '../test-dom.mts';

let dom: DomHarness;

function createControls(): XhsControls {
  const el = dom.document;
  const mkInput = (value = '') => {
    const i = el.createElement('input');
    i.value = value;
    return i;
  };
  const mkSelect = (value = '') => {
    const s = el.createElement('select');
    s.value = value;
    return s;
  };
  const mkDiv = () => el.createElement('div');
  const shardProfileSelect = el.createElement('select');
  shardProfileSelect.multiple = true;
  const optA = el.createElement('option');
  optA.value = 'xhs-0';
  optA.selected = true;
  shardProfileSelect.appendChild(optA);

  const envSelect = mkSelect();
  envSelect.appendChild(Object.assign(el.createElement('option'), { value: 'debug', textContent: 'debug' }));
  envSelect.appendChild(Object.assign(el.createElement('option'), { value: 'prod', textContent: 'prod' }));
  envSelect.value = 'debug';
  const accountModeSelect = mkSelect();
  accountModeSelect.appendChild(Object.assign(el.createElement('option'), { value: 'single', textContent: 'single' }));
  accountModeSelect.appendChild(Object.assign(el.createElement('option'), { value: 'shard', textContent: 'shard' }));
  accountModeSelect.value = 'single';
  const matchModeSelect = mkSelect();
  matchModeSelect.appendChild(Object.assign(el.createElement('option'), { value: 'any', textContent: 'any' }));
  matchModeSelect.appendChild(Object.assign(el.createElement('option'), { value: 'all', textContent: 'all' }));
  matchModeSelect.value = 'all';
  const opOrderSelect = mkSelect();
  opOrderSelect.appendChild(Object.assign(el.createElement('option'), { value: 'harvest_first', textContent: 'harvest_first' }));
  opOrderSelect.appendChild(Object.assign(el.createElement('option'), { value: 'like_first', textContent: 'like_first' }));
  opOrderSelect.value = 'like_first';

  return {
    orchestrateSelect: mkSelect('unified'),
    keywordInput: mkInput('deepseek'),
    envSelect,
    accountModeSelect,
    singleProfileSelect: mkSelect('xhs-0'),
    shardProfileSelect,
    maxNotesInput: mkInput('120'),
    dryRunCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    protocolModeCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    headlessCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    homepageCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    imagesCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    commentsCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    likesCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    replyCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: false }),
    ocrCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    gateCheckbox: Object.assign(mkInput(''), { type: 'checkbox', checked: true }),
    imagesSettings: mkDiv(),
    commentsSettings: mkDiv(),
    likesSettings: mkDiv(),
    replySettings: mkDiv(),
    ocrSettings: mkDiv(),
    gateSettings: mkDiv(),
    maxCommentsInput: mkInput('88'),
    commentRoundsInput: mkInput('3'),
    matchKeywordsInput: mkInput('牛逼'),
    matchModeSelect,
    matchMinHitsInput: mkInput('2'),
    maxLikesInput: mkInput('10'),
    likeRulesContainer: mkDiv(),
    replyTextInput: mkInput('你好'),
    ocrCommandInput: mkInput('ocr-cmd'),
    opOrderSelect,
  } as unknown as XhsControls;
}

beforeEach(() => {
  dom = setupDom();
});

afterEach(() => {
  dom.cleanup();
});

test('default config and effective flags enforce dependencies', () => {
  const cfg = getDefaultConfig();
  assert.equal(cfg.opOrder, 'harvest_first');
  const flags = computeEffectiveFlags({
    ...cfg,
    doHomepage: false,
    doImages: true,
    doComments: false,
    doLikes: true,
    doGate: true,
    doOcr: true,
  });
  assert.equal(flags.doImages, false);
  assert.equal(flags.doComments, true);
  assert.equal(flags.doGate, true);
  assert.equal(flags.doOcr, true);
});

test('like rule serialization and parse support structured tokens', () => {
  const raw = serializeLikeRules([
    { kind: 'contains', a: 'A' },
    { kind: 'and', a: 'B', b: 'C' },
    { kind: 'include_without', a: 'D', b: 'E' },
  ]);
  assert.match(raw, /\{B \+ C\}/);
  const parsed = parseLikeRules(raw);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parseLikeRuleToken('{ A + B }'), { kind: 'and', a: 'A', b: 'B' });
  assert.deepEqual(parseLikeRuleToken('{ A - B }'), { kind: 'include_without', a: 'A', b: 'B' });
  assert.equal(stringifyLikeRule({ kind: 'contains', a: 'Z' }), 'Z');
});

test('buildRunArgs converts config to cli flags', () => {
  const cfg = getDefaultConfig();
  cfg.keyword = 'seedance2.0';
  cfg.doLikes = true;
  cfg.doGate = true;
  cfg.doImages = true;
  cfg.doHomepage = true;
  cfg.doOcr = true;
  cfg.matchKeywords = '真牛逼';
  cfg.likeRules = [{ kind: 'and', a: '真', b: '牛逼' }];
  const args = buildRunArgs(cfg);
  assert.ok(args.includes('--keyword'));
  assert.ok(args.includes('--do-likes'));
  assert.ok(args.includes('--do-ocr'));
  assert.ok(args.includes('--do-gate'));
  assert.ok(args.includes('--like-rules'));
});

test('UI config read/apply/visibility and persistence pipeline works', () => {
  const controls = createControls();
  const cfg = readConfigFromUI(controls);
  assert.equal(cfg.keyword, 'deepseek');
  assert.equal(cfg.maxNotes, 120);
  assert.equal(cfg.matchMode, 'all');

  persistConfig(cfg);
  initUIFromPersistence(controls, {
    imagesSettings: controls.imagesSettings,
    commentsSettings: controls.commentsSettings,
    likesSettings: controls.likesSettings,
    replySettings: controls.replySettings,
    ocrSettings: controls.ocrSettings,
    gateSettings: controls.gateSettings,
  });

  applyConfigToUI({
    keyword: 'new-kw',
    doReply: true,
    doLikes: false,
    doImages: false,
    doHomepage: false,
    doOcr: true,
  }, controls);
  assert.equal(controls.keywordInput.value, 'new-kw');

  const next = readConfigFromUI(controls);
  syncVisibility(next, {
    imagesSettings: controls.imagesSettings,
    commentsSettings: controls.commentsSettings,
    likesSettings: controls.likesSettings,
    replySettings: controls.replySettings,
    ocrSettings: controls.ocrSettings,
    gateSettings: controls.gateSettings,
  });
  assert.equal(controls.imagesSettings.style.display, 'none');
  assert.equal(controls.replySettings.style.display, '');
});

test('toggle binding utilities update dependent UI', async () => {
  const parent = dom.document.createElement('input');
  parent.type = 'checkbox';
  parent.checked = false;
  const child = dom.document.createElement('input');
  child.type = 'checkbox';
  const container = dom.document.createElement('div');

  bindDependentToggle(parent, child, container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(child.disabled, true);
  assert.equal(container.style.opacity, '0.5');

  parent.checked = true;
  parent.dispatchEvent(new dom.window.Event('change'));
  assert.equal(child.disabled, false);
  assert.equal(container.style.opacity, '1');

  const box = dom.document.createElement('input');
  box.type = 'checkbox';
  const panel = dom.document.createElement('div');
  bindToggleVisibility(box, panel);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(panel.style.display, 'none');
  box.checked = true;
  box.dispatchEvent(new dom.window.Event('change'));
  assert.equal(panel.style.display, '');
});
